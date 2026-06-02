// Feature #215 — Auto chart-type suggestion based on column types.
//
// Heuristic function that, given the result columns (with types) and a
// sample of rows, returns a RANKED list of `{ type, score, reason,
// columnMapping }` recommendations. The top entry is what the editor
// surfaces as the "Recommended" chip.
//
// The function is intentionally rule-based — no ML, no model file — so it
// stays:
//   * Deterministic (same inputs → same suggestion; easy to test)
//   * Self-explainable (every rule emits a `reason` string the editor can
//     show in a tooltip)
//   * Cheap (runs synchronously when the editor mounts; no async deps)
//
// The accept/reject hook (`recordSuggestionDecision`) lets a future
// ML-based improver collect training data without invading this file's
// rule logic.

import { isNil } from "lodash";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ColumnInfo = {
  name: string;
  type?: string;
  friendly_name?: string;
};

export type ChartSuggestion = {
  type: string;
  score: number;
  reason: string;
  columnMapping: { [columnName: string]: string };
  // Optional extras applied on accept (e.g. swappedAxes for horizontal bars
  // with very long category labels). Merged shallow into options.
  optionPatches?: { [key: string]: any };
};

export type SuggestionInput = {
  columns: ColumnInfo[];
  rows: any[];
  // Hard cap on rows we inspect for cardinality — defaults to 500 so a
  // suggest call on a fresh 100k-row query is still O(<1ms).
  maxSampleRows?: number;
};

// ---------------------------------------------------------------------------
// Column-type categorisation
// ---------------------------------------------------------------------------

const NUMERIC_TYPES = new Set(["integer", "float", "number"]);
const TEMPORAL_TYPES = new Set(["date", "datetime"]);
const CATEGORICAL_TYPES = new Set(["string", "text", "boolean"]);

function categoriseColumn(col: ColumnInfo): "numeric" | "temporal" | "categorical" | "other" {
  const t = (col.type || "").toLowerCase();
  if (NUMERIC_TYPES.has(t)) return "numeric";
  if (TEMPORAL_TYPES.has(t)) return "temporal";
  if (CATEGORICAL_TYPES.has(t)) return "categorical";
  // Empty / unknown type — sniff a sample value from the column instead.
  return "other";
}

// ---------------------------------------------------------------------------
// Cardinality estimation (cheap; samples rows)
// ---------------------------------------------------------------------------

function estimateCardinality(rows: any[], columnName: string, sampleSize: number): number {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const seen = new Set<string>();
  const cap = Math.min(rows.length, Math.max(1, sampleSize));
  for (let i = 0; i < cap; i++) {
    const v = rows[i] != null ? rows[i][columnName] : undefined;
    if (isNil(v)) continue;
    seen.add(String(v));
    // Bail early once we've crossed the "high-cardinality" threshold —
    // we only need the bucket, not the exact count.
    if (seen.size > 50) return seen.size;
  }
  return seen.size;
}

function sniffTypeFromSample(rows: any[], columnName: string, sampleSize: number):
  | "numeric"
  | "temporal"
  | "categorical"
  | "other" {
  if (!Array.isArray(rows) || rows.length === 0) return "other";
  const cap = Math.min(rows.length, Math.max(1, sampleSize));
  let numericHits = 0;
  let temporalHits = 0;
  let categoricalHits = 0;
  let nonNullSeen = 0;
  for (let i = 0; i < cap; i++) {
    const v = rows[i] != null ? rows[i][columnName] : undefined;
    if (isNil(v)) continue;
    nonNullSeen++;
    if (typeof v === "number" && isFinite(v)) {
      numericHits++;
    } else if (v instanceof Date) {
      temporalHits++;
    } else if (typeof v === "string") {
      // Cheap ISO-date sniff: starts with YYYY-MM-DD.
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
        temporalHits++;
      } else if (/^-?\d+(\.\d+)?$/.test(v)) {
        // Pure-number string — count as numeric. Saves a query author from
        // having to cast in SQL just for the editor to pick line.
        numericHits++;
      } else {
        categoricalHits++;
      }
    } else if (typeof v === "boolean") {
      categoricalHits++;
    }
  }
  if (nonNullSeen === 0) return "other";
  if (temporalHits / nonNullSeen > 0.6) return "temporal";
  if (numericHits / nonNullSeen > 0.6) return "numeric";
  if (categoricalHits / nonNullSeen > 0.6) return "categorical";
  return "other";
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

// A rule sees the categorised columns + sample data and may emit a
// `ChartSuggestion`. Rules don't need to short-circuit — every match is
// scored, the runner picks the highest-scoring suggestion.
type Categorised = {
  temporal: ColumnInfo[];
  numeric: ColumnInfo[];
  categorical: ColumnInfo[];
  cardinality: { [name: string]: number };
};

