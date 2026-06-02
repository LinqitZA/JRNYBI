/**
 * KPI Card v2 — option schema and defaults (feature #192)
 *
 * Backwards-compatible superset of the original Counter visualization options.
 * Existing dashboards with only legacy keys (`counterColName`, `rowNumber`,
 * `targetColName`, `stringDecimal`, ...) keep rendering with the legacy v1
 * layout — the v2 renderer activates only when one of the new keys
 * (`showSparkline`, `comparisonMode`, non-empty `thresholds`) is set.
 *
 * New keys (all optional):
 *   showSparkline        — render the mini trend strip under the big number
 *   sparklineColumn      — column of numbers to feed into the spark
 *   sparklineDateColumn  — optional ordering column (sorted ascending)
 *   sparklineVariant     — "line" | "bar" | "spots"
 *   sparklineColor       — semantic token ("primary" | "positive" | ...) OR
 *                          "auto" (follows the delta direction)
 *   comparisonMode       — "none" | "previous-period" | "prior-year"
 *                          | "custom-value" | "target-column"
 *   comparisonValue      — used when comparisonMode === "custom-value"
 *   comparisonLabel      — short label rendered next to the delta chip
 *                          (e.g. "vs prior week"). Defaults per mode.
 *   thresholds           — sorted-ascending array of {gte, color, label}
 *                          where color is a semantic token. The greatest
 *                          matching entry wins. Used for the background tint.
 *   trendColumn          — alias for sparklineColumn used when threshold
 *                          colour applies to the trend direction instead.
 *   tintBackground       — when true (default), the threshold color tints
 *                          the card background; when false, only the chip
 *                          is coloured.
 */

export type ComparisonMode =
  | "none"
  | "previous-period"
  | "prior-year"
  | "custom-value"
  | "target-column";

export type SparklineVariant = "line" | "bar" | "spots";

export type SemanticColorToken =
  | "primary"
  | "positive"
  | "negative"
  | "warning"
  | "neutral"
  | "info";

export interface CounterThreshold {
  /** Numeric value at or above which this entry applies (`-Infinity` = always). */
  gte: number;
  /** Semantic palette token used for the chip + optional background tint. */
  color: SemanticColorToken;
  /** Optional label shown next to the chip. */
  label?: string;
}

export interface CounterV2Options {
  // -------- legacy v1 fields (preserved verbatim) --------
  counterLabel?: string;
  counterColName?: string;
  rowNumber?: number;
  targetColName?: string;
  targetRowNumber?: number;
  countRow?: boolean;
  stringPrefix?: string;
  stringSuffix?: string;
  stringDecimal?: number;
  stringDecChar?: string;
  stringThouSep?: string;
  tooltipFormat?: string;
  formatTargetValue?: boolean;

  // -------- v2 additions --------
  showSparkline?: boolean;
  sparklineColumn?: string;
  sparklineDateColumn?: string;
  sparklineVariant?: SparklineVariant;
  sparklineColor?: SemanticColorToken | "auto";

  comparisonMode?: ComparisonMode;
  comparisonValue?: number;
  comparisonLabel?: string;

  thresholds?: CounterThreshold[];
  trendColumn?: string;
  tintBackground?: boolean;

  /** Show 1-2 sentence narrative below the spark (feature #217). */
  showNarrative?: boolean;
}

export const DEFAULT_OPTIONS: CounterV2Options = {
  // v1 defaults
  counterLabel: "",
  counterColName: "counter",
  rowNumber: 1,
  targetRowNumber: 1,
  stringDecimal: 0,
  stringDecChar: ".",
  stringThouSep: ",",
  tooltipFormat: "0,0.000",

  // v2 defaults — all OFF so existing widgets behave identically
  showSparkline: false,
  sparklineColumn: "",
  sparklineDateColumn: "",
  sparklineVariant: "line",
  sparklineColor: "auto",

  comparisonMode: "none",
  comparisonValue: 0,
  comparisonLabel: "",

  thresholds: [],
  trendColumn: "",
  tintBackground: true,

  showNarrative: false,
};

/**
 * Detect whether the saved options use any v2-specific feature. Used by the
 * renderer to decide between the legacy compact layout and the new card.
 */
export function isV2Enabled(options: CounterV2Options | undefined | null): boolean {
  if (!options) {
    return false;
  }
  if (options.showSparkline) {
    return true;
  }
  if (options.comparisonMode && options.comparisonMode !== "none") {
    return true;
  }
  if (Array.isArray(options.thresholds) && options.thresholds.length > 0) {
    return true;
  }
  if (options.showNarrative) {
    return true;
  }
  return false;
}

export default function getOptions(options: any): CounterV2Options {
  const merged: CounterV2Options = {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  };
  // Normalise thresholds: drop entries with non-finite gte, sort ascending.
  if (Array.isArray(merged.thresholds)) {
    merged.thresholds = merged.thresholds
      .filter((t) => t && typeof t === "object" && Number.isFinite(Number(t.gte)))
      .map((t) => ({ ...t, gte: Number(t.gte) }))
      .sort((a, b) => a.gte - b.gte);
  } else {
    merged.thresholds = [];
  }
  return merged;
}
