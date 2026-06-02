// Feature #193: Treemap chart type (ECharts)
//
// Registers the Treemap visualization with the JRNYBI viz-lib registry.
// Built on Apache ECharts' TreemapChart series; uses the shared
// `registerEChartsVisualization` helper so we inherit the standard renderer
// (resize, theme, locale) and the tabbed editor pattern.

import registerEChartsVisualization from "../echarts/registerEChartsVisualization";
import getOption from "./getOption";
import Editor from "./Editor";

const DEFAULT_OPTIONS = {
  // ECharts wrapper defaults (legend / tooltip / theme).
  showLegend: false, // treemaps don't really benefit from a legend
  showTooltip: true,
  theme: "jrny-light",

  // Column mapping — populated via the Treemap tab in the editor.
  columnMapping: {
    path: null,         // single "parent>child" string column
    levels: [],         // ordered list of column names (alternative to path)
    value: null,        // numeric value (rectangle size)
    color: null,        // optional numeric metric driving the gradient
  },

  pathSeparator: ">",

  // Layout knobs surfaced in the Treemap tab.
  drilldownDepth: 2,
  showLeafLabels: true,
  dropEmpty: false,
  colorMode: "categorical" as const,  // "categorical" | "gradient"
  tooltipFormat: "",                  // empty = use the default formatter

  title: "",
  subtitle: "",
};

export default registerEChartsVisualization({
  type: "ECHARTS_TREEMAP",
  name: "Treemap",
  getOption,
  getOptions: (options: any) => ({ ...DEFAULT_OPTIONS, ...options }),
  Editor,
  defaultColumns: 6,
  defaultRows: 8,
  minColumns: 3,
  minRows: 5,
});
