// Feature #202: Small multiples / trellis layout (Plotly facets)
//
// Splits a chart into a grid of subplots, one per unique value of a "facet"
// column. The same x and y mapping is repeated across each subplot — e.g.
// Sales-by-Month per Branch in a 3x3 grid.
//
// Pipeline order:
//   1. prepareDefaultData already produced one Plotly trace per group-by series
//   2. This module reads `point.$raw[facetColumn]` for each row, partitions
//      every trace by facet value, and reassigns each partitioned sub-trace to
//      a per-facet (xaxisN, yaxisN) pair
//   3. prepareLayout reads `options.__facetGrid` (set here) and generates a
//      `grid.pattern: "independent"` + axis definitions for all subplots
//
// We DON'T touch the chart when:
//   - options.facet.enabled is falsy
//   - options.columnMapping has no "facet" mapping
//   - chart type isn't a faceting-compatible viz (line/area/column/scatter/bubble)
//   - faceted value count exceeds maxFacets (safety against 200-cat columns)

import { includes } from "lodash";

type FacetCfg = {
  enabled?: boolean;
  columns?: number | null;
  shareX?: boolean;
  shareY?: boolean;
  showOnlyOuterLabels?: boolean;
  maxFacets?: number;
};

const FACET_COMPATIBLE_TYPES = ["line", "area", "column", "scatter", "bubble"];

/**
 * Inspect options.columnMapping to find the column the user wired to "facet".
 * Returns the column name, or null when no facet mapping is set.
 */
function getFacetColumn(options: any): string | null {
  if (!options || !options.columnMapping) return null;
  for (const col of Object.keys(options.columnMapping)) {
    if (options.columnMapping[col] === "facet") return col;
  }
  return null;
}

/**
 * Auto-compute (rows, cols) for a given facet count when the user didn't
 * override columns. Sqrt produces a near-square layout — 4→2x2, 9→3x3, 12→3x4.
 */
function computeGridShape(count: number, cols?: number | null): { rows: number; cols: number } {
  if (cols && cols > 0) {
    return { rows: Math.ceil(count / cols), cols };
  }
  const c = Math.ceil(Math.sqrt(count));
  const r = Math.ceil(count / c);
  return { rows: r, cols: c };
}

/**
 * Pull the facet value for a given x position in a series. We look it up via
 * the sourceData Map (built by prepareDefaultData) which carries each row's
 * raw $raw payload. Returns null when no row backs that x (rare; defensive).
 */
function facetValueAt(series: any, x: any, facetColumn: string): any {
  if (!series.sourceData || typeof series.sourceData.get !== "function") return null;
  const item = series.sourceData.get(x);
  if (!item || !item.row || !item.row.$raw) return null;
  const raw = item.row.$raw;
  const v = raw[facetColumn];
  // some queries label rows as `column::type` — try that variant too
  if (v === undefined) {
    for (const k of Object.keys(raw)) {
      if (k === facetColumn || k.startsWith(`${facetColumn}::`) || k.startsWith(`${facetColumn}__`)) {
        return raw[k];
      }
    }
    return null;
  }
  return v;
}

/**
 * Partition a single prepared Plotly series into N sub-series, one per facet
 * value. Preserves order: facet order is "first time we see this value
 * walking series.x". Each sub-series keeps the parent's style, name suffixed
 * with " — <facetVal>", and an `__facetValue` marker we read in the layout step.
 */
function partitionSeriesByFacet(series: any, facetColumn: string): any[] {
  if (!Array.isArray(series.x) || series.x.length === 0) return [series];

  const buckets = new Map<any, { x: any[]; y: any[]; err: any[]; src: Map<any, any> }>();
  const hasErr = series.error_y && Array.isArray(series.error_y.array);

  for (let i = 0; i < series.x.length; i++) {
    const x = series.x[i];
    const y = series.y[i];
    const fv = facetValueAt(series, x, facetColumn);
    const key = fv === null || fv === undefined ? "(unknown)" : String(fv);

    if (!buckets.has(key)) {
      buckets.set(key, { x: [], y: [], err: [], src: new Map() });
    }
    const bucket = buckets.get(key)!;
    bucket.x.push(x);
    bucket.y.push(y);
    if (hasErr) bucket.err.push(series.error_y.array[i]);
    if (series.sourceData && series.sourceData.has(x)) {
      bucket.src.set(x, series.sourceData.get(x));
    }
  }

  const out: any[] = [];
  for (const [facetVal, bucket] of buckets.entries()) {
    const clone: any = { ...series };
    clone.x = bucket.x;
    clone.y = bucket.y;
    clone.sourceData = bucket.src;
    clone.name = `${series.name} — ${facetVal}`;
    clone.__facetValue = facetVal;
    // Mute legend per subplot — only the first subplot's series gets shown to
    // avoid N copies of every legend entry. The layout step will toggle this
    // back on for the first occurrence of each parent-series.
    clone.showlegend = false;
    if (hasErr) {
      clone.error_y = { ...series.error_y, array: bucket.err };
    }
    out.push(clone);
  }
  return out;
}

