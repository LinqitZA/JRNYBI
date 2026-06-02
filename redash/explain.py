"""
"Explain this number" LLM service (feature #218).

The /api/explain endpoint (see redash.handlers.explain) accepts a small,
strongly-typed JSON payload describing a single metric value with its
comparison context and asks Anthropic Claude to produce a 2-4 sentence
plain-English explanation.

The LLM is intentionally constrained to the numbers we hand it — the system
prompt forbids invented figures, predictions, or named entities the payload
doesn't reference. This avoids the most common business-intelligence
hallucination mode ("Revenue is up because the Q3 marketing push…").

Cost control:

* Per-user sliding-window rate limit (Redis INCR + EXPIRE) — defaults to 60/hr.
* Deterministic SHA-256 cache key over the canonical payload (sorted keys);
  identical follow-up requests inside the cache TTL return the cached
  explanation, bypassing the LLM call entirely.

This module is import-safe even without `ANTHROPIC_API_KEY` — the handler is
responsible for short-circuiting with 503 when the feature is disabled.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

from redash import redis_connection, settings

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are a business intelligence assistant embedded inside the JRNY ERP "
    "reporting tool. You explain a single KPI value in plain English for a "
    "non-technical operator.\n\n"
    "Strict rules:\n"
    "1. ONLY use the numbers and labels provided in the user message. NEVER "
    "invent figures, percentages, entity names, or external context.\n"
    "2. Do not predict the future or recommend specific actions; describe "
    "what the data shows.\n"
    "3. If a comparison value is absent, do NOT compare to anything.\n"
    "4. If top contributing dimensions are provided, attribute the movement "
    "to them in proportion — do not over-attribute to a single contributor "
    "unless the data clearly supports it.\n"
    "5. Keep the response to 2-4 sentences. Use active voice. No bullet "
    "points. No headers. No emoji.\n"
    "6. Refer to the metric using the label the user provided."
)


# ---------------------------------------------------------------------------
# Payload normalisation
# ---------------------------------------------------------------------------

ALLOWED_PAYLOAD_KEYS = {
    "metric_label",
    "metric_value",
    "value_format",
    "comparison_label",
    "comparison_value",
    "delta_abs",
    "delta_pct",
    "threshold_label",
    "time_range",
    "top_contributors",
    "extra_context",
    "query_id",
    "visualization_id",
}


def normalise_payload(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Whitelist + light-coerce the incoming JSON.

    We keep the schema small and explicit so we can stamp it into a cache key
    and trust we're never sending random user data to the LLM.
    """
    if not isinstance(raw, dict):
        raise ValueError("payload must be a JSON object")
    out: Dict[str, Any] = {}
    for key in ALLOWED_PAYLOAD_KEYS:
        if key in raw and raw[key] is not None:
            out[key] = raw[key]

    if "metric_label" not in out or not str(out["metric_label"]).strip():
        raise ValueError("metric_label is required")
    if "metric_value" not in out:
        raise ValueError("metric_value is required")

    # Coerce numbers where appropriate.
    for k in ("metric_value", "comparison_value", "delta_abs", "delta_pct"):
        if k in out:
            try:
                out[k] = float(out[k])
            except (TypeError, ValueError):
                raise ValueError(f"{k} must be a number")

    # Bound the top_contributors list. The LLM doesn't need a long list and
    # we don't want callers ballooning the prompt + cache key.
    if "top_contributors" in out:
        contribs = out["top_contributors"]
        if not isinstance(contribs, list):
            raise ValueError("top_contributors must be an array")
        cleaned: List[Dict[str, Any]] = []
        for item in contribs[:10]:
            if not isinstance(item, dict):
                continue
            entry: Dict[str, Any] = {}
            for sub_key in ("dimension", "label", "value", "share_pct"):
                if sub_key in item and item[sub_key] is not None:
                    entry[sub_key] = item[sub_key]
            if entry:
                cleaned.append(entry)
        out["top_contributors"] = cleaned

    # Truncate long strings so a malicious caller can't blow up the prompt.
    for k in ("metric_label", "comparison_label", "threshold_label",
              "time_range", "value_format", "extra_context"):
        if k in out and isinstance(out[k], str):
            out[k] = out[k][:200]

    return out


# ---------------------------------------------------------------------------
# Cache + rate limit
# ---------------------------------------------------------------------------

CACHE_PREFIX = "explain:cache:"
RATE_PREFIX = "explain:rate:"


