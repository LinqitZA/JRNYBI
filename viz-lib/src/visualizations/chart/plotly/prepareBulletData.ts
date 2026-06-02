// Feature #199: Bullet graph (Plotly indicator/bullet)
//
// Renders an actual-vs-target comparison with optional qualitative bands
// (poor / satisfactory / good). Each row in the result set becomes ONE
// indicator trace, stacked vertically in the plot area via per-trace
// `domain.y`. This gives us a scorecard layout out of the box.
//
// Expected per-row columns (mapped via columnMapping):
//   x            → the metric label (e.g. "Q1 Revenue", "DSO", "NPS")
//   actualValue  → the achieved value (required)
//   targetValue  → the goal — drawn as a vertical threshold marker
//   bandLower    → upper bound of the "poor" qualitative band (optional)
//   bandUpper    → upper bound of the "satisfactory" qualitative band (optional)
//
// The chart's axis maximum is auto-computed as max(actual, target, bandUpper)
// with a small headroom so the bar/target marker stay inside the plot.

import { each, extend, map } from "lodash";
import { cleanNumber, normalizeValue } from "./utils";

function toNum(v: any, fallback: number | null = null): number | null {
  const n = cleanNumber(v);
  return n === null || n === undefined ? fallback : n;
}

interface BulletRow {
  label: string;
  actual: number;
  target: number | null;
  bandLower: number | null;
  bandUpper: number | null;
  row: any;
}

/**
 * Flatten a Redash series (one entry per data row) into an array of
 * BulletRow descriptors. Rows missing an actual value are dropped.
 */
function collectRows(series: any, options: any): BulletRow[] {
  const out: BulletRow[] = [];
  each(series.data, (row: any) => {
    const actual = toNum(row.actualValue !== undefined ? row.actualValue : row.y);
    if (actual === null) return;
    const label = String(normalizeValue(row.x, options.xAxis ? options.xAxis.type : "-") || series.name || "Metric");
    out.push({
      label,
      actual,
      target: toNum(row.targetValue),
      bandLower: toNum(row.bandLower),
      bandUpper: toNum(row.bandUpper),
      row,
    });
  });
  return out;
}

function getAxisMax(rows: BulletRow[]): number {
  let max = 0;
  for (const r of rows) {
    if (r.actual > max) max = r.actual;
    if (r.target !== null && r.target > max) max = r.target;
    if (r.bandUpper !== null && r.bandUpper > max) max = r.bandUpper;
    if (r.bandLower !== null && r.bandLower > max) max = r.bandLower;
  }
  // Headroom so the target line / bar don't sit flush against the axis edge
  return max <= 0 ? 1 : max * 1.1;
}

export default function prepareBulletData(seriesList: any, options: any) {
  const bulletCfg = options.bullet || {};
  const poorColor: string = bulletCfg.poorColor || "#fee2e2";
  const satColor: string = bulletCfg.satisfactoryColor || "#fef3c7";
  const goodColor: string = bulletCfg.goodColor || "#d1fae5";
  const barColor: string = bulletCfg.barColor || "#0f172a";
  const targetColor: string = bulletCfg.targetColor || "#b42318";

  // Treat the first series as the canonical set of bullet rows. Additional
  // series are reasonable for "group-by" splits, but Plotly's indicator trace
  // is one-value-per-trace, so multi-series would need a second column-mapping
  // dimension — out of scope for v1.
  const firstSeries = seriesList[0];
  if (!firstSeries) return [];

  const rows = collectRows(firstSeries, options);
  if (rows.length === 0) return [];

  const axisMax = getAxisMax(rows);
  const seriesOptions = extend({ type: "bullet", yAxis: 0 }, options.seriesOptions[firstSeries.name]);

  // Lay out indicators vertically — each takes a horizontal slice of the
  // figure's y domain.
  const verticalPadding = 0.06; // gap between rows in paper coords
  const slotHeight = (1 - verticalPadding * (rows.length - 1)) / rows.length;

  return map(rows, (r, index) => {
    const yTop = 1 - index * (slotHeight + verticalPadding);
    const yBottom = yTop - slotHeight;

    // Qualitative bands: poor / satisfactory / good
    const steps: any[] = [];
    const lower = r.bandLower !== null ? r.bandLower : null;
    const upper = r.bandUpper !== null ? r.bandUpper : null;
    if (lower !== null && upper !== null && lower < upper) {
      steps.push({ range: [0, lower], color: poorColor });
      steps.push({ range: [lower, upper], color: satColor });
      steps.push({ range: [upper, axisMax], color: goodColor });
    } else if (lower !== null) {
      steps.push({ range: [0, lower], color: poorColor });
      steps.push({ range: [lower, axisMax], color: goodColor });
    } else if (upper !== null) {
      steps.push({ range: [0, upper], color: satColor });
      steps.push({ range: [upper, axisMax], color: goodColor });
    }

    const threshold: any = r.target !== null
      ? { line: { color: targetColor, width: 3 }, thickness: 0.85, value: r.target }
      : undefined;

    return {
      visible: true,
      type: "indicator",
      mode: r.target !== null ? "number+gauge+delta" : "number+gauge",
      value: r.actual,
      number: { font: { size: 18 } },
      delta: r.target !== null
        ? { reference: r.target, position: "top", relative: false }
        : undefined,
      gauge: {
        shape: "bullet",
        axis: { range: [0, axisMax] },
        bar: { color: barColor, thickness: 0.45 },
        bgcolor: "rgba(0,0,0,0)",
        borderwidth: 0,
        steps,
        threshold,
      },
      title: { text: `<b>${r.label}</b>`, font: { size: 12 } },
      domain: { x: [0, 1], y: [yBottom, yTop] },
      name: seriesOptions.name || firstSeries.name || r.label,
      // Carry sourceData so updateData / hover handlers don't crash on a
      // missing field. Bullet renders its own labels, so we won't actually
      // consult these.
      sourceData: new Map([[r.label, { x: r.label, y: r.actual, row: r.row, yPercent: null }]]),
      x: [r.label],
      y: [r.actual],
    };
  });
}
