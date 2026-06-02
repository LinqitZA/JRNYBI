// Feature #200: Forecast band overlay
//
// Renders forecasted future values on top of an existing line/area/column
// chart, drawn from user-provided per-row columns:
//
//   forecastValue → the predicted mean (dashed line, lighter shade)
//   forecastLower → low end of the confidence interval
//   forecastUpper → high end of the confidence interval
//
// The lower/upper pair is rendered as a shaded "tonexty" band — same trick as
// the anomaly overlay — at low opacity. A dashed vertical divider at the last
// actual point separates the actual region from the forecast region.
//
// Phase 1 (this commit): trust the user's SQL. The forecast columns are
// expected to be NULL for the historical region and populated for the future
// region. Window functions / CTEs / a UDF can produce the columns.
// Phase 2 will compute forecasts server-side via Prophet/SES — at that point
// we will still emit them via the same columnMapping convention, so this
// rendering layer doesn't change.

import { isFinite, isNil } from "lodash";

interface ForecastTrace {
  x: any[];
  y: any[];
  type: string;
  mode?: string;
  marker?: any;
  line?: any;
  fill?: string;
  fillcolor?: string;
  name: string;
  legendgroup?: string;
  showlegend?: boolean;
  hoverinfo?: string;
  yaxis?: string;
}

function toNumber(v: any): number | null {
  if (isNil(v) || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return null;
  return n;
}

function rgba(hex: string, alpha: number): string {
  // Accept #rrggbb only; fall back to a neutral blue tint on bad input
  const clean = (hex || "").replace("#", "");
  if (clean.length !== 6) return `rgba(29, 78, 216, ${alpha})`;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (!isFinite(r) || !isFinite(g) || !isFinite(b)) {
    return `rgba(29, 78, 216, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Pull forecast columns out of the raw row data attached to each point's
 * sourceData entry. Returns parallel arrays aligned to series.x so the
 * forecast traces match the actual series' axis ticks exactly.
 */
function extractForecastArrays(
  series: any
): { fv: (number | null)[]; fl: (number | null)[]; fu: (number | null)[] } | null {
  if (!series || !Array.isArray(series.x)) return null;
  const fv: (number | null)[] = [];
  const fl: (number | null)[] = [];
  const fu: (number | null)[] = [];

  let anyForecast = false;

  for (const x of series.x) {
    const item = series.sourceData && series.sourceData.get ? series.sourceData.get(x) : null;
    const row = item && item.row ? item.row : null;
    const rawF = row ? row.forecastValue : null;
    const rawL = row ? row.forecastLower : null;
    const rawU = row ? row.forecastUpper : null;

    const f = toNumber(rawF);
    const l = toNumber(rawL);
    const u = toNumber(rawU);

    fv.push(f);
    fl.push(l);
    fu.push(u);

    if (f !== null || l !== null || u !== null) anyForecast = true;
  }

  if (!anyForecast) return null;
  return { fv, fl, fu };
}

/**
 * Find the x-value at which the forecast region begins — the first x in the
 * series where forecastValue is non-null. Used to draw the vertical divider.
 */
function findForecastStartX(series: any, fv: (number | null)[]): any | null {
  for (let i = 0; i < fv.length; i++) {
    if (fv[i] !== null) return series.x[i];
  }
  return null;
}

export function buildForecastTracesForSeries(series: any, options: any): ForecastTrace[] {
  const arrays = extractForecastArrays(series);
  if (!arrays) return [];

  const { fv, fl, fu } = arrays;
  const traces: ForecastTrace[] = [];
  const seriesName = series.name || "series";
  const yaxis = series.yaxis || "y";
  const groupId = `forecast-${seriesName}`;

  const cfg = (options && options.forecast) || {};
  const baseColor: string = cfg.bandColor || "#1d4ed8";
  const bandAlpha = typeof cfg.bandOpacity === "number" ? cfg.bandOpacity : 0.2;
  const lineDash: string = cfg.forecastLineDash || "dash";

  const hasBand = fl.some(v => v !== null) && fu.some(v => v !== null);

  if (hasBand) {
    // Lower bound — invisible line, anchors the band fill
    traces.push({
      x: series.x.slice(),
      y: fl as any,
      type: "scatter",
      mode: "lines",
      line: { width: 0, color: "rgba(0,0,0,0)" },
      name: `${seriesName} forecast lower`,
      legendgroup: groupId,
      showlegend: false,
      hoverinfo: "skip",
      yaxis,
    });

    // Upper bound — fills down to previous trace
    traces.push({
      x: series.x.slice(),
      y: fu as any,
      type: "scatter",
      mode: "lines",
      line: { width: 0, color: "rgba(0,0,0,0)" },
      fill: "tonexty",
      fillcolor: rgba(baseColor, bandAlpha),
      name: `${seriesName} forecast band`,
      legendgroup: groupId,
      showlegend: true,
      hoverinfo: "skip",
      yaxis,
    });
  }

  // Forecast line — dashed
  traces.push({
    x: series.x.slice(),
    y: fv as any,
    type: "scatter",
    mode: "lines",
    line: { color: baseColor, dash: lineDash, width: 2 },
    name: `${seriesName} forecast`,
    legendgroup: groupId,
    showlegend: true,
    hoverinfo: "x+y+name",
    yaxis,
  });

  return traces;
}

/**
 * Walk the prepared series list, append forecast overlay traces, and stash the
 * forecast divider x-value on a non-enumerable marker so prepareLayout can
 * draw the vertical line. We use a sentinel on the layout-side (options) rather
 * than passing extra args through so we don't break the existing pipeline.
 */
export function appendForecastTraces(plotlySeriesList: any[], options: any): any[] {
  if (!options) return plotlySeriesList;

  // Skip incompatible chart types — forecast only makes sense for line/area/column
  const t = options.globalSeriesType;
  if (t && !["line", "area", "column"].includes(t)) return plotlySeriesList;

  const extras: any[] = [];
  let dividerX: any = null;

  for (const s of plotlySeriesList) {
    if (!s || s.visible === false) continue;
    if (typeof s.name === "string" && /forecast|anomaly/i.test(s.name)) continue;
    try {
      const built = buildForecastTracesForSeries(s, options);
      if (built.length > 0) {
        // Track divider position from the first series that has forecast data
        if (dividerX === null) {
          const arrays = extractForecastArrays(s);
          if (arrays) dividerX = findForecastStartX(s, arrays.fv);
        }
      }
      extras.push(...built);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Forecast trace generation failed for series", s && s.name, err);
    }
  }

  // Communicate the divider position to prepareLayout via a side channel
  // (a transient field on options). prepareLayout reads + clears it.
  if (dividerX !== null && options.forecast && options.forecast.showDivider !== false) {
    options.__forecastDividerX = dividerX;
  }

  return [...plotlySeriesList, ...extras];
}
