/**
 * ExplainButton (feature #218)
 *
 * Icon-only button that lives in the top-right corner of a KPI card. Clicking
 * it pops a panel that fetches POST /api/explain with the current metric +
 * delta context and renders the LLM response inline.
 *
 * Designed to be:
 *   - Visual-only on the legacy v1 layout (kept off; v2 card embeds it).
 *   - Self-contained: no Redux, no Ant Design Drawer (kept inside Popover so
 *     the dashboard grid doesn't reflow).
 *   - Resilient: every failure mode (rate-limit, 503-not-configured,
 *     LLM 5xx) surfaces a readable message instead of crashing.
 *
 * Props mirror the /api/explain payload schema documented in
 * redash.handlers.explain.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import cx from "classnames";
import Popover from "antd/lib/popover";

export interface ExplainPayload {
  metric_label: string;
  metric_value: number;
  value_format?: string;
  comparison_label?: string;
  comparison_value?: number;
  delta_abs?: number;
  delta_pct?: number;
  threshold_label?: string;
  time_range?: string;
  top_contributors?: Array<{
    dimension?: string;
    label?: string;
    value?: number;
    share_pct?: number;
  }>;
  extra_context?: string;
  query_id?: number;
  visualization_id?: number;
}

export interface ExplainButtonProps {
  /** The payload describing the metric to explain. */
  payload: ExplainPayload;
  /** Optional URL for the "View source data" link (falls back to query_id). */
  sourceUrl?: string;
  /** Tooltip text for the trigger icon. */
  tooltip?: string;
  /** Optional class added to the trigger button. */
  className?: string;
  /** Optional fetch override for tests/storybook. */
  fetcher?: typeof fetch;
}

interface ExplainResponse {
  explanation: string;
  model: string;
  cached: boolean;
  source?: { query_id?: number | null; visualization_id?: number | null };
}

const DEFAULT_TOOLTIP = "Explain this number";
const ENDPOINT = "/api/explain";

/**
 * Tiny client. Keeps the call surface narrow so future migrations to a
 * shared axios instance / SWR / react-query are local.
 */
export async function fetchExplanation(
  payload: ExplainPayload,
  fetcher: typeof fetch = fetch
): Promise<ExplainResponse> {
  const res = await fetcher(ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body === "object") {
        message = (body as any).message || (body as any).error || message;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as ExplainResponse;
}

function deriveSourceUrl(payload: ExplainPayload, override?: string): string | null {
  if (override) return override;
  if (payload.query_id) return `/queries/${payload.query_id}/source`;
  return null;
}

export default function ExplainButton(props: ExplainButtonProps) {
  const { payload, tooltip = DEFAULT_TOOLTIP, className, fetcher, sourceUrl } = props;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cancel in-flight requests when the popover closes mid-call.
  const requestId = useRef(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setResult(null);
    const id = ++requestId.current;
    fetchExplanation(payload, fetcher)
      .then((res) => {
        if (id !== requestId.current) return;
        setResult(res);
      })
      .catch((err: Error & { status?: number }) => {
        if (id !== requestId.current) return;
        let msg = err.message || "Failed to load explanation";
        if (err.status === 503) {
          msg = "Explain is not configured on this server. Ask your admin to set ANTHROPIC_API_KEY.";
        } else if (err.status === 429) {
          msg = "Rate limit reached — try again in a few minutes.";
        }
        setError(msg);
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setLoading(false);
      });
  }, [payload, fetcher]);

  // Fetch every time the popover opens. We do NOT memoise across opens because
  // the underlying value may have changed (e.g. user switched dashboard tabs).
  useEffect(() => {
    if (open) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resolvedSourceUrl = deriveSourceUrl(payload, sourceUrl);

  const panel = (
    <div className="counter-v2-explain-panel" data-test="Explain.Panel" style={{ width: 320 }}>
      <div className="counter-v2-explain-heading">
        <span aria-hidden="true" style={{ marginRight: 6 }}>✨</span>
        Why this number?
      </div>
      {loading && (
        <div className="counter-v2-explain-loading" data-test="Explain.Loading">
          Thinking…
        </div>
      )}
      {!loading && error && (
        <div className="counter-v2-explain-error" data-test="Explain.Error" role="alert">
          {error}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="counter-v2-explain-retry"
              onClick={load}
              data-test="Explain.Retry">
              Retry
            </button>
          </div>
        </div>
      )}
      {!loading && !error && result && (
        <>
          <div className="counter-v2-explain-body" data-test="Explain.Body">
            {result.explanation}
          </div>
          <div className="counter-v2-explain-footer">
            <span className="counter-v2-explain-model" title={`Model: ${result.model}`}>
              {result.cached ? "Cached" : "Generated"} · {result.model.split("-").slice(0, 3).join("-")}
            </span>
            {resolvedSourceUrl && (
              <a
                href={resolvedSourceUrl}
                className="counter-v2-explain-source"
                data-test="Explain.SourceLink">
                View source data →
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <Popover
      visible={open}
      onVisibleChange={setOpen}
      content={panel}
      trigger="click"
      placement="bottomRight"
      destroyTooltipOnHide>
      <button
        type="button"
        aria-label={tooltip}
        title={tooltip}
        className={cx("counter-v2-explain-trigger", className)}
        data-test="Explain.Trigger"
        onClick={(e) => {
          // Stop the click bubbling so a parent click-to-drill widget doesn't
          // grab the same click and navigate away.
          e.stopPropagation();
        }}>
        <span aria-hidden="true">✨</span>
      </button>
    </Popover>
  );
}
