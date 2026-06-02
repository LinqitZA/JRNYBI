import { isNumber, isFinite, toString, sortBy } from "lodash";
import numeral from "numeral";

import {
  CounterThreshold,
  CounterV2Options,
  SemanticColorToken,
} from "./getOptions";

// TODO: allow user to specify number format string instead of delimiters only
// It will allow to remove this function (move all that weird formatting logic to a migration
// that will set number format for all existing counter visualization)
function numberFormat(value: any, decimalPoints: any, decimalDelimiter: any, thousandsDelimiter: any) {
  // Temporarily update locale data (restore defaults after formatting)
  const locale = numeral.localeData();
  const savedDelimiters = locale.delimiters;

  // Mimic old behavior - AngularJS `number` filter defaults:
  // - `,` as thousands delimiter
  // - `.` as decimal delimiter
  // - three decimal points
  locale.delimiters = {
    thousands: ",",
    decimal: ".",
  };
  let formatString = "0,0.000";
  if ((Number.isFinite(decimalPoints) && decimalPoints >= 0) || decimalDelimiter || thousandsDelimiter) {
    locale.delimiters = {
      thousands: thousandsDelimiter,
      decimal: decimalDelimiter || ".",
    };

    formatString = "0,0";
    if (decimalPoints > 0) {
      formatString += ".";
      while (decimalPoints > 0) {
        formatString += "0";
        decimalPoints -= 1;
      }
    }
  }
  const result = numeral(value).format(formatString);

  locale.delimiters = savedDelimiters;
  return result;
}

// 0 - special case, use first record
// 1..N - 1-based record number from beginning (wraps if greater than dataset size)
// -1..-N - 1-based record number from end (wraps if greater than dataset size)
function getRowNumber(index: any, rowsCount: any) {
  index = parseInt(index, 10) || 0;
  if (index === 0) {
    return index;
  }
  const wrappedIndex = (Math.abs(index) - 1) % rowsCount;
  return index > 0 ? wrappedIndex : rowsCount - wrappedIndex - 1;
}

function formatValue(value: any, { stringPrefix, stringSuffix, stringDecimal, stringDecChar, stringThouSep }: any) {
  if (isNumber(value)) {
    value = numberFormat(value, stringDecimal, stringDecChar, stringThouSep);
    return toString(stringPrefix) + value + toString(stringSuffix);
  }
  return toString(value);
}

function formatTooltip(value: any, formatString: any) {
  if (isNumber(value)) {
    return numeral(value).format(formatString);
  }
  return toString(value);
}

export function getCounterData(rows: any, options: any, visualizationName: any) {
  const result: any = {};
  const rowsCount = rows.length;

  if (rowsCount > 0 || options.countRow) {
    const counterColName = options.counterColName;
    const targetColName = options.targetColName;

    result.counterLabel = options.counterLabel || visualizationName;

    if (options.countRow) {
      result.counterValue = rowsCount;
    } else if (counterColName) {
      const rowNumber = getRowNumber(options.rowNumber, rowsCount);
      result.counterValue = rows[rowNumber][counterColName];
    }

    result.showTrend = false;

    if (targetColName) {
      const targetRowNumber = getRowNumber(options.targetRowNumber, rowsCount);
      result.targetValue = rows[targetRowNumber][targetColName];

      if (Number.isFinite(result.counterValue) && isFinite(result.targetValue)) {
        const delta = result.counterValue - result.targetValue;
        result.showTrend = true;
        result.trendPositive = delta >= 0;
      }
    } else {
      result.targetValue = null;
    }

    result.counterValueTooltip = formatTooltip(result.counterValue, options.tooltipFormat);
    result.targetValueTooltip = formatTooltip(result.targetValue, options.tooltipFormat);

    result.counterValue = formatValue(result.counterValue, options);

    if (options.formatTargetValue) {
      result.targetValue = formatValue(result.targetValue, options);
    } else {
      if (isFinite(result.targetValue)) {
        result.targetValue = numeral(result.targetValue).format("0[.]00[0]");
      }
    }
  }

  return result;
}

export function isValueNumber(rows: any, options: any) {
  if (options.countRow) {
    return true; // array length is always a number
  }

  const rowsCount = rows.length;
  if (rowsCount > 0) {
    const rowNumber = getRowNumber(options.rowNumber, rowsCount);
    const counterColName = options.counterColName;
    if (counterColName) {
      return isNumber(rows[rowNumber][counterColName]);
    }
  }

  return false;
}

