// Feature #198: Waterfall (bridge) chart
//
// Renders a Plotly "waterfall" trace from the same (x, y) series shape used by
// the rest of the chart pipeline. Each point may carry a `measure` field —
// 'relative' (default), 'total', or 'absolute' — which Plotly uses to decide
// whether each bar should add to the running total, reset to an absolute value,
// or render as a final-total summary.
//
// Cumulative running totals and the bar colors are handled natively by Plotly
// once we feed it the right trace; we just shape the data.

import { each, extend, map } from "lodash";
import { cleanNumber, normalizeValue } from "./utils";

const VALID_MEASURES = new Set(["relative", "total", "absolute"]);

function normalizeMeasure(m: any): "relative" | "total" | "absolute" {
  if (typeof m === "string") {
    const lower = m.toLowerCase().trim();
    if (VALID_MEASURES.has(lower)) {
      return lower as "relative" | "total" | "absolute";
    }
  }
  // Default to incremental contribution if the column is missing or malformed
  return "relative";
}

function prepareSeries(series: any, options: any, additionalOptions: any) {
  const { index, hoverInfoPattern } = additionalOptions;
  const seriesOptions = extend({ type: options.globalSeriesType, yAxis: 0 }, options.seriesOptions[series.name]);

  const xValues: any[] = [];
  const yValues: any[] = [];
  const measures: string[] = [];

  // Preserve per-x lookup so updateData's text-format step finds the point.
  const sourceData = new Map();

  each(series.data, (row: any) => {
    const x = normalizeValue(row.x, options.xAxis.type);
    const y = cleanNumber(row.y);
    const measure = normalizeMeasure(row.measure);

    xValues.push(x);
    yValues.push(y);
    measures.push(measure);

    sourceData.set(x, {
      x,
      y,
      yError: null,
      yPercent: null,
      row,
      index: xValues.length - 1,
      measure,
    });
  });

  const waterfall = options.waterfall || {};
  const incColor: string = waterfall.increasingColor || "#117a3b";
  const decColor: string = waterfall.decreasingColor || "#b42318";
  const totColor: string = waterfall.totalColor || "#475569";
  const connectorVisible: boolean = waterfall.connectorVisible !== false;

  return {
    visible: true,
    type: "waterfall",
    orientation: "v",
    measure: measures,
    x: xValues,
    y: yValues,
    name: seriesOptions.name || series.name,
    hoverinfo: hoverInfoPattern,
    increasing: { marker: { color: incColor } },
    decreasing: { marker: { color: decColor } },
    totals: { marker: { color: totColor } },
    connector: {
      visible: connectorVisible,
      line: { color: "#94a3b8", dash: "dot", width: 1 },
    },
    textposition: options.showDataLabels ? "outside" : "none",
    yaxis: "y",
    sourceData,
    // Preserve marker for downstream code paths that read it (e.g. updateData)
    marker: { color: incColor },
    error_y: { array: [], color: incColor },
    insidetextfont: { color: "#ffffff" },
    // Index back to original series for color-scheme parity with siblings
    _seriesIndex: index,
  };
}

function getHoverInfoPattern(options: any) {
  const hasX = /{{\s*@@x\s*}}/.test(options.textFormat);
  const hasName = /{{\s*@@name\s*}}/.test(options.textFormat);
  let result = "text";
  if (!hasX) result += "+x";
  if (!hasName) result += "+name";
  return result;
}

export default function prepareWaterfallData(seriesList: any, options: any) {
  const additionalOptions = {
    hoverInfoPattern: getHoverInfoPattern(options),
  };
  return map(seriesList, (series, index) => prepareSeries(series, options, { ...additionalOptions, index }));
}
