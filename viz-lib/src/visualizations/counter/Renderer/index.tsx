/**
 * KPI Card v2 Renderer (feature #192)
 *
 * Two layouts in one component:
 *
 *   1. Legacy compact layout (kept verbatim for backwards compatibility) —
 *      activates when none of the v2 options are set. Big scaled number +
 *      optional target value below, trend-positive / trend-negative colour
 *      applied to the value text. This preserves every existing dashboard.
 *
 *   2. v2 Card layout — activates whenever any of {showSparkline,
 *      comparisonMode !== "none", thresholds.length > 0} is set. Layout:
 *
 *        ┌────────────────────────────────┐
 *        │ counterLabel                   │
 *        │                                │
 *        │  123,456     [↑ +8.2% vs last] │  ← big number + delta chip
 *        │                                │
 *        │  ▁▂▅▇▆▃▆▇▅ (sparkline)         │
 *        │                                │
 *        │  Narrative sentence here.      │  ← optional (feature #217)
 *        └────────────────────────────────┘
 *
 *      Background is tinted with the matching threshold colour when
 *      `tintBackground` is true.
 */

import React, { useEffect, useMemo, useState } from "react";
import cx from "classnames";
import { isFinite } from "lodash";

import resizeObserver from "@/services/resizeObserver";
import { RendererPropTypes } from "@/visualizations/prop-types";
import Sparkline from "@/components/Sparkline";

import { getCounterData, getCounterV2Data } from "../utils";
import { CounterV2Options, isV2Enabled, SemanticColorToken } from "../getOptions";
import generateNarrative from "@/lib/narrative";
import ExplainButton, { ExplainPayload } from "../ExplainButton";

import "../render.less";

// ---------------------------------------------------------------------------
// Legacy v1 helpers
// ---------------------------------------------------------------------------

function getCounterStyles(scale: any) {
  return {
    msTransform: `scale(${scale})`,
    MozTransform: `scale(${scale})`,
    WebkitTransform: `scale(${scale})`,
    transform: `scale(${scale})`,
  };
}

function getCounterScale(container: any) {
  if (!container || !container.firstChild) {
    return "1.00";
  }
  const inner = container.firstChild;
  const scale = Math.min(
    container.offsetWidth / inner.offsetWidth,
    container.offsetHeight / inner.offsetHeight
  );
  return Number(isFinite(scale) ? scale : 1).toFixed(2);
}