def cache_key(payload: Dict[str, Any]) -> str:
    """SHA-256 over canonical JSON. Keep it deterministic across processes."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return CACHE_PREFIX + digest


def get_cached(payload: Dict[str, Any]) -> Optional[str]:
    try:
        raw = redis_connection.get(cache_key(payload))
    except Exception:  # pragma: no cover — redis transient errors
        logger.exception("explain cache lookup failed")
        return None
    if raw is None:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    return raw


def store_cached(payload: Dict[str, Any], explanation: str, ttl: int) -> None:
    if ttl <= 0:
        return
    try:
        redis_connection.set(cache_key(payload), explanation, ex=ttl)
    except Exception:  # pragma: no cover
        logger.exception("explain cache store failed")


def check_rate_limit(user_id: int, limit_per_hour: int) -> Tuple[bool, int]:
    """Return (allowed, current_count). Uses a one-hour bucket per user."""
    if limit_per_hour <= 0:
        return True, 0
    bucket = int(time.time() // 3600)
    key = f"{RATE_PREFIX}{user_id}:{bucket}"
    try:
        current = redis_connection.incr(key)
        # First call in the bucket — set TTL to slightly over an hour so the
        # key cleans itself up after the window expires.
        if current == 1:
            redis_connection.expire(key, 3700)
    except Exception:  # pragma: no cover
        logger.exception("explain rate limit check failed (fail-open)")
        return True, 0
    return current <= limit_per_hour, int(current)


# ---------------------------------------------------------------------------
# Prompt + Anthropic call
# ---------------------------------------------------------------------------


def build_user_prompt(payload: Dict[str, Any]) -> str:
    """Render the normalised payload as a deterministic user-message body."""
    lines: List[str] = []
    lines.append(f"Metric: {payload['metric_label']}")
    lines.append(f"Current value: {_fmt_number(payload['metric_value'])}")
    if "value_format" in payload:
        lines.append(f"Display format: {payload['value_format']}")
    if "time_range" in payload:
        lines.append(f"Time range: {payload['time_range']}")

    if "comparison_label" in payload or "comparison_value" in payload:
        cmp_label = payload.get("comparison_label", "comparison")
        if "comparison_value" in payload:
            lines.append(
                f"{cmp_label}: {_fmt_number(payload['comparison_value'])}"
            )
        else:
            lines.append(f"Comparison: {cmp_label}")
        if "delta_abs" in payload:
            lines.append(f"Delta (absolute): {_fmt_number(payload['delta_abs'])}")
        if "delta_pct" in payload:
            # delta_pct is a ratio (e.g. 0.082 = +8.2%). Render as percentage
            # so the LLM doesn't double-convert.
            pct = payload["delta_pct"] * 100.0
            sign = "+" if pct >= 0 else ""
            lines.append(f"Delta (percent): {sign}{pct:.2f}%")

    if "threshold_label" in payload:
        lines.append(f"Threshold band: {payload['threshold_label']}")

    contribs = payload.get("top_contributors") or []
    if contribs:
        lines.append("Top contributing dimensions:")
        for c in contribs:
            parts = []
            if c.get("dimension"):
                parts.append(str(c["dimension"]))
            if c.get("label"):
                parts.append(str(c["label"]))
            entry = " / ".join(parts) if parts else "(unnamed)"
            metrics = []
            if "value" in c:
                metrics.append(_fmt_number(c["value"]))
            if "share_pct" in c:
                metrics.append(f"{float(c['share_pct']) * 100:.1f}% of total")
            metrics_str = " — " + ", ".join(metrics) if metrics else ""
            lines.append(f"  - {entry}{metrics_str}")

    if "extra_context" in payload:
        lines.append(f"Additional context: {payload['extra_context']}")

    lines.append("")
    lines.append(
        "Write a 2-4 sentence explanation of this metric for a JRNY ERP user. "
        "Use only the numbers above."
    )
    return "\n".join(lines)


def _fmt_number(value: Any) -> str:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return str(value)
    if f == int(f):
        return f"{int(f):,}"
    return f"{f:,.4f}".rstrip("0").rstrip(".")


def call_anthropic(payload: Dict[str, Any]) -> str:
    """POST to Anthropic /v1/messages and return the assistant text.

    Raises requests.RequestException / ValueError on transport or schema
    errors so the handler can surface them as 502.
    """
    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")

    body = {
        "model": settings.EXPLAIN_MODEL,
        "max_tokens": settings.EXPLAIN_MAX_TOKENS,
        "system": SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": build_user_prompt(payload)}],
            }
        ],
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": settings.EXPLAIN_ANTHROPIC_VERSION,
        "content-type": "application/json",
    }

    response = requests.post(
        settings.EXPLAIN_ANTHROPIC_URL,
        json=body,
        headers=headers,
        timeout=settings.EXPLAIN_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    return extract_text(data)


def extract_text(response_body: Dict[str, Any]) -> str:
    """Pull the first text block out of an Anthropic messages response.

    The response shape is `{"content": [{"type": "text", "text": "..."}, ...]}`.
    """
    if not isinstance(response_body, dict):
        raise ValueError("Anthropic response was not a JSON object")
    blocks = response_body.get("content") or []
    if not isinstance(blocks, list):
        raise ValueError("Anthropic response.content must be a list")
    pieces: List[str] = []
    for blk in blocks:
        if isinstance(blk, dict) and blk.get("type") == "text":
            text = blk.get("text")
            if isinstance(text, str):
                pieces.append(text)
    out = "\n".join(pieces).strip()
    if not out:
        raise ValueError("Anthropic response contained no text blocks")
    return out
