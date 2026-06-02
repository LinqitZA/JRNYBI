// Feature #193: Treemap chart type (ECharts)
//
// Builds an ECharts option object for a hierarchical treemap from a flat
// query result. Honours the editor settings:
//
//   - pathColumn / levelColumns / valueColumn / colorColumn (column mapping)
//   - drilldownDepth   — how many levels are visible without zooming in
//   - showLeafLabels   — whether to print leaf labels inside the rectangles
//   - colorMode        — "categorical" (palette) or "gradient" (visualMap)
//   - tooltipFormat    — printf-style template, default shows name + value
//
// The accessible JRNYBI palette comes from `themes.ts` and is applied as the
// `color` array when colorMode is "categorical". Gradient mode encodes the
// value of the optional color metric column into a sequential blue scale.

import buildTree, { BuildTreeResult, TreeNode } from "./buildTree";
import { JRNYBI_CATEGORICAL_PALETTE } from "../echarts/themes";

const GRADIENT_RANGE = ["#bfdbfe", "#1d4ed8"]; // JrnySemantic.infoBg → info

function numberFormat(value: any, pattern?: string): string {
  if (value === null || value === undefined || isNaN(Number(value))) return "—";
  const n = Number(value);
  // Lightweight formatter — group thousands with a comma, two-decimal max.
  // Honours an optional explicit pattern only for trivial cases.
  if (pattern === "0,0") {
    return Math.round(n).toLocaleString();
  }
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function colorByDepthLevels(palette: string[], depth: number) {
  // Cycle the palette across levels for visual differentiation. We dim
  // deeper levels slightly so the parent rectangle reads as a "container".
  return palette.map((_c, idx) => ({
    color: palette[(idx + depth) % palette.length],
  }));
}

export default function getOption(data: any, options: any) {
  const opts = options || {};
  const rows: any[] = (data && data.rows) || [];
  const columns: any[] = (data && data.columns) || [];

  // ---------------------------------------------------------------------------
  // Resolve column mappings — fall back to the obvious defaults when the user
  // hasn't picked anything yet so the viz still renders something useful.
  // ---------------------------------------------------------------------------
  const colNames: string[] = columns.map((c: any) => c.name).filter(Boolean);
  const mapping = opts.columnMapping || {};

  const pathColumn: string | null = mapping.path || opts.pathColumn || null;
  const levelColumns: string[] | null = Array.isArray(mapping.levels)
    ? mapping.levels
    : Array.isArray(opts.levelColumns)
    ? opts.levelColumns
    : null;
  const valueColumn: string =
    mapping.value || opts.valueColumn || colNames.find((n) => /value|amount|total|sum|count/i.test(n)) || colNames[1] || colNames[0];
  const colorColumn: string | null = mapping.color || opts.colorColumn || null;

  // ---------------------------------------------------------------------------
  // Build the tree from rows.
  // ---------------------------------------------------------------------------
  let tree: BuildTreeResult;
  try {
    tree = buildTree({
      rows,
      pathColumn,
      pathSeparator: opts.pathSeparator || ">",
      levelColumns: pathColumn ? null : levelColumns,
      valueColumn,
      colorColumn,
      dropEmpty: !!opts.dropEmpty,
    });
  } catch (err) {
    return {
      title: { text: "Treemap: build failed", left: "center", top: "center" },
    };
  }

  if (!tree.data || tree.data.length === 0) {
    return {
      title: {
        text: "Treemap: pick a path or level columns + a value column",
        left: "center",
        top: "center",
        textStyle: { fontSize: 12, fontWeight: "normal", color: "#475569" },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Series-level layout knobs.
  // ---------------------------------------------------------------------------
  const drilldownDepth: number = Math.max(1, Math.min(8, Number(opts.drilldownDepth) || 2));
  const showLeafLabels: boolean = opts.showLeafLabels !== false;
  const colorMode: "categorical" | "gradient" =
    opts.colorMode === "gradient" ? "gradient" : "categorical";

  const palette: string[] =
    Array.isArray(opts.palette) && opts.palette.length > 0
      ? opts.palette
      : JRNYBI_CATEGORICAL_PALETTE;

  // ECharts can colour leaves by visualMap if we map their `value` to the
  // visualMap dimension — we encode the color metric onto the leaf nodes.
  const useGradient = colorMode === "gradient" && tree.colorMax !== null && tree.colorMin !== null;
  const valueDimensionForVisualMap = 1;
  // Walk the tree and project color metric into a second value dimension
  // when gradient mode is on, otherwise leave the value array as scalars.
  const project = (node: TreeNode): any => {
    const out: any = { name: node.name };
    // Multi-dimensional value: index 0 → size, index 1 → color metric.
    if (useGradient) {
      out.value = [node.value ?? 0, node.__colorMetric ?? node.value ?? 0];
    } else {
      out.value = node.value ?? 0;
    }
    if (node.itemStyle) out.itemStyle = node.itemStyle;
    if (node.children && node.children.length > 0) {
      out.children = node.children.map(project);
    }
    return out;
  };
  const seriesData = tree.data.map(project);

  // ---------------------------------------------------------------------------
  // Tooltip — keep it readable on dark widget cards.
  // ---------------------------------------------------------------------------
  const tooltipFormat: string | undefined = opts.tooltipFormat;
  const tooltipFormatter = (info: any): string => {
    if (!info) return "";
    const treePathInfo = info.treePathInfo || [];
    const path = treePathInfo.map((p: any) => p.name).filter(Boolean).join(" › ");
    const rawValue = useGradient ? (Array.isArray(info.value) ? info.value[0] : info.value) : info.value;
    const valStr = numberFormat(rawValue, opts.numberFormat);
    if (typeof tooltipFormat === "string" && tooltipFormat.trim().length > 0) {
      return tooltipFormat
        .replace(/\{path\}/g, path)
        .replace(/\{name\}/g, info.name || "")
        .replace(/\{value\}/g, valStr);
    }
    return `<div style="font-weight:600">${path || info.name || ""}</div>
            <div>${valStr}</div>`;
  };

  // ---------------------------------------------------------------------------
  // Build the ECharts option object.
  // ---------------------------------------------------------------------------
  const option: any = {
    title: opts.title
      ? {
          text: opts.title,
          subtext: opts.subtitle || "",
          left: "center",
          top: 8,
        }
      : undefined,
    tooltip: {
      show: opts.showTooltip !== false,
      formatter: tooltipFormatter,
      borderColor: "#e2e8f0",
      borderWidth: 1,
      backgroundColor: "#ffffff",
      textStyle: { color: "#0f172a" },
      extraCssText: "box-shadow: 0 4px 12px rgba(15,23,42,0.10);",
    },
    color: palette,
    series: [
      {
        type: "treemap",
        name: opts.title || "Treemap",
        data: seriesData,
        leafDepth: drilldownDepth,
        roam: false,
        nodeClick: "zoomToNode",
        breadcrumb: {
          show: true,
          height: 22,
          left: "center",
          bottom: 4,
          emptyItemWidth: 25,
          itemStyle: {
            color: "#f1f5f9",
            borderColor: "#cbd5e1",
            borderWidth: 1,
            textStyle: { color: "#334155", fontSize: 11 },
          },
        },
        label: {
          show: showLeafLabels,
          formatter: (info: any) => {
            const v = useGradient && Array.isArray(info.value) ? info.value[0] : info.value;
            return `${info.name}\n{val|${numberFormat(v, opts.numberFormat)}}`;
          },
          rich: {
            val: { fontSize: 10, color: "rgba(255,255,255,0.85)" },
          },
          color: "#ffffff",
          fontSize: 12,
          fontWeight: 500,
          textShadowColor: "rgba(0,0,0,0.3)",
          textShadowBlur: 2,
        },
        upperLabel: {
          show: true,
          height: 18,
          color: "#0f172a",
          fontSize: 11,
          fontWeight: 600,
        },
        itemStyle: {
          borderColor: "#ffffff",
          borderWidth: 1,
          gapWidth: 1,
        },
        levels: [
          {
            // root level — invisible container
            itemStyle: { borderWidth: 0, gapWidth: 2 },
          },
          // Sub-levels each get a slightly darker border so the hierarchy
          // is readable even before zooming in.
          ...[1, 2, 3, 4].map((depth) => ({
            colorSaturation: [0.35, 0.55],
            itemStyle: {
              borderColorSaturation: 0.6,
              borderWidth: depth === 1 ? 2 : 1,
              gapWidth: depth === 1 ? 2 : 1,
            },
            color: useGradient ? undefined : colorByDepthLevels(palette, depth).map((c) => c.color),
            upperLabel: {
              show: depth <= drilldownDepth,
            },
          })),
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(15,23,42,0.20)",
          },
          label: {
            fontWeight: 700,
          },
        },
      },
    ],
  };

  if (useGradient) {
    option.visualMap = {
      type: "continuous",
      min: tree.colorMin as number,
      max: tree.colorMax as number,
      dimension: valueDimensionForVisualMap,
      inRange: { color: GRADIENT_RANGE },
      seriesIndex: 0,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 28,
      text: ["High", "Low"],
      textStyle: { color: "#475569", fontSize: 10 },
    };
  }

  return option;
}
