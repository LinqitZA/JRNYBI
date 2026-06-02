// Feature #197: Radar / spider chart type (ECharts)
//
// Registers the Radar visualization with the JRNYBI viz-lib registry. Built
// on Apache ECharts' RadarChart series; uses the shared
// `registerEChartsVisualization` helper so we inherit the standard renderer
// (resize, theme, locale) and the tabbed editor pattern.
//
// Use cases:
//   - vendor scorecards — compare suppliers across delivery, quality, price,
//     OTIF in a single multi-axis plot
//   - employee performance — competencies (technical / communication /
//     leadership / delivery / collaboration) per reviewee
//   - product feature comparison — competitor SKUs scored on features
//
// Mapping is "one row per supplier/employee/product, one column per axis"
// OR a long-format "dimension, value, series" triple where each unique
// series produces an overlaid polygon (e.g. Last Year vs This Year).

import registerEChartsVisualization from "../echarts/registerEChartsVisualization";
import getOption from "./getOption";
import Editor from "./Editor";

const DEFAULT_OPTIONS = {
  // ECharts wrapper defaults.
  showLegend: true,
  showTooltip: true,
  theme: "jrny-light",

  // Column mapping — populated via the Radar tab in the editor.
  columnMapping: {
    // Wide-format (default): one row per series, one column per axis.
    series: null,        // categorical column identifying each polygon (e.g. supplier_name)
    axes: [] as string[], // numeric columns — each becomes one radar axis

    // Long-format (alternative): one row per (series, dimension, value) triple.
    dimension: null,     // axis label column (e.g. dimension_name)
    value: null,         // numeric value column (e.g. score)
  },

  // Axis scale — three flavours:
  //   "auto"     — each axis ranges over [min, max] of all its observed values
  //   "0-100"    — all axes share a fixed [0, 100] scale (good for % scores)
  //   "shared"   — all axes share [global_min, global_max] across the dataset
  scale: "0-100" as "auto" | "0-100" | "shared",

  // Polygon vs circle background grid.
  shape: "polygon" as "polygon" | "circle",

  // Fill opacity for each radar polygon (0 = outline only, 1 = solid fill).
  fillOpacity: 0.25,

  // Stroke width for each radar polygon outline.
  lineWidth: 2,

  // Whether to render the small dot marker at each axis intersection.
  showSymbol: true,

  // Whether axis labels are visible (the indicator names around the chart).
  showAxisLabels: true,

  // Whether axis value tick numbers are visible (e.g. 25, 50, 75, 100).
  showAxisTicks: false,

  title: "",
  subtitle: "",
};

export default registerEChartsVisualization({
  type: "ECHARTS_RADAR",
  name: "Radar",
  getOption,
  getOptions: (options: any) => ({ ...DEFAULT_OPTIONS, ...options }),
  Editor,
  defaultColumns: 6,
  defaultRows: 8,
  minColumns: 3,
  minRows: 5,
});
