"""
"Explain this number" API (feature #218).

POST /api/explain

Request body (JSON):
    {
      "metric_label":      "Revenue (R)",          # required
      "metric_value":      1234567,                # required
      "value_format":      "currency",             # optional UI hint
      "comparison_label":  "vs prior week",        # optional
      "comparison_value":  1100000,                # optional
      "delta_abs":         134567,                 # optional
      "delta_pct":         0.122,                  # optional (ratio, NOT %)
      "threshold_label":   "Above target",         # optional
      "time_range":        "2026-05-25 .. 2026-06-01",
      "top_contributors":  [                       # optional, capped to 10
        {"dimension": "branch", "label": "JHB CBD", "value": 423100, "share_pct": 0.34}
      ],
      "extra_context":     "free-text",            # optional, capped at 200 chars
      "query_id":          42,                     # optional — surfaces in response
      "visualization_id":  17                      # optional — surfaces in response
    }

Response (200):
    {
      "explanation": "Revenue rose to 1,234,567, up +12.2% versus the prior week...",
      "model":       "claude-sonnet-4-5-20250929",
      "cached":      false,
      "source": { "query_id": 42, "visualization_id": 17 }
    }

Errors:
    400 — malformed payload (missing required field, bad number)
    429 — per-user rate limit exceeded
    502 — upstream Anthropic error
    503 — feature disabled (no ANTHROPIC_API_KEY or REDASH_EXPLAIN_FEATURE_ENABLED=false)
"""
import logging

import requests
from flask import request
from flask_restful import abort

from redash import explain as explain_svc
from redash import settings
from redash.handlers.base import BaseResource

logger = logging.getLogger(__name__)


class ExplainResource(BaseResource):
    """LLM-powered explanation for a single metric value.

    Auth is inherited from BaseResource (login_required). The Anthropic key is
    server-side only — the browser never sees it.
    """

    def post(self):
        if not settings.EXPLAIN_FEATURE_ENABLED or not settings.ANTHROPIC_API_KEY:
            abort(503, message="Explain feature is not configured on this server.")

        # Normalise + validate.
        payload = None
        try:
            payload = explain_svc.normalise_payload(request.get_json() or {})
        except ValueError as exc:
            abort(400, message=str(exc))
        assert payload is not None  # abort() raises

        # Per-user rate limit.
        allowed, count = explain_svc.check_rate_limit(
            self.current_user.id, settings.EXPLAIN_RATE_LIMIT_PER_HOUR
        )
        if not allowed:
            abort(
                429,
                message=(
                    f"Explain rate limit reached "
                    f"({settings.EXPLAIN_RATE_LIMIT_PER_HOUR}/hour). "
                    "Try again later."
                ),
            )

        # Cache lookup keyed on the normalised payload (NOT the user) — same
        # numbers from any user inside the org get the same answer.
        cached = explain_svc.get_cached(payload)
        if cached:
            self.record_event({
                "action": "explain",
                "object_type": "metric",
                "cached": True,
                "metric_label": payload.get("metric_label"),
            })
            return _envelope(payload, cached, cached=True)

        # Anthropic call.
        explanation = ""
        try:
            explanation = explain_svc.call_anthropic(payload)
        except requests.exceptions.Timeout:
            logger.warning("Anthropic timeout for metric=%s", payload.get("metric_label"))
            abort(502, message="Explanation service timed out. Please retry.")
        except requests.exceptions.HTTPError as exc:
            status = getattr(getattr(exc, "response", None), "status_code", 502)
            logger.warning("Anthropic HTTP %s: %s", status, exc)
            # Surface 429s from upstream as 429 so the caller can back off.
            if status == 429:
                abort(429, message="Explanation service is throttling. Please retry shortly.")
            abort(502, message="Explanation service returned an error.")
        except (requests.RequestException, ValueError) as exc:
            logger.exception("Anthropic call failed")
            abort(502, message=f"Explanation service failed: {exc}")

        # Cache + record. Failures here are non-fatal.
        explain_svc.store_cached(payload, explanation, settings.EXPLAIN_CACHE_TTL_SECONDS)
        self.record_event({
            "action": "explain",
            "object_type": "metric",
            "cached": False,
            "metric_label": payload.get("metric_label"),
            "rate_count": count,
        })
        return _envelope(payload, explanation, cached=False)


def _envelope(payload, explanation, cached):
    return {
        "explanation": explanation,
        "model": settings.EXPLAIN_MODEL,
        "cached": cached,
        "source": {
            "query_id": payload.get("query_id"),
            "visualization_id": payload.get("visualization_id"),
        },
    }
