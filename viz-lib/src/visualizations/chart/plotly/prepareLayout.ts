import { isObject, isUndefined, filter, map, isArray, isFinite } from "lodash";
import { getPieDimensions } from "./preparePieData";
import { JrnyCategoricalArray } from "@/visualizations/ColorPalette";

// Read the active JRNY theme from the document root. The class is managed by
// client/app/services/theme.js — we look it up at chart-render time rather
// than caching, because dashboards can be re-rendered after a theme switch
// without a full reload.
function isDarkActive(): boolean {
  try {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("jrny-theme-dark");
  } catch (e) {
    return false;
  }
}

// Dark-mode layout overrides. Equivalent in spirit to plotly's built-in
// "plotly_dark" template, but tuned to the JRNY surface tokens so charts
// blend with widget cards instead of fighting them.
const DARK_LAYOUT_OVERRIDES = {
  paper_bgcolor: "#0f172a", // matches --jrny-surface-1 dark
  plot_bgcolor: "#0f172a",
  font: { color: "#f8fafc" }, // matches --jrny-text-1 dark
  xaxis: { gridcolor: "#334155", zerolinecolor: "#475569", linecolor: "#475569" },
  yaxis: { gridcolor: "#334155", zerolinecolor: "#475569", linecolor: "#475569" },
};

const LIGHT_LAYOUT_OVERRIDES = {
  paper_bgcolor: "#ffffff",
  plot_bgcolor: "#ffffff",
  font: { color: "#0f172a" },
};

function getAxisTitleText(axis: any): string | null {
  if (!axis || !axis.title) return null;
  return isObject(axis.title) ? axis.title.text : axis.title;
}

function getAxisScaleType(axis: any) {
  switch (axis.type) {
    case "datetime":
      return "date";
    case "logarithmic":
      return "log";
    default:
      return axis.type;
  }
}

function prepareXAxis(axisOptions: any, additionalOptions: any) {
  const titleText = getAxisTitleText(axisOptions);
  const axis: any = {
    title: titleText ? { text: titleText } : null,
    type: getAxisScaleType(axisOptions),
    automargin: true,
    tickformat: axisOptions.tickFormat ?? null,
  };

  if (additionalOptions.sortX && axis.type === "category") {
    if (additionalOptions.reverseX) {
      axis.categoryorder = "category descending";
    } else {
      axis.categoryorder = "category ascending";
    }
  }

  if (!isUndefined(axisOptions.labels)) {
    axis.showticklabels = axisOptions.labels.enabled;
  }

  return axis;
}

function prepareYAxis(axisOptions: any) {
  const titleText = getAxisTitleText(axisOptions);
  return {
    title: titleText ? { text: titleText } : null,
    type: getAxisScaleType(axisOptions),
    automargin: true,
    autorange: true,
    range: null,
    tickformat: axisOptions.tickFormat ?? null,
  };
}

function preparePieLayout(layout: any, options: any, data: any) {
  const hasName = /{{\s*@@name\s*}}/.test(options.textFormat);

  const { cellsInRow, cellWidth, cellHeight, xPadding } = getPieDimensions(data);

  if (hasName) {
    layout.annotations = [];
  } else {
    layout.annotations = filter(
      map(data, (series, index) => {
        const xPosition = ((index as number) % cellsInRow) * cellWidth;
        const yPosition = Math.floor((index as number) / cellsInRow) * cellHeight;
        return {
          x: xPosition + (cellWidth - xPadding) / 2,
          y: yPosition + cellHeight - 0.015,
          xanchor: "center",
          yanchor: "top",
          text: series.name,
          showarrow: false,
        };
      })
    );
  }

  return layout;
}

function prepareDefaultLayout(layout: any, options: any, data: any) {
  const y2Series = data.filter((s: any) => s.yaxis === "y2");

  layout.xaxis = prepareXAxis(options.xAxis, options);

  layout.yaxis = prepareYAxis(options.yAxis[0]);
  if (y2Series.length > 0) {
    layout.yaxis2 = prepareYAxis(options.yAxis[1]);
    layout.yaxis2.overlaying = "y";
    layout.yaxis2.side = "right";
  }

  if (options.series.stacking) {
    layout.barmode = "relative";
  }

  // Bleed the theme grid/zeroline colors onto every axis so dark mode
  // doesn't leave invisible gridlines on the dark surface.
  const themeOverrides = layout.__jrnyThemeOverrides;
  if (themeOverrides && themeOverrides.xaxis) {
    layout.xaxis = { ...themeOverrides.xaxis, ...layout.xaxis };
    layout.yaxis = { ...themeOverrides.yaxis, ...layout.yaxis };
    if (layout.yaxis2) layout.yaxis2 = { ...themeOverrides.yaxis, ...layout.yaxis2 };
  }

  return layout;
}