// ============================================================================
// KPI Card v2 helpers (feature #192)
// ============================================================================

export interface DeltaResult {
  /** Absolute difference (current - compared). */
  delta: number;
  /** Percentage difference, or null when compared is 0 (no Infinity). */
  pct: number | null;
  /** Sign: 1, 0, or -1. Convenient for arrows / colours. */
  direction: 1 | 0 | -1;
}

/**
 * Compute the delta between a current numeric value and a comparison value.
 * Returns null when either side is missing / non-finite — callers should
 * suppress the delta chip in that case.
 */
export function computeDelta(current: number | null | undefined, compared: number | null | undefined): DeltaResult | null {
  if (current === null || current === undefined || !Number.isFinite(current)) {
    return null;
  }
  if (compared === null || compared === undefined || !Number.isFinite(compared)) {
    return null;
  }
  const delta = (current as number) - (compared as number);
  const pct = compared === 0 ? null : delta / Math.abs(compared as number);
  const direction: 1 | 0 | -1 = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  return { delta, pct, direction };
}

/**
 * Extract a numeric series from result rows for the sparkline strip.
 * Sorts by `dateColumn` ascending when provided; otherwise preserves row
 * order. Non-finite values are dropped.
 */
export function extractSparklineSeries(
  rows: any[],
  valueColumn: string | undefined,
  dateColumn?: string
): number[] {
  if (!rows || rows.length === 0 || !valueColumn) {
    return [];
  }
  const filtered = rows.filter((r) => r && r[valueColumn] !== null && r[valueColumn] !== undefined);
  const ordered = dateColumn ? sortBy(filtered, (r) => r[dateColumn]) : filtered;
  return ordered
    .map((r) => Number(r[valueColumn]))
    .filter((n) => Number.isFinite(n));
}

/**
 * Pick the comparison value for the current row based on the configured
 * comparison mode. Returns null when no comparison is configured / possible.
 *
 * Modes:
 *   "previous-period" — second-to-last value in the sparkline series, or the
 *                       row that immediately precedes the "current" row when
 *                       a sparkline column isn't set.
 *   "prior-year"      — value from ~12 same-period steps back in the series.
 *   "custom-value"    — uses `options.comparisonValue` literally.
 *   "target-column"   — pulled from the legacy targetColName / targetRowNumber.
 *   "none"            — no comparison.
 */
export function computeComparisonValue(
  rows: any[],
  options: CounterV2Options,
  currentValue: number | null
): number | null {
  const mode = options.comparisonMode || "none";
  if (mode === "none") {
    return null;
  }
  if (mode === "custom-value") {
    return Number.isFinite(Number(options.comparisonValue)) ? Number(options.comparisonValue) : null;
  }
  if (mode === "target-column") {
    if (!options.targetColName || !rows || rows.length === 0) {
      return null;
    }
    const targetRow = getRowNumber(options.targetRowNumber, rows.length);
    const v = Number(rows[targetRow][options.targetColName]);
    return Number.isFinite(v) ? v : null;
  }

  // previous-period / prior-year both walk the sparkline series.
  const series = extractSparklineSeries(rows, options.sparklineColumn || options.trendColumn || options.counterColName, options.sparklineDateColumn);
  if (series.length < 2) {
    return null;
  }
  // Drop the trailing point (== current value) if it matches currentValue —
  // safe heuristic, falls back to series[len-2] regardless.
  const last = series[series.length - 1];
  const effectiveSeries = currentValue !== null && last === currentValue ? series.slice(0, -1) : series;
  if (mode === "previous-period") {
    return effectiveSeries[effectiveSeries.length - 1] ?? null;
  }
  if (mode === "prior-year") {
    // 12 steps back for monthly cadence; falls back to first sample otherwise.
    const STEP = 12;
    const idx = effectiveSeries.length - STEP;
    if (idx >= 0) {
      return effectiveSeries[idx];
    }
    return effectiveSeries[0] ?? null;
  }
  return null;
}

/**
 * Pick the threshold entry whose `gte` is the greatest still <= value.
 * Thresholds are already sorted ascending by `getOptions`.
 */
