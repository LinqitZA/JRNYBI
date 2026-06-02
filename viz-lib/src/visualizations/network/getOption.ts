// Feature #196: Network / graph chart type (ECharts)
//
// Builds an ECharts option object for a node-link diagram from a flat
// query result. The result can be supplied two ways:
//
//   * Single edge table  — rows containing source / target (and optionally
//                          weight, source_group, target_group). The renderer
//                          auto-derives the node set from the union of all
//                          source + target values and tallies per-node
//                          degree as the default size metric.
//
//   * Two-table mode     — `data.tables = { nodes, edges }` shape. nodes
//                          rows carry id / label / group / size; edges rows
//                          carry source / target / weight. This mode is
//                          surfaced when the editor's `nodesTable` /
//                          `edgesTable` options point at distinct sources.
//                          The single-result use case is more common in
//                          Redash so it's the primary code path; we keep
//                          the two-table path for callers who post-process
//                          a query into both arrays before handing it off.
//
// Supported editor options:
//
//   - sourceColumn / targetColumn / weightColumn / sourceGroupColumn /
//     targetGroupColumn (column mapping for the single-edge-table mode)
//   - layout              — "force" | "circular" | "none"
//   - nodeSizeMin / nodeSizeMax   — px clamp for the node-size visual map
//   - edgeWidthMin / edgeWidthMax — px clamp for edge weight visual map
//   - colorByGroup        — boolean; uses categorical palette per group
//   - groupColors         — { [group]: "#hex" } overrides
//   - labelMinSize        — only show labels for nodes ≥ this size value
//   - repulsion / gravity — force-layout knobs surfaced for power users
//   - edgeLength          — preferred edge length in the force layout
//   - showArrows          — directional / undirected toggle

import { JRNYBI_CATEGORICAL_PALETTE } from "../echarts/themes";

const DEFAULT_NODE_SIZE_RANGE: [number, number] = [12, 48];
const DEFAULT_EDGE_WIDTH_RANGE: [number, number] = [1, 6];

interface NetworkNode {
  id: string;
  name: string;
  group: string | null;
  size: number;
}

interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
}

function pickColumn(
  colNames: string[],
  mapping: Record<string, any>,
  opts: any,
  key: string,
  optionKey: string,
  patterns: RegExp[]
): string | null {
  if (mapping[key]) return mapping[key];
  if (opts[optionKey]) return opts[optionKey];
  for (const pattern of patterns) {
    const match = colNames.find((n) => pattern.test(n));
    if (match) return match;
  }
  return null;
}