function buildCategorisation(input: SuggestionInput): Categorised {
  const sampleSize = input.maxSampleRows || 500;
  const cardinality: { [name: string]: number } = {};
  const temporal: ColumnInfo[] = [];
  const numeric: ColumnInfo[] = [];
  const categorical: ColumnInfo[] = [];
  for (const col of input.columns || []) {
    let cat = categoriseColumn(col);
    if (cat === "other") {
      cat = sniffTypeFromSample(input.rows || [], col.name, sampleSize);
    }
    if (cat === "temporal") temporal.push(col);
    else if (cat === "numeric") numeric.push(col);
    else if (cat === "categorical") categorical.push(col);
    cardinality[col.name] = estimateCardinality(input.rows || [], col.name, sampleSize);
  }
  return { temporal, numeric, categorical, cardinality };
}

function withMapping(mapping: { [k: string]: string }): { [k: string]: string } {
  const out: { [k: string]: string } = {};
  Object.keys(mapping).forEach((k) => {
    if (mapping[k]) out[k] = mapping[k];
  });
  return out;
}

// (datetime + numeric) → LINE (counter for time-series).
function ruleTimeSeries({ temporal, numeric }: Categorised): ChartSuggestion | null {
  if (temporal.length === 0 || numeric.length === 0) return null;
  const x = temporal[0];
  const y = numeric[0];
  return {
    type: "line",
    score: 90,
    reason: `Time series detected: "${x.name}" (date) over "${y.name}" (numeric).`,
    columnMapping: withMapping({ [x.name]: "x", [y.name]: "y" }),
  };
}

// (categorical low-cardinality + numeric) → COLUMN (bar).
function ruleBar({ categorical, numeric, cardinality }: Categorised): ChartSuggestion | null {
  if (categorical.length === 0 || numeric.length === 0) return null;
  // Pick the lowest-cardinality categorical as x (best fit for bars).
  const sorted = categorical
    .map((c) => ({ col: c, n: cardinality[c.name] || 0 }))
    .sort((a, b) => a.n - b.n);
  const xCandidate = sorted[0];
  if (!xCandidate || xCandidate.n === 0) return null;
  if (xCandidate.n > 30) return null; // too many bars to read; defer to bar-horizontal rule.
  const x = xCandidate.col;
  const y = numeric[0];
  return {
    type: "column",
    score: xCandidate.n <= 12 ? 85 : 75,
    reason: `Categorical "${x.name}" (${xCandidate.n} values) with numeric "${y.name}".`,
    columnMapping: withMapping({ [x.name]: "x", [y.name]: "y" }),
  };
}

// (categorical high-cardinality + numeric) → COLUMN with horizontal axes
// swapped — keeps long category labels readable.
function ruleHorizontalBar({ categorical, numeric, cardinality }: Categorised): ChartSuggestion | null {
  if (categorical.length === 0 || numeric.length === 0) return null;
  const sorted = categorical
    .map((c) => ({ col: c, n: cardinality[c.name] || 0 }))
    .sort((a, b) => a.n - b.n);
  const xCandidate = sorted[0];
  if (!xCandidate || xCandidate.n <= 12) return null;
  if (xCandidate.n > 50) return null; // genuinely too many — different rule below.
  const x = xCandidate.col;
  const y = numeric[0];
  return {
    type: "column",
    score: 70,
    reason: `Many categories ("${x.name}", ${xCandidate.n}) — horizontal bars stay readable.`,
    columnMapping: withMapping({ [x.name]: "x", [y.name]: "y" }),
    optionPatches: { swappedAxes: true },
  };
}

// (two numerics, no temporal) → SCATTER.
function ruleScatter({ numeric, temporal }: Categorised): ChartSuggestion | null {
  if (temporal.length > 0) return null;
  if (numeric.length < 2) return null;
  const x = numeric[0];
  const y = numeric[1];
  return {
    type: "scatter",
    score: 60,
    reason: `Two numeric columns ("${x.name}", "${y.name}") with no time dimension.`,
    columnMapping: withMapping({ [x.name]: "x", [y.name]: "y" }),
  };
}

// (three+ numerics, no temporal) → BUBBLE — adds size dimension.
function ruleBubble({ numeric, temporal }: Categorised): ChartSuggestion | null {
  if (temporal.length > 0) return null;
  if (numeric.length < 3) return null;
  const [x, y, size] = numeric;
  return {
    type: "bubble",
    score: 65,
    reason: `Three numeric columns — "${size.name}" mapped to bubble size.`,
    columnMapping: withMapping({ [x.name]: "x", [y.name]: "y", [size.name]: "size" }),
  };
}

