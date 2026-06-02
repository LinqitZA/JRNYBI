// Feature #195: Gantt chart type (ECharts custom series)
//
// Registers the Gantt visualization with the JRNYBI viz-lib registry. Built
// on Apache ECharts' custom-series renderer which gives us pixel-level
// control over each task rectangle (and the optional progress overlay).
//
// Typical use cases:
//   - PO / purchase-order lifecycle timelines
//   - Production run schedules
//   - Project task lists with status colouring
//
// The Gantt renderer plots a category × time grid: y-axis is the task list,
// x-axis is the time range spanning the earliest start through the latest
// end (with a slider dataZoom so users can drill into a date window).

import registerEChartsVisualization from "../echarts/registerEChartsVisualization";
import getOption from "./getOption";
import Editor from "./Editor";

const DEFAULT_OPTIONS = {
  // ECharts wrapper defaults.
  showLegend: false,    // status colouring goes through the colour map, not a categorical legend
  showTooltip: true,
  theme: "jrny-light",

  // Column mapping — populated via the Gantt tab in the editor.
  columnMapping: {
    task: null,       // required: row category (e.g. PO #, task name)
    start: null,      // required: start date
    end: null,        // required: end date
    status: null,     // optional: drives colouring
    progress: null,   // optional: 0-1 or 0-100 inset progress bar
  },

  // Sort order for the y-axis category list.
  sortOrder: "start" as "start" | "end" | "task" | "duration" | "asAdded",

  // Today line.
  showTodayLine: true,
  todayDate: null as string | null,   // YYYY-MM-DD; null → real now() at render

  // Visuals.
  showProgressBar: true,
  barHeight: 18,
  statusColors: {} as Record<string, string>,

  // Tooltip template; empty string → default "{task} · {start} → {end} · {duration}d".
  tooltipFormat: "",

  title: "",
  subtitle: "",
};

export default registerEChartsVisualization({
  type: "ECHARTS_GANTT",
  name: "Gantt",
  getOption,
  getOptions: (options: any) => ({ ...DEFAULT_OPTIONS, ...options }),
  Editor,
  defaultColumns: 12,
  defaultRows: 8,
  minColumns: 6,
  minRows: 5,
});