function prepareBoxLayout(layout: any, options: any, data: any) {
  layout = prepareDefaultLayout(layout, options, data);
  layout.boxmode = "group";
  layout.boxgroupgap = 0.5;
  return layout;
}

// --- Feature #188: chart annotations (vlines, ranges, point callouts) ----
//
// User-defined annotations live on options.annotations. Each entry has one of
// three shapes:
//
//   { type: "vline",  x: <date|category|number>, label, color, opacity, labelPosition }
//   { type: "range",  x: <start>, x2: <end>,     label, color, opacity, labelPosition }
//   { type: "point",  x: <x>,     y: <number>,   label, color, opacity, labelPosition }
//
// We translate them into Plotly's two layout arrays:
//   - layout.shapes      → vertical lines + shaded date ranges
//   - layout.annotations → text labels + point callouts (with arrow)

function labelYAnchor(pos: any): "top" | "middle" | "bottom" {
  if (pos === "middle") return "middle";
  if (pos === "bottom") return "bottom";
  return "top";
}

function labelYPaper(pos: any): number {
  // Paper coords: 0 = bottom of plot area, 1 = top.
  if (pos === "middle") return 0.5;
  if (pos === "bottom") return 0.03;
  return 0.97;
}

function clampOpacity(v: any, fallback: number): number {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function parseY(v: any): number | null {
  if (v === "" || v === null || isUndefined(v)) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function applyAnnotations(layout: any, options: any) {
  const list = isArray(options.annotations) ? options.annotations : [];
  if (list.length === 0) return;

  const shapes: any[] = isArray(layout.shapes) ? layout.shapes.slice() : [];
  const labels: any[] = isArray(layout.annotations) ? layout.annotations.slice() : [];

  for (const ann of list) {
    if (!ann || typeof ann !== "object") continue;
    const color: string = ann.color || "#475569";
    const labelText: string = ann.label || "";
    const yAnchor = labelYAnchor(ann.labelPosition);
    const yPaper = labelYPaper(ann.labelPosition);

    if (ann.type === "vline") {
      if (ann.x === "" || ann.x === null || isUndefined(ann.x)) continue;
      shapes.push({
        type: "line",
        xref: "x",
        yref: "paper",
        x0: ann.x,
        x1: ann.x,
        y0: 0,
        y1: 1,
        line: { color, width: 2, dash: "dash" },
        opacity: clampOpacity(ann.opacity, 1),
        layer: "above",
      });
      if (labelText) {
        labels.push({
          xref: "x",
          yref: "paper",
          x: ann.x,
          y: yPaper,
          yanchor: yAnchor,
          xanchor: "left",
          text: labelText,
          showarrow: false,
          bgcolor: "rgba(255,255,255,0.8)",
          bordercolor: color,
          borderwidth: 1,
          borderpad: 3,
          font: { color, size: 11 },
        });
      }
      continue;
    }

    if (ann.type === "range") {
      if (
        ann.x === "" || ann.x === null || isUndefined(ann.x) ||
        ann.x2 === "" || ann.x2 === null || isUndefined(ann.x2)
      ) continue;
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: ann.x,
        x1: ann.x2,
        y0: 0,
        y1: 1,
        fillcolor: color,
        opacity: clampOpacity(ann.opacity, 0.15),
        line: { width: 0 },
        layer: "below",
      });
      if (labelText) {
        labels.push({
          xref: "x",
          yref: "paper",
          // Plotly understands an array of midpoints poorly for dates, so we
          // anchor the label at the start edge; that's predictable for users
          // (and matches how matplotlib places axvspan labels).
          x: ann.x,
          y: yPaper,
          yanchor: yAnchor,
          xanchor: "left",
          text: labelText,
          showarrow: false,
          bgcolor: "rgba(255,255,255,0.8)",
          bordercolor: color,
          borderwidth: 1,
          borderpad: 3,
          font: { color, size: 11 },
        });
      }
      continue;
    }

    if (ann.type === "point") {
      const y = parseY(ann.y);
      if (y === null || ann.x === "" || ann.x === null || isUndefined(ann.x)) continue;
      labels.push({
        xref: "x",
        yref: "y",
        x: ann.x,
        y,
        text: labelText || "•",
        showarrow: true,
        arrowhead: 3,
        arrowsize: 1,
        arrowwidth: 1.5,
        arrowcolor: color,
        ax: 0,
        ay: -30,
        bgcolor: "rgba(255,255,255,0.85)",
        bordercolor: color,
        borderwidth: 1,
        borderpad: 3,
        opacity: clampOpacity(ann.opacity, 1),
        font: { color, size: 11 },
      });
      continue;
    }
  }

  if (shapes.length > 0) layout.shapes = shapes;
  if (labels.length > 0) layout.annotations = labels;
}

