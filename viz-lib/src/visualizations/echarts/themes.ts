/**
 * JRNYBI ECharts themes (light & dark).
 *
 * Color values mirror the WCAG-AA categorical palette defined in
 * client/app/assets/less/jrny-theme.less. Kept as plain TS objects so the
 * viz-lib package has no runtime dependency on the main client's LESS
 * tokens — the values are duplicated intentionally (a single test will
 * keep them in sync; see ColorsSettings.test.tsx for the pattern).
 */

const CATEGORICAL_PALETTE = [
  "#4e79a7", // steel blue
  "#f28e2b", // burnt orange
  "#59a14f", // muted green
  "#e15759", // coral red
  "#76b7b2", // teal
  "#edc948", // mustard
  "#b07aa1", // dusty purple
  "#ff9da7", // peach pink
  "#9c755f", // brown
  "#bab0ac", // warm grey
];

export const jrnyLightTheme = {
  color: CATEGORICAL_PALETTE,
  backgroundColor: "transparent",
  textStyle: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    color: "#0f172a",
  },
  title: {
    textStyle: { color: "#0f172a", fontWeight: 600 },
    subtextStyle: { color: "#475569" },
  },
  legend: {
    textStyle: { color: "#334155" },
  },
  tooltip: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    textStyle: { color: "#0f172a" },
    extraCssText: "box-shadow: 0 4px 12px rgba(15,23,42,0.10);",
  },
  axisPointer: {
    lineStyle: { color: "#64748b" },
    crossStyle: { color: "#64748b" },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#cbd5e1" } },
    axisTick: { lineStyle: { color: "#cbd5e1" } },
    axisLabel: { color: "#475569" },
    splitLine: { lineStyle: { color: "#f1f5f9" } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: "#cbd5e1" } },
    axisTick: { lineStyle: { color: "#cbd5e1" } },
    axisLabel: { color: "#475569" },
    splitLine: { lineStyle: { color: "#f1f5f9" } },
  },
  logAxis: {
    axisLine: { lineStyle: { color: "#cbd5e1" } },
    splitLine: { lineStyle: { color: "#f1f5f9" } },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: "#cbd5e1" } },
    splitLine: { lineStyle: { color: "#f1f5f9" } },
  },
  visualMap: {
    color: ["#1d4ed8", "#bfdbfe"],
  },
  dataZoom: {
    backgroundColor: "#f8fafc",
    fillerColor: "rgba(37,99,235,0.10)",
    handleColor: "#2563eb",
    handleSize: "100%",
    textStyle: { color: "#475569" },
  },
};

export const jrnyDarkTheme = {
  color: CATEGORICAL_PALETTE,
  backgroundColor: "transparent",
  textStyle: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    color: "#e2e8f0",
  },
  title: {
    textStyle: { color: "#f8fafc", fontWeight: 600 },
    subtextStyle: { color: "#cbd5e1" },
  },
  legend: {
    textStyle: { color: "#cbd5e1" },
  },
  tooltip: {
    backgroundColor: "#1e293b",
    borderColor: "#334155",
    borderWidth: 1,
    textStyle: { color: "#f8fafc" },
    extraCssText: "box-shadow: 0 4px 12px rgba(0,0,0,0.40);",
  },
  axisPointer: {
    lineStyle: { color: "#94a3b8" },
    crossStyle: { color: "#94a3b8" },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#475569" } },
    axisTick: { lineStyle: { color: "#475569" } },
    axisLabel: { color: "#cbd5e1" },
    splitLine: { lineStyle: { color: "#1e293b" } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: "#475569" } },
    axisTick: { lineStyle: { color: "#475569" } },
    axisLabel: { color: "#cbd5e1" },
    splitLine: { lineStyle: { color: "#1e293b" } },
  },
  logAxis: {
    axisLine: { lineStyle: { color: "#475569" } },
    splitLine: { lineStyle: { color: "#1e293b" } },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: "#475569" } },
    splitLine: { lineStyle: { color: "#1e293b" } },
  },
  visualMap: {
    color: ["#60a5fa", "#1e3a8a"],
  },
  dataZoom: {
    backgroundColor: "#0f172a",
    fillerColor: "rgba(96,165,250,0.20)",
    handleColor: "#60a5fa",
    handleSize: "100%",
    textStyle: { color: "#cbd5e1" },
  },
};

export const JRNYBI_CATEGORICAL_PALETTE = CATEGORICAL_PALETTE;
