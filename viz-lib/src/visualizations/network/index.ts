// Feature #196: Network / graph chart type (ECharts)
//
// Registers the Network visualization with the JRNYBI viz-lib registry.
// Built on Apache ECharts' GraphChart with force / circular / manual
// layouts. The renderer derives the node set from the union of source +
// target values in an edge table — no separate nodes query needed for
// the common case.
//
// Use cases:
//   - customer ↔ vendor relationship maps
//   - GL account flow diagrams (source/target accounts + amount)
//   - supply chain dependency graphs

import registerEChartsVisualization from "../echarts/registerEChartsVisualization";
import getOption from "./getOption";
import Editor from "./Editor";

const DEFAULT_OPTIONS = {
  // ECharts wrapper defaults — show a categorical legend when colour-by-
  // group is on, which is the common case.
  showLegend: true,
  showTooltip: true,
  theme: "jrny-light",

  // Column mapping — populated via the Network tab in the editor.
  columnMapping: {
    source: null,        // required: edge source id
    target: null,        // required: edge target id
    weight: null,        // optional: numeric edge weight
    sourceGroup: null,   // optional: type / category of source node
    targetGroup: null,   // optional: type / category of target node
  },

  // Layout.
  layout: "force" as "force" | "circular" | "none",
  repulsion: 120,
  gravity: 0.08,
  edgeLength: 60,

  // Sizing / labelling.
  nodeSizeMin: 12,
  nodeSizeMax: 48,
  edgeWidthMin: 1,
  edgeWidthMax: 6,
  labelMinSize: 0,

  // Visual encoding.
  colorByGroup: true,
  groupColors: {} as Record<string, string>,
  showArrows: false,

  title: "",
  subtitle: "",
};

export default registerEChartsVisualization({
  type: "ECHARTS_NETWORK",
  name: "Network",
  getOption,
  getOptions: (options: any) => ({ ...DEFAULT_OPTIONS, ...options }),
  Editor,
  defaultColumns: 10,
  defaultRows: 8,
  minColumns: 5,
  minRows: 5,
});