// (1 categorical + 1 numeric, <=8 categories) → PIE.
function rulePie({ categorical, numeric, cardinality }: Categorised): ChartSuggestion | null {
  if (categorical.length === 0 || numeric.length === 0) return null;
  const sorted = categorical
    .map((c) => ({ col: c, n: cardinality[c.name] || 0 }))
    .sort((a, b) => a.n - b.n);
  const xCandidate = sorted[0];
  if (!xCandidate || xCandidate.n === 0 || xCandidate.n > 8) return null;
  return {
    type: "pie",
    score: xCandidate.n <= 5 ? 80 : 65, // <=5 slices: ideal for pie; 6-8: borderline.
    reason: `Few categories (${xCandidate.n}) summing one numeric — pie is readable here.`,
    columnMapping: withMapping({ [xCandidate.col.name]: "x", [numeric[0].name]: "y" }),
  };
}

// (datetime + numeric + categorical group) → LINE with `series` grouping.
function ruleMultiSeriesLine({ temporal, numeric, categorical, cardinality }: Categorised): ChartSuggestion | null {
  if (temporal.length === 0 || numeric.length === 0 || categorical.length === 0) return null;
  const x = temporal[0];
  const y = numeric[0];
  // Pick a categorical with sensible cardinality for the legend (2..8 series
  // is the sweet spot; more than 12 series is unreadable, skip the rule).
  const groupCandidate = categorical
    .map((c) => ({ col: c, n: cardinality[c.name] || 0 }))
    .filter((c) => c.n >= 2 && c.n <= 12)
    .sort((a, b) => a.n - b.n)[0];
  if (!groupCandidate) return null;
  return {
    type: "line",
    score: 95, // strongest signal — clearly a grouped time series.
    reason: `Time series grouped by "${groupCandidate.col.name}" (${groupCandidate.n} series).`,
    columnMapping: withMapping({
      [x.name]: "x",
      [y.name]: "y",
      [groupCandidate.col.name]: "series",
    }),
  };
}

const RULES = [
  ruleMultiSeriesLine,
  ruleTimeSeries,
  ruleBar,
  rulePie,
  ruleHorizontalBar,
  ruleBubble,
  ruleScatter,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function suggestChart(input: SuggestionInput): ChartSuggestion[] {
  if (!input || !Array.isArray(input.columns) || input.columns.length === 0) {
    return [];
  }
  const cat = buildCategorisation(input);
  const suggestions: ChartSuggestion[] = [];
  for (const rule of RULES) {
    try {
      const s = rule(cat);
      if (s) suggestions.push(s);
    } catch (err) {
      // A misbehaving rule shouldn't break the whole picker.
      // eslint-disable-next-line no-console
      console.error("suggest-chart rule threw:", err);
    }
  }
  // Sort descending by score; stable sort so ties keep authoring order.
  return suggestions
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (b.s.score - a.s.score) || (a.i - b.i))
    .map(({ s }) => s);
}

// Convenience: top suggestion or null.
export function topChartSuggestion(input: SuggestionInput): ChartSuggestion | null {
  const ranked = suggestChart(input);
  return ranked.length > 0 ? ranked[0] : null;
}

// ---------------------------------------------------------------------------
// Decision tracking (accept / reject)
// ---------------------------------------------------------------------------
//
// Lightweight hook for future ML-based improvement: the editor calls
// `recordSuggestionDecision` whenever a user accepts or rejects (or simply
// changes the chart type away from) the recommendation. The data is shipped
// out via the host's recordEvent callback (or a console event in dev) so the
// rule layer here has zero coupling to the host's telemetry stack.

export type SuggestionDecision = "offered" | "accepted" | "rejected";

type RecordEventFn = (event: SuggestionEvent) => void;

export type SuggestionEvent = {
  decision: SuggestionDecision;
  suggestedType: string;
  acceptedType?: string; // populated for "accepted" + "rejected"
  reason: string;
  // High-level shape signal so a future model has the categorisation that
  // produced the suggestion without needing the raw rows back.
  shape: {
    temporalCount: number;
    numericCount: number;
    categoricalCount: number;
    sampleRows: number;
  };
};

let recorder: RecordEventFn = (event) => {
  // Default sink: log to console at debug level so it shows up in dev tools
  // when a query author is exploring, but doesn't spam production logs.
  if (typeof console !== "undefined" && console.debug) {
    // eslint-disable-next-line no-console
    console.debug("[suggest-chart]", event);
  }
};

export function setSuggestionRecorder(fn: RecordEventFn) {
  recorder = typeof fn === "function" ? fn : recorder;
}

export function recordSuggestionDecision(event: SuggestionEvent) {
  try {
    recorder(event);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("recordSuggestionDecision sink threw:", err);
  }
}

export function buildShapeSummary(input: SuggestionInput) {
  const cat = buildCategorisation(input);
  return {
    temporalCount: cat.temporal.length,
    numericCount: cat.numeric.length,
    categoricalCount: cat.categorical.length,
    sampleRows: Array.isArray(input.rows) ? input.rows.length : 0,
  };
}

export default suggestChart;