export function pickThreshold(
  value: number | null | undefined,
  thresholds: CounterThreshold[] | undefined
): CounterThreshold | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  if (!thresholds || thresholds.length === 0) {
    return null;
  }
  let pick: CounterThreshold | null = null;
  for (const t of thresholds) {
    if ((value as number) >= t.gte) {
      pick = t;
    } else {
      break;
    }
  }
  return pick;
}

/**
 * Resolve the chip's semantic color token. Order of precedence:
 *   1. Matching threshold's colour
 *   2. Delta direction (positive→positive, negative→negative, zero→neutral)
 *   3. neutral fallback
 */
export function resolveDeltaColor(
  delta: DeltaResult | null,
  threshold: CounterThreshold | null
): SemanticColorToken {
  if (threshold) {
    return threshold.color;
  }
  if (!delta) {
    return "neutral";
  }
  if (delta.direction > 0) {
    return "positive";
  }
  if (delta.direction < 0) {
    return "negative";
  }
  return "neutral";
}

export function formatDeltaValue(delta: number, options: CounterV2Options): string {
  // Same delimiter rules as the headline number, but always signed.
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const abs = Math.abs(delta);
  const formatted = numberFormat(abs, options.stringDecimal, options.stringDecChar, options.stringThouSep);
  return sign + formatted;
}

export function formatDeltaPct(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "-" : "";
  return sign + numeral(Math.abs(pct)).format("0.0%");
}

export function defaultComparisonLabel(mode: string): string {
  switch (mode) {
    case "previous-period":
      return "vs prior period";
    case "prior-year":
      return "vs prior year";
    case "custom-value":
      return "vs target";
    case "target-column":
      return "vs target";
    default:
      return "";
  }
}

/**
 * Compose the full v2 render data: number + delta + colour + sparkline.
 */
export interface CounterV2Data {
  counterLabel: string;
  counterValueFormatted: string;
  counterValueRaw: number | null;
  counterValueTooltip: string;
  delta: DeltaResult | null;
  deltaValueFormatted: string | null;
  deltaPctFormatted: string | null;
  deltaColor: SemanticColorToken;
  comparisonLabel: string;
  /** Raw numeric comparison value, surfaced for downstream consumers
   *  (e.g. the "Explain this number" payload). Null when no comparison
   *  mode is configured or the comparison value isn't finite. */
  comparisonValueRaw: number | null;
  threshold: CounterThreshold | null;
  sparklineSeries: number[];
  tintBackground: boolean;
}

export function getCounterV2Data(
  rows: any[],
  options: CounterV2Options,
  visualizationName: string
): CounterV2Data {
  const v1 = getCounterData(rows, options, visualizationName) as any;
  // v1.counterValue is already string-formatted at this point — recover the raw
  // number for delta math from the unformatted source.
  let rawValue: number | null = null;
  if (options.countRow) {
    rawValue = rows ? rows.length : 0;
  } else if (options.counterColName && rows && rows.length > 0) {
    const rowNumber = getRowNumber(options.rowNumber, rows.length);
    const v = Number(rows[rowNumber][options.counterColName]);
    rawValue = Number.isFinite(v) ? v : null;
  }

  const compared = computeComparisonValue(rows, options, rawValue);
  const delta = computeDelta(rawValue, compared);
  const threshold = pickThreshold(rawValue, options.thresholds);
  const deltaColor = resolveDeltaColor(delta, threshold);
  const comparisonLabel = options.comparisonLabel || defaultComparisonLabel(options.comparisonMode || "none");

  let sparklineSeries: number[] = [];
  if (options.showSparkline) {
    const col = options.sparklineColumn || options.trendColumn || options.counterColName;
    sparklineSeries = extractSparklineSeries(rows, col, options.sparklineDateColumn);
  }

  return {
    counterLabel: v1.counterLabel,
    counterValueFormatted: v1.counterValue || "",
    counterValueRaw: rawValue,
    counterValueTooltip: v1.counterValueTooltip || "",
    delta,
    deltaValueFormatted: delta ? formatDeltaValue(delta.delta, options) : null,
    deltaPctFormatted: delta && delta.pct !== null ? formatDeltaPct(delta.pct) : null,
    deltaColor,
    comparisonLabel,
    comparisonValueRaw: compared,
    threshold,
    sparklineSeries,
    tintBackground: options.tintBackground !== false,
  };
}
