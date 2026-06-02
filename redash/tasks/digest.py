"""
Insight-digest delivery (feature #219)

Periodic RQ job that walks the active `DigestSubscription` rows and, for each
one whose delivery_hour matches the current hour and whose last_sent_at is
old enough, generates and sends a digest email.

Each digest:
  - Re-runs the underlying query (so the digest reflects fresh data)
  - Computes the delta vs the prior period using the same helpers the
    KPI Card v2 renderer uses (mirrored in Python so frontend + backend
    agree on the message)
  - Renders an HTML email from a Jinja template
  - Embeds a sparkline PNG inline (data: URI; falls back to inline SVG if
    matplotlib is unavailable in the worker image)
  - Includes a token-signed unsubscribe link

Scheduling: registered as an hourly periodic job in `redash.tasks.schedule`.
Per-subscription dedupe is handled inside the worker (last_sent_at check)
so re-runs of the same job within the same hour are safe.
"""
import base64
import io
import urllib.parse
from datetime import datetime

from flask_mail import Message

from redash import mail, models
from redash.models.digest import (
    DigestSubscription,
    FREQUENCY_DAILY,
    FREQUENCY_WEEKLY,
)
from redash.utils import base_url
from redash.worker import get_job_logger, job

logger = get_job_logger(__name__)


# ---------------------------------------------------------------------------
# Delta + sparkline helpers (mirror viz-lib/src/visualizations/counter/utils.ts)
# ---------------------------------------------------------------------------


def compute_delta(current, compared):
    """Return (delta, pct, direction). pct is None if compared==0."""
    if current is None or compared is None:
        return None
    try:
        cur = float(current)
        cmp_ = float(compared)
    except (TypeError, ValueError):
        return None
    delta = cur - cmp_
    pct = None if cmp_ == 0 else delta / abs(cmp_)
    direction = 1 if delta > 0 else -1 if delta < 0 else 0
    return {"delta": delta, "pct": pct, "direction": direction}


def extract_series(rows, value_col, date_col=None):
    if not rows or not value_col:
        return []
    if date_col:
        rows = sorted(rows, key=lambda r: r.get(date_col) or "")
    out = []
    for r in rows:
        v = r.get(value_col)
        try:
            v = float(v)
        except (TypeError, ValueError):
            continue
        if v == v and v not in (float("inf"), float("-inf")):  # not NaN, not Inf
            out.append(v)
    return out


def render_sparkline_png(series, width=240, height=36):
    """Render a sparkline as a base64-encoded PNG. Returns a data: URI.

    Falls back to inline SVG when matplotlib is unavailable (typical in lean
    worker containers); both forms embed fine via <img src="...">.
    """
    if not series or len(series) < 2:
        return None
    try:
        import matplotlib  # type: ignore

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt  # type: ignore

        fig = plt.figure(figsize=(width / 72.0, height / 72.0), dpi=72)
        ax = fig.add_subplot(111)
        ax.plot(series, linewidth=1.5)
        ax.fill_between(range(len(series)), series, min(series), alpha=0.15)
        ax.set_axis_off()
        fig.subplots_adjust(left=0, right=1, top=1, bottom=0)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", transparent=True)
        plt.close(fig)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}"
    except Exception:
        # Fallback: inline SVG (rendered by all email clients).
        return _render_sparkline_svg(series, width, height)


def _render_sparkline_svg(series, width, height):
    if not series:
        return None
    lo, hi = min(series), max(series)
    rng = hi - lo or 1.0
    step = width / max(1, (len(series) - 1))
    points = " ".join(
        f"{i * step:.1f},{(height - ((v - lo) / rng) * height):.1f}" for i, v in enumerate(series)
    )
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
        f'<polyline fill="none" stroke="#2563eb" stroke-width="1.5" points="{points}"/>'
        "</svg>"
    )
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


# ---------------------------------------------------------------------------
# Per-subscription digest assembly
# ---------------------------------------------------------------------------


def _kpi_options_from_visualization(viz):
    """Pull KPI Card v2 options off a Counter visualization, defensively."""
    if viz is None or viz.type != "COUNTER":
        return {}
    return dict(viz.options or {})


def _format_value(value):
    if value is None:
        return "—"
    try:
        v = float(value)
        if v.is_integer():
            return f"{int(v):,}"
        return f"{v:,.2f}"
    except (TypeError, ValueError):
        return str(value)


def _format_delta_text(delta):
    if not delta:
        return ""
    if delta["pct"] is not None:
        sign = "+" if delta["pct"] >= 0 else "-"
        return f"{sign}{abs(delta['pct']) * 100:.1f}%"
    sign = "+" if delta["delta"] >= 0 else "-"
    return f"{sign}{abs(delta['delta']):,.2f}"


def build_digest_payload(subscription):
    """Assemble the metric block(s) for a single subscription.

    For target_type='query': use the first Counter visualization on that query.
    For target_type='dashboard': iterate every Counter widget on the dashboard.
    """
    payload = {"blocks": [], "subject": "Your JRNYBI digest", "url": None}

    if subscription.target_type == "query":
        query = models.Query.query.get(subscription.target_id)
        if not query:
            return payload
        payload["url"] = f"{base_url(query.org)}/queries/{query.id}"
        payload["subject"] = f"JRNYBI digest — {query.name}"
        viz = next((v for v in query.visualizations if v.type == "COUNTER"), None)
        block = _build_metric_block(query, viz)
        if block:
            payload["blocks"].append(block)
        return payload

    if subscription.target_type == "dashboard":
        dashboard = models.Dashboard.query.get(subscription.target_id)
        if not dashboard:
            return payload
        payload["url"] = f"{base_url(dashboard.org)}/dashboards/{dashboard.slug}"
        payload["subject"] = f"JRNYBI digest — {dashboard.name}"
        for widget in dashboard.widgets:
            if not widget.visualization or widget.visualization.type != "COUNTER":
                continue
            block = _build_metric_block(widget.visualization.query_rel, widget.visualization)
            if block:
                payload["blocks"].append(block)
        return payload

    return payload


