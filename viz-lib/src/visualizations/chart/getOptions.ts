import { merge } from "lodash";
import { visualizationsSettings } from "@/visualizations/visualizationsSettings";

const DEFAULT_OPTIONS = {
  globalSeriesType: "column",
  sortX: true,
  legend: { enabled: true, placement: "auto", traceorder: "normal" },
  xAxis: { type: "-", labels: { enabled: true } },
  yAxis: [{ type: "linear" }, { type: "linear", opposite: true }],
  alignYAxesAtZero: false,
  error_y: { type: "data", visible: true },
  series: { stacking: null, error_y: { type: "data", visible: true } },
  seriesOptions: {},
  valuesOptions: {},
  columnMapping: {},
  direction: { type: "counterclockwise" },
  sizemode: "diameter",
  coefficient: 1,
  piesort: true,
  color_scheme: "Redash",
  lineShape: "linear",

  // showDataLabels: false, // depends on chart type
  numberFormat: "0,0[.]00000",
  percentFormat: "0[.]00%",
  // dateTimeFormat: 'DD/MM/YYYY HH:mm', // will be set from visualizationsSettings
  textFormat: "", // default: combination of {{ @@yPercent }} ({{ @@y }} ± {{ @@yError }})

  enableLink: false,
  linkOpenNewTab: true,
  linkFormat: "", // template like a textFormat

  missingValuesAsZero: true,

  // Anomaly detection (Feature #216)
  showAnomalies: false,
  anomalyWindow: 30,
  anomalyThreshold: 2,

  // Feature #198: Waterfall chart options
  waterfall: {
    increasingColor: "#117a3b",   // JrnySemantic.positive
    decreasingColor: "#b42318",   // JrnySemantic.negative
    totalColor: "#475569",        // JrnySemantic.neutral
    connectorVisible: true,
  },

  // Feature #199: Bullet graph (actual vs target with qualitative bands)
  bullet: {
    poorColor: "#fee2e2",         // JrnySemantic.negativeBg — soft red
    satisfactoryColor: "#fef3c7", // JrnySemantic.warningBg — soft amber
    goodColor: "#d1fae5",         // JrnySemantic.positiveBg — soft green
    barColor: "#0f172a",          // JRNY surface-text dark — high-contrast bar
    targetColor: "#b42318",       // JrnySemantic.negative — strong target line
    orientation: "horizontal",    // 'horizontal' | 'vertical' — reserved for future
  },

  // Feature #200: Forecast band overlay (line chart with confidence interval)
  forecast: {
    enabled: false,
    bandColor: "#1d4ed8",         // JrnySemantic.info
    bandOpacity: 0.2,
    forecastLineDash: "dash",     // 'solid' | 'dash' | 'dot'
    showDivider: true,
  },

  // Feature #201: Pareto chart preset (sorted bars + cumulative % line on y2)
  // When enabled with a column chart, sorts bars descending by y and adds a
  // cumulative-percentage line series on the secondary axis. Optional 80%
  // (or configurable) threshold dashed line for "vital few / trivial many" callouts.
  pareto: {
    enabled: false,
    cumulativeColor: "#b42318",   // JrnySemantic.negative — draws the eye
    cumulativeLineDash: "solid",
    showThreshold: true,
    threshold: 0.8,               // 0..1, displayed as a horizontal line at this % on y2
    thresholdColor: "#475569",    // JrnySemantic.neutral
  },

  // Feature #202: Small multiples / trellis layout (Plotly facets)
  // Splits the chart into a grid of subplots, one per unique value of a facet
  // column (selected via columnMapping "facet"). When `columns` is null we
  // auto-compute a near-square grid from sqrt(facetCount).
  facet: {
    enabled: false,
    columns: null,                // null = auto-compute
    shareX: true,
    shareY: true,
    showOnlyOuterLabels: true,    // compact axis labelling
    maxFacets: 16,                // safety cap so a 200-cat column doesn't lock the browser
  },

  // Feature #203: Population pyramid preset (mirrored bar chart)
  // Two series share a category axis, one negated for layout but displayed as
  // absolute on labels/tooltips. Naturally pairs with `swappedAxes: true`
  // (horizontal bars) which is the canonical pyramid orientation.
  pyramid: {
    enabled: false,
    leftSeries: null,             // series name; first when null
    rightSeries: null,            // series name; second when null
    leftColor: "#1d4ed8",         // JrnySemantic.info
    rightColor: "#b42318",        // JrnySemantic.negative
  },

  // Feature #204: Slope / connected-scatter chart — each entity (series) is a
  // thin line + markers connecting its two (or more) points on the x-axis.
  // Lines are colored by direction (up = positive change, down = negative,
  // neutral = no/single value) so the audience reads the chart at a glance
  // (e.g. ranking change from last year to this year).
  slope: {
    upColor: "#117a3b",           // JrnySemantic.positive
    downColor: "#b42318",         // JrnySemantic.negative
    neutralColor: "#94a3b8",      // JrnySemantic.neutralSoft
    showEndpointLabels: true,     // series name + y-value at the line endpoints
    lineWidth: 1.5,
    markerSize: 6,
  },

  // Feature #205: Combo / dual-axis preset (UX-only — series-level overrides
  // do the real work). When 'combo' is selected, globalSeriesType is set to
  // 'column' under the hood and `combo.enabled` flips on; the Series tab then
  // surfaces a per-series Y-Axis (Left/Right) radio so users can put one
  // series on a primary axis (bar) and another on a secondary axis (line).
  combo: {
    enabled: false,
  },

  // Feature #187: Smart contextual tooltips (delta + sparkline-in-tooltip).
  // When enabled and the x-axis is datetime, each line / area / column point
  // surfaces:
  //   - the value (default Plotly behaviour)
  //   - the delta vs the chosen comparison period (WoW / MoM / QoQ / YoY)
  //   - a mini SVG sparkline of the trailing N points
  // The implementation lives in chart/plotly/contextualTooltip.ts.
  contextualTooltip: {
    enabled: false,
    comparisonPeriod: "auto",     // 'auto' | 'previous' | 'wow' | 'mom' | 'qoq' | 'yoy'
    sparklineWindow: 8,           // last N points drawn into the tooltip
  },
};

export default function getOptions(options: any) {
  const result = merge(
    {},
    DEFAULT_OPTIONS,
    {
      showDataLabels: options.globalSeriesType === "pie",
      dateTimeFormat: visualizationsSettings.dateTimeFormat,
    },
    options
  );

  // Backward compatibility
  if (["normal", "percent"].indexOf(result.series.stacking) >= 0) {
    result.series.percentValues = result.series.stacking === "percent";
    result.series.stacking = "stack";
  }

  return result;
}
