/**
 * Narrative template engine (feature #217)
 *
 * Generates a short 1-2 sentence English summary of a KPI: what the number
 * is now, whether it moved, in which direction, and any threshold context.
 *
 * Phase 1 (this module): pure template-based, deterministic, dependency-free
 * so it runs in the browser inline with the KPI card render. No network call.
 *
 * Phase 2 (separate feature): wire an optional LLM call (Anthropic) to
 * generate richer prose that references contributing dimensions, anomalies,
 * etc. The call would be made on the backend and cached against query
 * `result_id` so each card only triggers one generation per refresh.
 */

import numeral from "numeral";

import { CounterThreshold, SemanticColorToken } from "@/visualizations/counter/getOptions";
import { DeltaResult } from "@/visualizations/counter/utils";

export interface NarrativeInput {
  /** Human-readable label of the metric (e.g. "Revenue"). */
  metricLabel?: string;
  /** Current numeric value of the KPI, or null if unavailable. */
  currentValue?: number | null;
  /** Delta vs the comparison period, or null. */
  delta?: DeltaResult | null;
  /** Short label describing the comparison ("vs prior week"). */
  comparisonLabel?: string;
  /** Threshold the value crossed, if any. */
  threshold?: CounterThreshold | null;
}

/**
 * Format a delta as "+8.2%" / "-3 units" depending on whether a percentage
 * is available (compared-value of 0 yields no percentage). Caller-facing
 * helper — exported so tests can pin the format.
 */
export function formatDeltaForNarrative(delta: DeltaResult): string {
  if (delta.pct !== null) {
    const sign = delta.pct >= 0 ? "+" : "-";
    return sign + numeral(Math.abs(delta.pct)).format("0.0%");
  }
  const sign = delta.delta >= 0 ? "+" : "-";
  return sign + numeral(Math.abs(delta.delta)).format("0,0[.][00]");
}

function describeDirection(direction: 1 | 0 | -1): string {
  if (direction > 0) return "up";
  if (direction < 0) return "down";
  return "flat";
}

function thresholdSentence(threshold: CounterThreshold | null | undefined): string {
  if (!threshold) {
    return "";
  }
  const colorWord: Record<SemanticColorToken, string> = {
    positive: "in a healthy band",
    negative: "outside the acceptable band",
    warning: "in the warning band",
    neutral: "at a neutral level",
    info: "at a notable level",
    primary: "at a notable level",
  };
  if (threshold.label) {
    return ` Currently ${threshold.label}.`;
  }
  return ` Currently ${colorWord[threshold.color] || "at a notable level"}.`;
}

/**
 * Build the narrative sentence. Returns "" when there is no headline to
 * report (no current value).
 */
export default function generateNarrative(input: NarrativeInput): string {
  const { metricLabel, currentValue, delta, comparisonLabel, threshold } = input;

  if (currentValue === null || currentValue === undefined || !Number.isFinite(currentValue)) {
    return "";
  }

  const label = (metricLabel && metricLabel.trim()) || "Metric";
  const valueFmt = numeral(currentValue).format("0,0[.][00]");

  if (!delta) {
    // No comparison available — just describe the current value.
    return `${label} is ${valueFmt}.${thresholdSentence(threshold)}`;
  }

  const direction = describeDirection(delta.direction);
  const deltaFmt = formatDeltaForNarrative(delta);
  const ctx = comparisonLabel && comparisonLabel.trim() ? ` ${comparisonLabel}` : "";

  if (direction === "flat") {
    return `${label} is ${valueFmt}, unchanged${ctx}.${thresholdSentence(threshold)}`;
  }

  return `${label} is ${valueFmt}, ${direction} ${deltaFmt}${ctx}.${thresholdSentence(threshold)}`;
}
