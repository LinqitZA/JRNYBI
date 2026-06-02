// Feature #194: Calendar heatmap chart type (ECharts)
//
// Registers the Calendar Heatmap visualization with the JRNYBI viz-lib
// registry. Built on Apache ECharts' calendar coordinate system + heatmap
// series; uses the shared `registerEChartsVisualization` helper so we
// inherit the standard renderer (resize, theme, locale) and the tabbed
// editor pattern.
//
// Use cases:
//   - sales-by-day (rolling year of revenue activity)
//   - transaction-volume-by-day (operational throughput heatmap)
//   - login-activity-by-day (engagement / churn signal)
//
// The calendar series renders a year-view grid where each cell's colour
// is driven by the daily aggregate of the value column. Year range is
// auto-detected from the data when only a single date column is mapped.

import registerEChartsVisualization from "../echarts/registerEChartsVisualization";
import getOption from "./getOption";
import Editor from "./Editor";

const DEFAULT_OPTIONS = {
  // ECharts wrapper defaults — calendar heatmaps benefit from a visible
  // legend (the colour ramp doubles as the value scale) but rarely from
  // a separate categorical legend, so we keep the standard `showLegend`
  // toggle and reinterpret it as "show the visualMap colour ramp".
  showLegend: true,
  showTooltip: true,
  theme: "jrny-light",

  // Column mapping — populated via the Calendar tab in the editor.
  columnMapping: {
    date: null,    // required: date / day / created_at column
    value: null,   // required: numeric metric
    series: null,  // optional: split by series (currently informational)
  },

  // Year-range mode — see getOption.ts for the resolution algorithm.
  //   "single"     — show a single calendar year (auto-detected from data
  //                  when `year` is null)
  //   "rolling12"  — show the 12 months ending at the latest date in data
  //   "custom"     — show the window between rangeStart and rangeEnd
  yearMode: "single" as "single" | "rolling12" | "custom",
  year: null as number | null,
  rangeStart: null as string | null,
  rangeEnd: null as string | null,

  // Visual knobs.
  colorScale: "green",            // see CALENDAR_COLOR_SCALES in getOption.ts
  showWeekdayLabels: true,
  showMonthLabels: true,
  firstDayOfWeek: 1,              // 0 = Sunday, 1 = Monday (ISO default)
  emptyDayColor: "#f1f5f9",

  // visualMap min/max — when left null the renderer auto-derives from data.
  // Useful to set explicitly when comparing the same metric across cards.
  min: null as number | null,
  max: null as number | null,

  // How multiple rows on the same calendar day are collapsed.
  aggregation: "sum" as "sum" | "avg" | "count" | "max" | "min",

  title: "",
  subtitle: "",
};

export default registerEChartsVisualization({
  type: "ECHARTS_CALENDAR_HEATMAP",
  name: "Calendar Heatmap",
  getOption,
  getOptions: (options: any) => ({ ...DEFAULT_OPTIONS, ...options }),
  Editor,
  defaultColumns: 12,  // calendar is wide — give it plenty of horizontal room
  defaultRows: 6,
  minColumns: 6,
  minRows: 4,
});