/**
 * Sentinel value used to mark a series as "unfaceted" — happens when a row
 * has no facet column value (NULL etc.). All such rows collapse into one
 * "(unknown)" facet that gets its own subplot slot at the end of the grid.
 */
export function applyFacets(plotlySeriesList: any[], options: any): any[] {
  if (!options || !options.facet || !options.facet.enabled) return plotlySeriesList;
  if (!includes(FACET_COMPATIBLE_TYPES, options.globalSeriesType)) return plotlySeriesList;

  const facetColumn = getFacetColumn(options);
  if (!facetColumn) return plotlySeriesList;

  // Pass 1: partition every series by facet
  const partitioned: any[] = [];
  for (const s of plotlySeriesList) {
    if (!s || s.visible === false) {
      partitioned.push(s);
      continue;
    }
    // Don't partition overlays — they should span the full chart
    if (typeof s.name === "string" && /forecast|anomaly|cumulative/i.test(s.name)) {
      partitioned.push(s);
      continue;
    }
    partitioned.push(...partitionSeriesByFacet(s, facetColumn));
  }

  // Pass 2: assign axisN per facet value. Discover facet values in encounter
  // order so the grid layout matches the data.
  const facetOrder: any[] = [];
  for (const s of partitioned) {
    const fv = s.__facetValue;
    if (fv === undefined) continue;
    if (!facetOrder.includes(fv)) facetOrder.push(fv);
  }

  const cfg: FacetCfg = options.facet || {};
  const maxFacets = typeof cfg.maxFacets === "number" ? cfg.maxFacets : 16;
  if (facetOrder.length === 0) return plotlySeriesList;
  if (facetOrder.length > maxFacets) {
    // Safety cap — bail out (no facetting) when too many distinct values.
    // The editor caps `maxFacets` so users can opt into more if they want.
    // eslint-disable-next-line no-console
    console.warn(
      `[facets] ${facetOrder.length} facet values exceed maxFacets=${maxFacets} — falling back to single plot`
    );
    return plotlySeriesList;
  }

  const { rows, cols } = computeGridShape(facetOrder.length, cfg.columns);

  // Plotly subplot numbering: row-major, 1-indexed. facet i → row r, col c,
  // axes xaxisN/yaxisN where N = i+1 (with N=1 keeping the bare "x"/"y" names).
  const facetIndex = new Map<any, number>();
  facetOrder.forEach((fv, i) => facetIndex.set(fv, i + 1));

  // Track which (parent series name, facet) combos have shown the legend so
  // each parent series shows once across all subplots
  const legendShown = new Set<string>();

  for (const s of partitioned) {
    if (s.__facetValue === undefined) continue;
    const n = facetIndex.get(s.__facetValue)!;
    const xKey = n === 1 ? "x" : `x${n}`;
    const yKey = n === 1 ? "y" : `y${n}`;
    s.xaxis = xKey;
    s.yaxis = yKey;
    // Parent name is the part before " — <facetVal>"
    const parentName = String(s.name).split(" — ")[0];
    if (n === 1 && !legendShown.has(parentName)) {
      s.showlegend = true;
      legendShown.add(parentName);
    }
  }

  // Stash grid metadata on options so prepareLayout can produce the right
  // grid + axis spec. We pass the facet labels + indexes through.
  options.__facetGrid = {
    rows,
    cols,
    facets: facetOrder,
    facetColumn,
    shareX: cfg.shareX !== false,
    shareY: cfg.shareY !== false,
    showOnlyOuterLabels: cfg.showOnlyOuterLabels !== false,
  };

  return partitioned;
}
