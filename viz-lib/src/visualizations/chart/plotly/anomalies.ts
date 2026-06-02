// Client-side anomaly detection for time-series charts.
// Computes rolling z-scores per series and produces Plotly traces for
//   1) a translucent expected-range band (mean ± Nσ)
//   2) anomaly markers with hover tooltips explaining the deviation
//
// Mirrors the algorithm in the backend /api/queries/<id>/anomalies endpoint so
// dashboards see the same anomalies whether or not the backend pre-computes
// them.

import { isFinite } from "lodash";

const DEFAULT_WINDOW = 30;
const DEFAULT_THRESHOLD = 2;

interface AnomalyTrace {
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
  text?: string[];
  yaxis?: string;
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return null;
  return n;
}

function computeRolling(
  _xs: any[],
  ys: number[],
  window: number,
  threshold: number
): {
  upper: (number | null)[];
  lower: (number | null)[];
  means: (number | null)[];
  anomalyIndices: number[];
  anomalyDetails: Array<{ z: number; mean: number; stddev: number; direction: "above" | "below" }>;
} {
  const upper: (number | null)[] = new Array(ys.length).fill(null);
  const lower: (number | null)[] = new Array(ys.length).fill(null);
  const means: (number | null)[] = new Array(ys.length).fill(null);
  const anomalyIndices: number[] = [];
  const anomalyDetails: Array<{ z: number; mean: number; stddev: number; direction: "above" | "below" }> = [];

  for (let i = 0; i < ys.length; i++) {
    const start = Math.max(0, i - window);
    const windowVals: number[] = [];
    for (let j = start; j < i; j++) {
      const v = ys[j];
      if (v !== null && v !== undefined && isFinite(v)) windowVals.push(v);
    }
    if (windowVals.length < 3) continue;
    const mean = windowVals.reduce((a, b) => a + b, 0) / windowVals.length;
    const variance = windowVals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / windowVals.length;
    const stddev = Math.sqrt(variance);

    upper[i] = mean + threshold * stddev;
    lower[i] = mean - threshold * stddev;
    means[i] = mean;

    const y = ys[i];
    if (y === null || y === undefined || !isFinite(y)) continue;
    let z = 0;
    if (stddev > 0) {
      z = (y - mean) / stddev;
    } else if (y !== mean) {
      // Constant history but new point differs - treat as significant
      z = y > mean ? threshold + 1 : -(threshold + 1);
    }
    if (Math.abs(z) >= threshold && isFinite(z)) {
      anomalyIndices.push(i);
      anomalyDetails.push({
        z,
        mean,
        stddev,
        direction: z > 0 ? "above" : "below",
      });
    }
  }

  return { upper, lower, means, anomalyIndices, anomalyDetails };
}

/**
 * Build anomaly overlay traces for a single series. Returns up to three traces:
 *   - lower bound (invisible line; serves as base for the band fill)
 *   - upper bound (translucent fill to lower bound)
 *   - anomaly markers (visible dots with explanatory hover text)
 *
 * Returns [] if anomaly detection is disabled, the series has insufficient
 * points, or the series y values are non-numeric.
 */
export function buildAnomalyTracesForSeries(series: any, options: any): AnomalyTrace[] {
  if (!options || !options.showAnomalies) return [];

  const window = Number(options.anomalyWindow) || DEFAULT_WINDOW;
  const threshold = Number(options.anomalyThreshold) || DEFAULT_THRESHOLD;

  const xs: any[] = Array.isArray(series.x) ? series.x : [];
  const rawYs: any[] = Array.isArray(series.y) ? series.y : [];
  if (xs.length < 4 || rawYs.length < 4) return [];

  const ys: number[] = rawYs.map(v => {
    const n = toNumber(v);
    return n === null ? (NaN as unknown as number) : n;
  });

  // Reject series whose y values aren't numeric at all
  const numericCount = ys.filter(v => isFinite(v)).length;
  if (numericCount < 4) return [];

  const { upper, lower, means, anomalyIndices, anomalyDetails } = computeRolling(
    xs as any[],
    ys,
    window,
    threshold
  );

  const traces: AnomalyTrace[] = [];
  const seriesName = series.name || "series";
  const groupId = `anomaly-${seriesName}`;
  const yaxis = series.yaxis || "y";

  // Lower band (invisible line, base for fill)
  traces.push({
    x: xs,
    y: lower as any,
    type: "scatter",
    mode: "lines",
    line: { width: 0, color: "rgba(0,0,0,0)" },
    name: `${seriesName} expected range`,
    legendgroup: groupId,
    showlegend: false,
    hoverinfo: "skip",
    yaxis,
  });

  // Upper band - fill to previous trace
  traces.push({
    x: xs,
    y: upper as any,
    type: "scatter",
    mode: "lines",
    line: { width: 0, color: "rgba(0,0,0,0)" },
    fill: "tonexty",
    fillcolor: "rgba(180, 35, 24, 0.12)",
    name: `${seriesName} expected range (${threshold}σ)`,
    legendgroup: groupId,
    showlegend: true,
    hoverinfo: "skip",
    yaxis,
  });

  // Anomaly markers
  if (anomalyIndices.length > 0) {
    const ax = anomalyIndices.map(i => xs[i]);
    const ay = anomalyIndices.map(i => rawYs[i]);
    const text = anomalyIndices.map((_i, k) => {
      const detail = anomalyDetails[k];
      const sigmaStr = Math.abs(detail.z).toFixed(1);
      const direction = detail.direction === "above" ? "above" : "below";
      const meanStr = isFinite(detail.mean) ? detail.mean.toPrecision(4) : "?";
      return `Anomaly: ${sigmaStr}σ ${direction} the ${window}-point rolling mean (${meanStr})`;
    });

    traces.push({
      x: ax,
      y: ay,
      type: "scatter",
      mode: "markers",
      marker: {
        size: 12,
        color: "rgba(180, 35, 24, 0.9)",
        line: { width: 2, color: "#ffffff" },
        symbol: "circle",
      },
      name: `${seriesName} anomalies`,
      legendgroup: groupId,
      showlegend: true,
      hoverinfo: "x+y+text",
      text,
      yaxis,
    });
  }

  // suppress unused-var warning - means computed for future Phase 2 (Prophet)
  void means;

  return traces;
}

export function appendAnomalyTraces(plotlySeriesList: any[], options: any): any[] {
  if (!options || !options.showAnomalies) return plotlySeriesList;

  // Only line/area/column charts benefit from anomaly overlays on a continuous axis
  if (
    options.globalSeriesType &&
    !["line", "area", "column"].includes(options.globalSeriesType)
  ) {
    return plotlySeriesList;
  }

  const extras: any[] = [];
  for (const s of plotlySeriesList) {
    // Skip if series is hidden, is itself a bound, or is something we shouldn't decorate
    if (!s || s.visible === false) continue;
    if (typeof s.name === "string" && s.name.indexOf("anomaly") >= 0) continue;
    const seriesType = (s.type || "").toString();
    if (seriesType && !["scatter", "bar"].includes(seriesType)) continue;
    try {
      const built = buildAnomalyTracesForSeries(s, options);
      extras.push(...built);
    } catch (err) {
      // Failsafe: never let anomaly computation break the chart
      // eslint-disable-next-line no-console
      console.warn("Anomaly trace generation failed for series", s && s.name, err);
    }
  }
  return [...plotlySeriesList, ...extras];
}