function LegacyLayout({ data, options, visualizationName }: any) {
  const [scale, setScale] = useState("1.00");
  const [container, setContainer] = useState<any>(null);

  useEffect(() => {
    if (container) {
      const unwatch = resizeObserver(container, () => {
        setScale(getCounterScale(container));
      });
      return unwatch;
    }
  }, [container]);

  useEffect(() => {
    if (container) {
      setScale(getCounterScale(container));
    }
  }, [data, options, container]);

  const {
    showTrend,
    trendPositive,
    counterValue,
    counterValueTooltip,
    targetValue,
    targetValueTooltip,
    counterLabel,
  } = getCounterData(data.rows, options, visualizationName) as any;

  return (
    <div
      className={cx("counter-visualization-container", {
        "trend-positive": showTrend && trendPositive,
        "trend-negative": showTrend && !trendPositive,
      })}>
      <div className="counter-visualization-content" ref={setContainer as any}>
        <div style={getCounterStyles(scale)}>
          <div className="counter-visualization-value" title={counterValueTooltip}>
            {counterValue}
          </div>
          {targetValue && (
            <div className="counter-visualization-target" title={targetValueTooltip}>
              ({targetValue})
            </div>
          )}
          <div className="counter-visualization-label">{counterLabel}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// v2 Card Layout
// ---------------------------------------------------------------------------

const ARROW_FOR_DIRECTION: Record<number, string> = {
  1: "↑",
  0: "→",
  [-1]: "↓",
};

function deltaSparklineColor(token: SemanticColorToken | "auto" | undefined, deltaToken: SemanticColorToken): SemanticColorToken {
  if (!token || token === "auto") {
    return deltaToken;
  }
  return token;
}

function CardLayout({ data, options, visualizationName, context }: any) {
  const v2 = useMemo(
    () => getCounterV2Data(data.rows || [], options as CounterV2Options, visualizationName),
    [data.rows, options, visualizationName]
  );

  const { delta, deltaColor, comparisonLabel, threshold, sparklineSeries, tintBackground } = v2;

  // Feature #218: build the /api/explain payload from the same v2 data we
  // already computed. The button itself defaults to ON whenever a v2 card
  // is rendering and we have a finite numeric value to explain. `options.
  // showExplain === false` opts out per-widget.
  const showExplain = options.showExplain !== false && isFinite(Number(v2.counterValueRaw));
  const explainPayload: ExplainPayload | null = showExplain
    ? {
        metric_label: v2.counterLabel || visualizationName || "Metric",
        metric_value: Number(v2.counterValueRaw),
        value_format: options.tooltipFormat || undefined,
        comparison_label: comparisonLabel || undefined,
        comparison_value:
          v2.comparisonValueRaw !== undefined && v2.comparisonValueRaw !== null
            ? Number(v2.comparisonValueRaw)
            : undefined,
        delta_abs: delta && Number.isFinite(delta.delta) ? delta.delta : undefined,
        delta_pct: delta && delta.pct !== null && delta.pct !== undefined ? delta.pct : undefined,
        threshold_label: threshold ? threshold.label || threshold.color : undefined,
        query_id: context && context.queryId ? Number(context.queryId) : undefined,
        visualization_id: context && context.visualizationId ? Number(context.visualizationId) : undefined,
      }
    : null;

  const sparklineColorToken = deltaSparklineColor(options.sparklineColor, deltaColor);

  const backgroundTint = threshold && tintBackground
    ? `var(--jrny-${threshold.color}-bg, transparent)`
    : "transparent";

  const direction = delta ? delta.direction : 0;
  const arrow = ARROW_FOR_DIRECTION[direction] || "→";

  const narrative = useMemo(() => {
    if (!options.showNarrative) return "";
    return generateNarrative({
      metricLabel: v2.counterLabel,
      currentValue: v2.counterValueRaw,
      delta: v2.delta,
      comparisonLabel: v2.comparisonLabel,
      threshold: v2.threshold,
    });
  }, [options.showNarrative, v2]);

  return (
    <div
      className={cx("counter-visualization-container counter-v2", `counter-v2-color-${deltaColor}`)}
      style={{ backgroundColor: backgroundTint }}
      data-test="Counter.V2.Card">
      {explainPayload && (
        <ExplainButton payload={explainPayload} />
      )}
      <div className="counter-v2-label" title={v2.counterLabel}>
        {v2.counterLabel}
      </div>

      <div className="counter-v2-row">
        <div className="counter-v2-value" title={v2.counterValueTooltip} data-test="Counter.V2.Value">
          {v2.counterValueFormatted}
        </div>

        {delta && (
          <div
            className={cx("counter-v2-delta-chip", `counter-v2-chip-${deltaColor}`)}
            data-test="Counter.V2.DeltaChip"
            title={`${arrow} ${v2.deltaValueFormatted ?? ""} ${v2.deltaPctFormatted ?? ""} ${comparisonLabel}`.trim()}>
            <span className="counter-v2-delta-arrow" aria-hidden="true">
              {arrow}
            </span>
            {v2.deltaPctFormatted && <span className="counter-v2-delta-pct">{v2.deltaPctFormatted}</span>}
            {!v2.deltaPctFormatted && v2.deltaValueFormatted && (
              <span className="counter-v2-delta-pct">{v2.deltaValueFormatted}</span>
            )}
            {comparisonLabel && <span className="counter-v2-delta-label">{comparisonLabel}</span>}
          </div>
        )}
      </div>

      {options.showSparkline && sparklineSeries.length > 0 && (
        <div className="counter-v2-sparkline" data-test="Counter.V2.Sparkline">
          <Sparkline
            data={sparklineSeries}
            variant={options.sparklineVariant || "line"}
            color={sparklineColorToken}
            fillColor={sparklineColorToken}
            width={240}
            height={36}
            ariaLabel={`${v2.counterLabel} trend`}
            style={{
              display: "block",
              width: "100%",
              height: "36px",
              opacity: 0.9,
            }}
          />
        </div>
      )}

      {options.showNarrative && narrative && (
        <div className="counter-v2-narrative" data-test="Counter.V2.Narrative">
          {narrative}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level entry point — picks v1 vs v2 based on options.
// ---------------------------------------------------------------------------

export default function Renderer(props: any) {
  if (isV2Enabled(props.options)) {
    return <CardLayout {...props} />;
  }
  return <LegacyLayout {...props} />;
}

Renderer.propTypes = RendererPropTypes;