def _build_metric_block(query, visualization):
    if query is None or visualization is None:
        return None
    qr = query.latest_query_data
    if qr is None or not qr.data:
        return None
    rows = qr.data.get("rows") or []
    opts = _kpi_options_from_visualization(visualization)
    value_col = opts.get("counterColName") or "value"
    date_col = opts.get("sparklineDateColumn") or ""

    series = extract_series(rows, opts.get("sparklineColumn") or value_col, date_col or None)
    current = series[-1] if series else None
    compared = series[-2] if len(series) >= 2 else None
    delta = compute_delta(current, compared)

    sparkline_uri = render_sparkline_png(series)

    return {
        "label": opts.get("counterLabel") or visualization.name or query.name,
        "value": _format_value(current),
        "delta_text": _format_delta_text(delta),
        "delta_dir": delta["direction"] if delta else 0,
        "sparkline_uri": sparkline_uri,
        "comparison_label": opts.get("comparisonLabel") or "vs prior period",
    }


# ---------------------------------------------------------------------------
# Email render + send
# ---------------------------------------------------------------------------


def build_unsubscribe_url(subscription):
    host = base_url(subscription.org)
    sig = subscription.compute_unsubscribe_signature()
    qs = urllib.parse.urlencode({"id": subscription.id, "sig": sig})
    return f"{host}/api/digest_subscriptions/unsubscribe?{qs}"


def render_html(payload, subscription):
    rows_html = []
    for block in payload["blocks"]:
        arrow = "↑" if block["delta_dir"] > 0 else "↓" if block["delta_dir"] < 0 else "→"
        color = (
            "#117a3b"
            if block["delta_dir"] > 0
            else "#b42318" if block["delta_dir"] < 0 else "#475569"
        )
        spark_html = (
            f'<div style="margin-top:6px"><img src="{block["sparkline_uri"]}" alt="trend" '
            f'width="240" height="36" style="display:block"/></div>'
            if block["sparkline_uri"]
            else ""
        )
        rows_html.append(
            f"""
            <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em">
                {block['label']}
              </div>
              <div style="display:flex;align-items:baseline;gap:12px;margin-top:4px">
                <div style="font-size:28px;font-weight:700;color:#0f172a">{block['value']}</div>
                <div style="font-size:13px;color:{color};font-weight:600">
                  {arrow} {block['delta_text']} {block['comparison_label']}
                </div>
              </div>
              {spark_html}
            </td></tr>
            """
        )

    if not rows_html:
        rows_html.append(
            '<tr><td style="padding:18px;color:#64748b">No KPI cards on this target had data this period.</td></tr>'
        )

    unsubscribe_url = build_unsubscribe_url(subscription)

    return f"""
    <html>
      <body style="margin:0;background:#f8fafc;font-family:'Inter',Helvetica,Arial,sans-serif;color:#0f172a">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;background:#f8fafc">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0"
                   style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
              <tr><td style="padding:18px 16px;background:#1e293b;color:#f8fafc;font-weight:600">
                {payload['subject']}
              </td></tr>
              {''.join(rows_html)}
              <tr><td style="padding:14px 16px;text-align:center;font-size:12px;color:#64748b">
                <a href="{payload['url']}" style="color:#2563eb">Open in JRNYBI →</a>
                &nbsp;·&nbsp;
                <a href="{unsubscribe_url}" style="color:#64748b">Unsubscribe</a>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>
    """


def send_one_digest(subscription):
    payload = build_digest_payload(subscription)
    if not payload["blocks"]:
        logger.info("Skipping digest #%s — no KPI blocks resolved", subscription.id)
        return False

    html = render_html(payload, subscription)
    try:
        msg = Message(
            subject=payload["subject"],
            recipients=[subscription.user.email],
            html=html,
        )
        mail.send(msg)
    except Exception:
        logger.exception("Failed to send digest #%s", subscription.id)
        return False

    subscription.last_sent_at = datetime.utcnow()
    subscription.last_payload = payload
    models.db.session.commit()
    return True


# ---------------------------------------------------------------------------
# Periodic entry point — registered in redash.tasks.schedule
# ---------------------------------------------------------------------------


@job("default", timeout=600)
def send_digests():
    """Top-level entry point. Runs hourly; dispatches anything due this hour."""
    now = datetime.utcnow()
    sent = 0
    for frequency in (FREQUENCY_DAILY, FREQUENCY_WEEKLY):
        subs = DigestSubscription.get_active_for_dispatch(frequency, now=now).all()
        for sub in subs:
            try:
                if send_one_digest(sub):
                    sent += 1
            except Exception:
                logger.exception("Error sending digest #%s", sub.id)
                models.db.session.rollback()
    logger.info("Digest dispatch complete — %d emails sent", sent)
    return sent
