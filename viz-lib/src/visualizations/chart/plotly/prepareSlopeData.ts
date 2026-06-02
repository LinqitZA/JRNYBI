// Feature #204: Slope / connected-scatter chart
//
// Renders one Plotly scatter trace per series, with markers and a thin line
// connecting them. Each "series" represents a single entity (e.g. one product,
// one salesperson, one country); the chart shows how that entity's value
// changed between two (or more) points on the x-axis.
//
// Visual conventions:
//   - one thin line + markers per entity
//   - line color encodes direction:
//       * upColor      — last y > first y (positive change)
//       * downColor    — last y < first y (negative change)
//       * neutralColor — equal, single-point, or non-numeric
//   - endpoint labels (optional) name the entity and print its y-values, so a
//     reader can identify which line goes with which entity without hunting
//     through the legend.
//
// Column-mapping shape: same as a default line/scatter chart —
// `x` (e.g. period / time bucket), `y` (numeric), `series` (entity name).
// The x column typically has exactly two distinct values (e.g. 'Q1' / 'Q4').

import { each, extend, isFinite, isNil, map } from "lodash";
import { cleanNumber, normalizeValue } from "./utils";

function pickDirectionColor(
  first: number | null,
  last: number | null,
  upColor: string,
  downColor: string,
  neutralColor: string
): string {
  if (!isFinite(first as any) || !isFinite(last as any) || first === null || last === null) {
    return neutralColor;
  }
  if (last > first) return upColor;
  if (last < first) return downColor;
  return neutralColor;
}

function prepareSeries(series: any, options: any, index: number) {
  const seriesOptions = extend(
    { type: options.globalSeriesType, yAxis: 0 },
    options.seriesOptions[series.name]
  );

  const slope = options.slope || {};
  const upColor: string = slope.upColor || "#117a3b";
  const downColor: string = slope.downColor || "#b42318";
  const neutralColor: string = slope.neutralColor || "#94a3b8";
  const showEndpointLabels: boolean = slope.showEndpointLabels !== false;
  const lineWidth: number = typeof slope.lineWidth === "number" ? slope.lineWidth : 1.5;
  const markerSize: number = typeof slope.markerSize === "number" ? slope.markerSize : 6;

  // Preserve the original ordering of the data when categorical, but for a
  // numeric / datetime x axis sort by x so the first / last detection below
  // truly reflects start vs end.
  const sortedData =
    options.xAxis && options.xAxis.type === "category"
      ? [...series.data]
      : [...series.data].sort((a: any, b: any) => {
          const ax = normalizeValue(a.x, options.xAxis.type);
          const bx = normalizeValue(b.x, options.xAxis.type);
          if (ax === bx) return 0;
          // moment values are comparable via < / >; numbers too.
          // strings (category) — lexicographic.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (ax as any) < (bx as any) ? -1 : 1;
        });

  const xValues: any[] = [];
  const yValues: any[] = [];
  const texts: string[] = [];
  const textPositions: string[] = [];
  const sourceData = new Map();

  each(sortedData, (row: any) => {
    const x = normalizeValue(row.x, options.xAxis.type);
    const y = cleanNumber(row.y);
    xValues.push(x);
    yValues.push(y);
    sourceData.set(x, {
      x,
      y,
      yError: null,
      yPercent: null,
      row,
      index: xValues.length - 1,
    });
  });

  // Find first / last non-null y so direction reflects the actual extremes
  // regardless of intermediate gaps.
  let firstY: number | null = null;
  for (let i = 0; i < yValues.length; i++) {
    if (!isNil(yValues[i]) && isFinite(yValues[i])) {
      firstY = yValues[i];
      break;
    }
  }
  let lastY: number | null = null;
  for (let i = yValues.length - 1; i >= 0; i--) {
    if (!isNil(yValues[i]) && isFinite(yValues[i])) {
      lastY = yValues[i];
      break;
    }
  }
  const color = pickDirectionColor(firstY, lastY, upColor, downColor, neutralColor);

  const displayName = seriesOptions.name || series.name;
  if (showEndpointLabels) {
    for (let i = 0; i < yValues.length; i++) {
      const yi = yValues[i];
      if (i === 0) {
        // Left endpoint — print "<entity>: <y>" so the line is identifiable
        // even with the legend hidden, which is the common slope-chart style.
        texts.push(isNil(yi) ? `${displayName}` : `${displayName}: ${yi}`);
        textPositions.push("middle left");
      } else if (i === yValues.length - 1) {
        texts.push(isNil(yi) ? "" : `${yi}`);
        textPositions.push("middle right");
      } else {
        texts.push("");
        textPositions.push("top center");
      }
    }
  }

  return {
    visible: true,
    type: "scatter",
    mode: showEndpointLabels ? "lines+markers+text" : "lines+markers",
    x: xValues,
    y: yValues,
    text: showEndpointLabels ? texts : undefined,
    textposition: showEndpointLabels ? textPositions : undefined,
    textfont: { size: 11, color: "#0f172a" },
    name: displayName,
    hoverinfo: "name+x+y",
    line: { color, width: lineWidth, shape: "linear" },
    marker: { color, size: markerSize, line: { color, width: 1 } },
    yaxis: "y",
    sourceData,
    insidetextfont: { color: "#ffffff" },
    error_y: { array: [], color },
    _seriesIndex: index,
    // Marker preserved for downstream code paths that read it.
    cliponaxis: false,
  };
}

export default function prepareSlopeData(seriesList: any, options: any) {
  return map(seriesList, (series, index) => prepareSeries(series, options, index));
}
