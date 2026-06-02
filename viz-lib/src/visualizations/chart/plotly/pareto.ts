// Feature #201: Pareto chart preset
//
// Pareto = sorted-descending bars + cumulative-percentage line on a secondary
// y-axis. Classic 80/20 analysis: vendor spend, slow-moving SKUs, customer
// revenue concentration, defect categories.
//
// Built on top of the existing column-chart pipeline rather than as a new
// chart type so users get full control over series formatting, colour
// scheme, and column mapping. When `options.pareto.enabled` is true and the
// chart is a column chart, we:
//
//   1. Sort each bar series' (x, y) parallel arrays descending by y
//   2. Append a "cumulative %" scatter+line trace on y2 (range 0..1, percent-formatted)
//   3. Stash a side-channel marker so prepareLayout draws an optional dashed
//      horizontal threshold line (default 80%) so the "vital few" pop visually
//
// We mutate the prepared series list rather than touching raw seriesList so
// the upstream `prepareDefaultData` aggregation (one row per x) is already
// done by the time we sort.

import { isFinite, isNil } from "lodash";

type Cfg = {
  cumulativeColor?: string;
  cumulativeLineDash?: "solid" | "dash" | "dot";
  showThreshold?: boolean;
  threshold?: number;
  thresholdColor?: string;
};

function toNumber(v: any): number {
  if (isNil(v) || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return isFinite(n) ? n : 0;
}

/**
 * Sort a Plotly bar series' x/y arrays in lock-step, descending by y. Also
 * sorts the parallel error_y.array if present, and rebuilds the sourceData
 * map (Map preserves insertion order) so downstream consumers walking
 * sourceData see the post-sort order.
 */
function sortSeriesDescending(series: any): void {
  if (!Array.isArray(series.x) || !Array.isArray(series.y)) return;
  const n = series.x.length;
  if (n === 0) return;

  const indices = series.x.map((_: any, i: number) => i);
  indices.sort((a: number, b: number) => toNumber(series.y[b]) - toNumber(series.y[a]));

  const newX: any[] = new Array(n);
  const newY: any[] = new Array(n);
  for (let i = 0; i < n; i++) {
    newX[i] = series.x[indices[i]];
    newY[i] = series.y[indices[i]];
  }
  series.x = newX;
  series.y = newY;

  if (series.error_y && Array.isArray(series.error_y.array)) {
    const oldErr = series.error_y.array;
    const newErr: any[] = new Array(n);
    for (let i = 0; i < n; i++) newErr[i] = oldErr[indices[i]];
    series.error_y.array = newErr;
  }

  // Rebuild sourceData with post-sort order. We construct a new Map because
  // Map iteration order is insertion order — preserving the descending-y order
  // means downstream tooltip / drill-through code sees the sorted view.
  if (series.sourceData && typeof series.sourceData.get === "function") {
    const newMap = new Map();
    for (let i = 0; i < n; i++) {
      const k = newX[i];
      if (series.sourceData.has(k)) newMap.set(k, series.sourceData.get(k));
    }
    series.sourceData = newMap;
  }
}

/**
 * Build a cumulative-percentage line trace from the sorted bar series. The
 * cumulative % at point i is (sum of y[0..i]) / total. Plotted on y2 with
 * a percent tickformat so axis ticks read "20%", "60%" etc.
 *
 * If multiple bar series are present we aggregate them column-wise (sum across
 * series at each sorted x). This matches user intuition: "what's the cumulative
 * share across the whole chart?".
 */
function buildCumulativeTrace(barSeriesList: any[], cfg: Cfg): any | null {
  if (barSeriesList.length === 0) return null;

  // All bar series have already been sorted by their own y, so a strict
  // column-wise sum requires equal-length x arrays AND matching x values per
  // index. In practice Pareto is almost always single-series; for multi-series
  // we use the first series' x order and look up other series by sourceData.
  const primary = barSeriesList[0];
  if (!Array.isArray(primary.x) || primary.x.length === 0) return null;

  const xs = primary.x.slice();
  const totalsAtIndex: number[] = new Array(xs.length).fill(0);

  for (let i = 0; i < xs.length; i++) {
    let sum = 0;
    for (const s of barSeriesList) {
      // Same series uses positional y; others look up by x via sourceData.
      if (s === primary) {
        sum += toNumber(primary.y[i]);
      } else if (s.sourceData && typeof s.sourceData.get === "function") {
        const item = s.sourceData.get(xs[i]);
        if (item) sum += toNumber(item.y);
      }
    }
    totalsAtIndex[i] = sum;
  }

  const grandTotal = totalsAtIndex.reduce((a, b) => a + b, 0);
  if (grandTotal <= 0) return null;

  const cumulative: number[] = [];
  let running = 0;
  for (const v of totalsAtIndex) {
    running += v;
    cumulative.push(running / grandTotal);
  }

  const color = cfg.cumulativeColor || "#b42318";
  const dash = cfg.cumulativeLineDash || "solid";

  return {
    x: xs,
    y: cumulative,
    type: "scatter",
    mode: "lines+markers",
    line: { color, dash, width: 2 },
    marker: { color, size: 6 },
    name: "Cumulative %",
    yaxis: "y2",
    hovertemplate: "%{x}<br>Cumulative: %{y:.1%}<extra></extra>",
    showlegend: true,
    legendgroup: "pareto-cumulative",
  };
}

/**
 * Top-level entry point — called from prepareData() after the default
 * prepare pipeline. Sorts bars descending, appends a cumulative-percent
 * line on y2, and stashes the threshold value on options for prepareLayout
 * to render as a dashed horizontal line.
 *
 * No-op when:
 *   - pareto.enabled is falsy
 *   - chart isn't a column (Pareto is conventionally a bar+line combo)
 *   - no bar-type series are present
 */
export function applyPareto(plotlySeriesList: any[], options: any): any[] {
  if (!options || !options.pareto || !options.pareto.enabled) return plotlySeriesList;
  if (options.globalSeriesType !== "column") return plotlySeriesList;

  // Find every bar-type series. We exclude any traces that look like overlays
  // (forecast/anomaly/cumulative) so re-applying Pareto over an already-
  // augmented list is idempotent and doesn't sort the overlay traces.
  const isOverlay = (s: any) =>
    typeof s.name === "string" && /forecast|anomaly|cumulative/i.test(s.name);

  const barSeries: any[] = [];
  for (const s of plotlySeriesList) {
    if (!s || s.visible === false) continue;
    if (s.type !== "bar") continue;
    if (isOverlay(s)) continue;
    barSeries.push(s);
  }

  if (barSeries.length === 0) return plotlySeriesList;

  for (const s of barSeries) sortSeriesDescending(s);

  const cfg: Cfg = options.pareto || {};
  const cumulative = buildCumulativeTrace(barSeries, cfg);

  // Side-channel marker for prepareLayout — the threshold line lives on y2
  // and prepareLayout owns the layout.shapes array.
  if (cfg.showThreshold !== false) {
    options.__paretoThreshold = {
      value: typeof cfg.threshold === "number" ? cfg.threshold : 0.8,
      color: cfg.thresholdColor || "#475569",
    };
  } else {
    delete options.__paretoThreshold;
  }
  // Side-channel marker so prepareLayout knows to enforce y2 percent formatting
  options.__paretoCumulative = true;

  return cumulative ? [...plotlySeriesList, cumulative] : plotlySeriesList;
}