export default function prepareLayout(element: any, options: any, data: any) {
  const layout: any = {
    margin: { l: 10, r: 10, b: 5, t: 20, pad: 4 },
    // plot size should be at least 5x5px
    width: Math.max(5, Math.floor(element.offsetWidth)),
    height: Math.max(5, Math.floor(element.offsetHeight)),
    autosize: false,
    showlegend: options.legend.enabled,
    legend: {
      traceorder: options.legend.traceorder,
    },
    hoverlabel: {
      namelength: -1,
    },
    // JRNY default categorical palette — WCAG-AA, deuteranopia-safe.
    // Series can still override per-series via options.seriesOptions[].color.
    colorway: JrnyCategoricalArray,
  };

  // Apply dark / light surface overrides so charts blend with the surrounding
  // widget card on either theme. xaxis/yaxis gridcolor merge happens in the
  // per-axis prep below — we splat the high-level keys first, then per-axis
  // overrides extend the prepared axis objects below.
  const themeOverrides: any = isDarkActive() ? DARK_LAYOUT_OVERRIDES : LIGHT_LAYOUT_OVERRIDES;
  layout.paper_bgcolor = themeOverrides.paper_bgcolor;
  layout.plot_bgcolor = themeOverrides.plot_bgcolor;
  layout.font = themeOverrides.font;
  (layout as any).__jrnyThemeOverrides = themeOverrides;

  if (["line", "area", "column", "combo", "slope"].includes(options.globalSeriesType)) {
    layout.hovermode = options.swappedAxes ? 'y' : 'x';
  }

  let prepared: any;
  switch (options.globalSeriesType) {
    case "pie":
      prepared = preparePieLayout(layout, options, data);
      break;
    case "box":
      prepared = prepareBoxLayout(layout, options, data);
      break;
    case "waterfall":
      // Feature #198: Waterfall — same axes as default; tighten the bar gap so
      // increasing/decreasing/total bars sit close together for a bridge feel.
      prepared = prepareDefaultLayout(layout, options, data);
      prepared.waterfallgap = 0.3;
      break;
    case "bullet":
      // Feature #199: Bullet indicators handle their own labels/axes via
      // domain + gauge. Keep the figure chrome minimal so they read as a
      // KPI scorecard rather than a chart.
      prepared = layout;
      prepared.showlegend = false;
      prepared.margin = { l: 80, r: 20, b: 20, t: 20, pad: 4 };
      break;
    default:
      prepared = prepareDefaultLayout(layout, options, data);
      break;
  }

  // User-defined chart annotations (vlines / ranges / point callouts).
  // Skip pie/custom — they have no x/y axis to anchor on. The Annotations
  // tab is also hidden for those types in the editor, but check here too
  // in case someone pastes options.annotations directly into a pie chart.
  if (options.globalSeriesType !== "pie" && options.globalSeriesType !== "custom") {
    applyAnnotations(prepared, options);
  }

  // Feature #201: Pareto preset — ensure secondary axis is percent-formatted
  // and (optionally) draw a dashed horizontal threshold line at 80%. The
  // pareto module already added the cumulative trace; here we configure y2
  // and render the threshold callout.
  if (options.__paretoCumulative) {
    prepared.yaxis2 = prepared.yaxis2 || { overlaying: "y", side: "right", autorange: true };
    prepared.yaxis2.title = { text: "Cumulative %" };
    prepared.yaxis2.range = [0, 1.0];
    prepared.yaxis2.tickformat = ".0%";
    prepared.yaxis2.showgrid = false;
    if (options.__paretoThreshold && typeof options.__paretoThreshold.value === "number") {
      const threshold = options.__paretoThreshold.value;
      const color = options.__paretoThreshold.color || "#475569";
      const shapes: any[] = isArray(prepared.shapes) ? prepared.shapes.slice() : [];
      shapes.push({
        type: "line",
        xref: "paper",
        yref: "y2",
        x0: 0,
        x1: 1,
        y0: threshold,
        y1: threshold,
        line: { color, width: 1, dash: "dash" },
        opacity: 0.85,
        layer: "above",
      });
      const labels: any[] = isArray(prepared.annotations) ? prepared.annotations.slice() : [];
      labels.push({
        xref: "paper",
        yref: "y2",
        x: 0.99,
        y: threshold,
        yanchor: "bottom",
        xanchor: "right",
        text: `${Math.round(threshold * 100)}%`,
        showarrow: false,
        bgcolor: "rgba(255,255,255,0.85)",
        bordercolor: color,
        borderwidth: 1,
        borderpad: 2,
        font: { color, size: 10 },
      });
      prepared.shapes = shapes;
      prepared.annotations = labels;
    }
    delete options.__paretoCumulative;
    delete options.__paretoThreshold;
  }

  // Feature #203: Population pyramid — switch to overlay barmode so the two
  // series share the same bar slot, and format the value axis as a count.
  // The pyramid module already negated the left series' y values for layout
  // but stored absolute magnitudes on `series.text` so labels and tooltips
  // read positive on both sides.
  if (options.__pyramidActive) {
    prepared.barmode = "overlay";
    if (options.swappedAxes) {
      prepared.xaxis = prepared.xaxis || {};
      prepared.xaxis.tickformat = ",d";
    } else {
      prepared.yaxis = prepared.yaxis || {};
      prepared.yaxis.tickformat = ",d";
    }
    delete options.__pyramidActive;
  }

  // Feature #202: Small multiples / trellis layout — build a Plotly grid +
  // per-subplot axis defs. `grid.pattern: "independent"` gives each subplot
  // its own axis; when shareX/shareY is true we cross-link them via `matches:`
  // so pan/zoom is synchronised. Outer-only labels collapse axis clutter on
  // dense grids.
  if (options.__facetGrid) {
    const fg = options.__facetGrid;
    prepared.grid = {
      rows: fg.rows,
      columns: fg.cols,
      pattern: "independent",
      roworder: "top to bottom",
    };

    const baseX = prepared.xaxis ? { ...prepared.xaxis } : {};
    const baseY = prepared.yaxis ? { ...prepared.yaxis } : {};

    for (let i = 0; i < fg.facets.length; i++) {
      const n = i + 1;
      const xKey = n === 1 ? "xaxis" : `xaxis${n}`;
      const yKey = n === 1 ? "yaxis" : `yaxis${n}`;

      if (n !== 1) {
        prepared[xKey] = {
          ...baseX,
          anchor: `y${n}`,
          ...(fg.shareX ? { matches: "x" } : {}),
        };
        prepared[yKey] = {
          ...baseY,
          anchor: `x${n}`,
          ...(fg.shareY ? { matches: "y" } : {}),
        };
      }

      if (fg.showOnlyOuterLabels) {
        const row = Math.floor(i / fg.cols);
        const col = i % fg.cols;
        const lastRow = fg.rows - 1;
        if (row !== lastRow && fg.shareX) {
          prepared[xKey] = { ...prepared[xKey], showticklabels: false };
        }
        if (col !== 0 && fg.shareY) {
          prepared[yKey] = { ...prepared[yKey], showticklabels: false };
        }
      }
    }

    // Subplot titles — one annotation per cell, centred above each subplot.
    const labels: any[] = isArray(prepared.annotations) ? prepared.annotations.slice() : [];
    const padX = 0.02;
    const padY = 0.04;
    const cellW = fg.cols > 1 ? (1 - padX * (fg.cols - 1)) / fg.cols : 1;
    const cellH = fg.rows > 1 ? (1 - padY * (fg.rows - 1)) / fg.rows : 1;
    for (let i = 0; i < fg.facets.length; i++) {
      const row = Math.floor(i / fg.cols);
      const col = i % fg.cols;
      const xCentre = col * (cellW + padX) + cellW / 2;
      const yTop = 1 - row * (cellH + padY);
      labels.push({
        xref: "paper",
        yref: "paper",
        x: xCentre,
        y: yTop,
        xanchor: "center",
        yanchor: "bottom",
        text: `<b>${fg.facets[i]}</b>`,
        showarrow: false,
        font: { size: 11 },
      });
    }
    prepared.annotations = labels;
    delete options.__facetGrid;
  }

  // Feature #200: Forecast divider — vertical line at the boundary between
  // actuals and forecast values. appendForecastTraces() stashes the boundary
  // x-value on options.__forecastDividerX; consume + clear it here.
  if (options.__forecastDividerX !== undefined && options.__forecastDividerX !== null) {
    const dividerX = options.__forecastDividerX;
    const shapes: any[] = isArray(prepared.shapes) ? prepared.shapes.slice() : [];
    shapes.push({
      type: "line",
      xref: "x",
      yref: "paper",
      x0: dividerX,
      x1: dividerX,
      y0: 0,
      y1: 1,
      line: { color: "#94a3b8", width: 1, dash: "dot" },
      opacity: 0.8,
      layer: "above",
    });
    const labels: any[] = isArray(prepared.annotations) ? prepared.annotations.slice() : [];
    labels.push({
      xref: "x",
      yref: "paper",
      x: dividerX,
      y: 0.97,
      yanchor: "top",
      xanchor: "left",
      text: "Forecast →",
      showarrow: false,
      bgcolor: "rgba(255,255,255,0.85)",
      bordercolor: "#94a3b8",
      borderwidth: 1,
      borderpad: 2,
      font: { color: "#475569", size: 10 },
    });
    prepared.shapes = shapes;
    prepared.annotations = labels;
    // Clear the side-channel marker so a re-render with new data doesn't
    // double-draw the divider.
    delete options.__forecastDividerX;
  }

  return prepared;
}