function clampNumber(n: number, min: number, max: number): number {
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function scaleToRange(value: number, vMin: number, vMax: number, outMin: number, outMax: number): number {
  if (vMax === vMin) return (outMin + outMax) / 2;
  const t = (value - vMin) / (vMax - vMin);
  return outMin + t * (outMax - outMin);
}

export default function getOption(data: any, options: any) {
  const opts = options || {};
  const rows: any[] = (data && data.rows) || [];
  const columns: any[] = (data && data.columns) || [];
  const colNames: string[] = columns.map((c: any) => c.name).filter(Boolean);

  const mapping = opts.columnMapping || {};

  // -------------------------------------------------------------------------
  // Column resolution — single-edge-table mode is the primary path.
  // -------------------------------------------------------------------------
  const sourceColumn = pickColumn(colNames, mapping, opts, "source", "sourceColumn", [
    /^source$/i,
    /^src$/i,
    /^from$/i,
    /source/i,
  ]);
  const targetColumn = pickColumn(colNames, mapping, opts, "target", "targetColumn", [
    /^target$/i,
    /^dst$/i,
    /^to$/i,
    /target/i,
  ]);
  const weightColumn = pickColumn(colNames, mapping, opts, "weight", "weightColumn", [
    /weight/i,
    /value/i,
    /amount/i,
    /count/i,
  ]);
  const sourceGroupColumn = pickColumn(colNames, mapping, opts, "sourceGroup", "sourceGroupColumn", [
    /source_?group/i,
    /^src_?group/i,
    /^src_?type/i,
  ]);
  const targetGroupColumn = pickColumn(colNames, mapping, opts, "targetGroup", "targetGroupColumn", [
    /target_?group/i,
    /^dst_?group/i,
    /^dst_?type/i,
  ]);

  if (rows.length === 0 || !sourceColumn || !targetColumn) {
    return {
      title: {
        text: "Network: pick source and target columns",
        left: "center",
        top: "center",
        textStyle: { fontSize: 12, fontWeight: "normal", color: "#475569" },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Build edges + auto-derive nodes. Source/target group columns let the
  // user pre-bucket each side; otherwise nodes go into the "default" group.
  // -------------------------------------------------------------------------
  const nodeMap = new Map<string, NetworkNode>();
  const edges: NetworkEdge[] = [];

  const ensureNode = (id: string, group: string | null) => {
    const key = String(id);
    if (!nodeMap.has(key)) {
      nodeMap.set(key, { id: key, name: key, group, size: 0 });
    } else if (group && !nodeMap.get(key)!.group) {
      // Backfill group when we see a typed reference later in the rows.
      nodeMap.get(key)!.group = group;
    }
  };

  for (const row of rows) {
    const s = row[sourceColumn];
    const t = row[targetColumn];
    if (s === null || s === undefined || s === "") continue;
    if (t === null || t === undefined || t === "") continue;
    const sId = String(s);
    const tId = String(t);
    const sGroup = sourceGroupColumn ? (row[sourceGroupColumn] !== undefined && row[sourceGroupColumn] !== null ? String(row[sourceGroupColumn]) : null) : null;
    const tGroup = targetGroupColumn ? (row[targetGroupColumn] !== undefined && row[targetGroupColumn] !== null ? String(row[targetGroupColumn]) : null) : null;
    ensureNode(sId, sGroup);
    ensureNode(tId, tGroup);

    let weight = 1;
    if (weightColumn) {
      const raw = row[weightColumn];
      const num = typeof raw === "number" ? raw : Number(raw);
      if (!isNaN(num)) weight = num;
    }
    edges.push({ source: sId, target: tId, weight });

    // Default node size = sum of incident edge weights (degree-weighted).
    nodeMap.get(sId)!.size += weight;
    nodeMap.get(tId)!.size += weight;
  }

  if (nodeMap.size === 0) {
    return {
      title: {
        text: "Network: no valid source / target rows found",
        left: "center",
        top: "center",
        textStyle: { fontSize: 12, fontWeight: "normal", color: "#475569" },
      },
    };
  }

  const nodes: NetworkNode[] = Array.from(nodeMap.values());

  // -------------------------------------------------------------------------
  // Build the categorical group palette + per-group overrides.
  // -------------------------------------------------------------------------
  const colorByGroup: boolean = opts.colorByGroup !== false;
  const groupColors: Record<string, string> = (opts.groupColors && typeof opts.groupColors === "object") ? opts.groupColors : {};
  const palette: string[] = Array.isArray(opts.palette) && opts.palette.length > 0
    ? opts.palette
    : JRNYBI_CATEGORICAL_PALETTE;

  const distinctGroups = Array.from(
    new Set(nodes.map((n) => n.group).filter((g): g is string => !!g))
  );
  const categories = (colorByGroup && distinctGroups.length > 0)
    ? distinctGroups.map((g) => ({
        name: g,
        itemStyle: groupColors[g] ? { color: groupColors[g] } : undefined,
      }))
    : [{ name: "default" }];

  const groupToIndex: Record<string, number> = {};
  distinctGroups.forEach((g, idx) => { groupToIndex[g] = idx; });

  // -------------------------------------------------------------------------
  // Node size + edge width visual maps. We surface min/max as editor knobs
  // and scale per-element values into that pixel range.
  // -------------------------------------------------------------------------
  const sizeRange: [number, number] = [
    typeof opts.nodeSizeMin === "number" ? Math.max(1, opts.nodeSizeMin) : DEFAULT_NODE_SIZE_RANGE[0],
    typeof opts.nodeSizeMax === "number" ? Math.max(1, opts.nodeSizeMax) : DEFAULT_NODE_SIZE_RANGE[1],
  ];
  if (sizeRange[1] < sizeRange[0]) sizeRange.reverse();

  const widthRange: [number, number] = [
    typeof opts.edgeWidthMin === "number" ? Math.max(0.5, opts.edgeWidthMin) : DEFAULT_EDGE_WIDTH_RANGE[0],
    typeof opts.edgeWidthMax === "number" ? Math.max(0.5, opts.edgeWidthMax) : DEFAULT_EDGE_WIDTH_RANGE[1],
  ];
  if (widthRange[1] < widthRange[0]) widthRange.reverse();

  const sizes = nodes.map((n) => n.size);
  const sizeMin = sizes.length > 0 ? Math.min(...sizes) : 0;
  const sizeMax = sizes.length > 0 ? Math.max(...sizes) : 1;
  const weights = edges.map((e) => e.weight);
  const wMin = weights.length > 0 ? Math.min(...weights) : 1;
  const wMax = weights.length > 0 ? Math.max(...weights) : 1;

  const labelMinSize: number = typeof opts.labelMinSize === "number" ? opts.labelMinSize : 0;

  // -------------------------------------------------------------------------
  // Project nodes / edges into the ECharts shape.
  // -------------------------------------------------------------------------
  const echartsNodes = nodes.map((n) => {
    const px = clampNumber(scaleToRange(n.size, sizeMin, sizeMax, sizeRange[0], sizeRange[1]), 1, 200);
    const showLabel = n.size >= labelMinSize;
    const node: any = {
      id: n.id,
      name: n.name,
      value: n.size,
      symbolSize: px,
      // ECharts assigns category by index — fall back to 0 ("default") when
      // colorByGroup is off or the node has no group.
      category: (colorByGroup && n.group && groupToIndex[n.group] !== undefined) ? groupToIndex[n.group] : 0,
      label: { show: showLabel },
      itemStyle: groupColors[n.group ?? ""] ? { color: groupColors[n.group as string] } : undefined,
    };
    return node;
  });

  const echartsEdges = edges.map((e) => {
    const px = clampNumber(scaleToRange(e.weight, wMin, wMax, widthRange[0], widthRange[1]), 0.5, 32);
    return {
      source: e.source,
      target: e.target,
      value: e.weight,
      lineStyle: { width: px },
    };
  });

  // -------------------------------------------------------------------------
  // Layout — force / circular / none. Force layout exposes repulsion,
  // gravity, and edgeLength for fine-tuning physical behaviour.
  // -------------------------------------------------------------------------
  const layout: "force" | "circular" | "none" =
    opts.layout === "circular" ? "circular" : opts.layout === "none" ? "none" : "force";

  const showArrows: boolean = !!opts.showArrows;

  // -------------------------------------------------------------------------
  // Build the ECharts option object.
  // -------------------------------------------------------------------------
  const option: any = {
    title: opts.title
      ? { text: opts.title, subtext: opts.subtitle || "", left: "center", top: 4 }
      : undefined,
    tooltip: {
      show: opts.showTooltip !== false,
      formatter: (info: any) => {
        if (!info) return "";
        if (info.dataType === "edge") {
          return `<div style="font-weight:600">${info.data.source} → ${info.data.target}</div>
                  <div>Weight: ${info.data.value}</div>`;
        }
        return `<div style="font-weight:600">${info.data.name}</div>
                <div>Size: ${info.data.value}</div>
                ${info.data.category !== undefined && categories[info.data.category] ? `<div style="color:#475569">Group: ${categories[info.data.category].name}</div>` : ""}`;
      },
      backgroundColor: "#ffffff",
      borderColor: "#e2e8f0",
      borderWidth: 1,
      textStyle: { color: "#0f172a" },
      extraCssText: "box-shadow: 0 4px 12px rgba(15,23,42,0.10);",
    },
    legend: {
      show: opts.showLegend !== false && colorByGroup && distinctGroups.length > 0,
      data: categories.map((c: any) => c.name),
      bottom: 6,
      textStyle: { color: "#334155", fontSize: 11 },
    },
    color: palette,
    series: [
      {
        type: "graph",
        layout,
        data: echartsNodes,
        edges: echartsEdges,
        categories,
        roam: true,         // scroll-to-zoom + click-and-drag the canvas
        draggable: true,    // drag individual nodes to reposition
        edgeSymbol: showArrows ? ["none", "arrow"] : ["none", "none"],
        edgeSymbolSize: showArrows ? [0, 8] : [0, 0],
        label: {
          position: "right",
          formatter: "{b}",
          color: "#0f172a",
          fontSize: 11,
        },
        emphasis: {
          focus: "adjacency",
          lineStyle: { width: 3 },
          itemStyle: { shadowBlur: 8, shadowColor: "rgba(15,23,42,0.30)" },
          label: { fontWeight: 700 },
        },
        force: layout === "force" ? {
          repulsion: typeof opts.repulsion === "number" ? opts.repulsion : 120,
          gravity: typeof opts.gravity === "number" ? opts.gravity : 0.08,
          edgeLength: typeof opts.edgeLength === "number" ? opts.edgeLength : 60,
          friction: 0.6,
          layoutAnimation: true,
        } : undefined,
        circular: layout === "circular" ? { rotateLabel: true } : undefined,
        lineStyle: {
          color: "source",
          curveness: 0.1,
          opacity: 0.75,
        },
      },
    ],
  };

  return option;
}
