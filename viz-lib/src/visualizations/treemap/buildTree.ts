// Feature #193: Treemap chart type (ECharts)
//
// Converts a flat query-result row set into the hierarchical {name, value,
// children[]} structure that ECharts' TreemapChart series expects.
//
// Two row shapes are supported:
//
//   Shape A — single "path" column (parent>child)
//     pathColumn = "Electronics>Phones>iPhone"   valueColumn = 1200
//     pathColumn = "Electronics>Phones>Pixel"    valueColumn = 800
//     pathColumn = "Electronics>Laptops"          valueColumn = 5000
//
//   Shape B — separate level columns (level1 / level2 / level3 / ... + value)
//     level1 = "Electronics"  level2 = "Phones"     level3 = "iPhone"  value = 1200
//
// We pick the shape based on what columns the editor mapped:
//   * if `pathColumn` is set → shape A
//   * else if `levelColumns` is a non-empty array → shape B
//
// Both shapes converge into a tree of `{name, value, children}` nodes ready
// for ECharts.

import { compact, isFinite as _isFinite, isNil, map } from "lodash";

export interface TreeNode {
  name: string;
  value?: number;
  children?: TreeNode[];
  /** Optional per-node color override (used when a "color value" column is mapped). */
  itemStyle?: { color?: string };
  /** Raw color metric — surfaced to the visualMap so a gradient can encode it. */
  __colorMetric?: number | null;
}

function asNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return _isFinite(n) ? n : null;
}

function asString(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function ensureChild(node: TreeNode, name: string): TreeNode {
  if (!node.children) node.children = [];
  let child = node.children.find(c => c.name === name);
  if (!child) {
    child = { name };
    node.children.push(child);
  }
  return child;
}

function insertPath(root: TreeNode, segments: string[], value: number, colorMetric: number | null) {
  if (segments.length === 0) return;
  let cur = root;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLeaf = i === segments.length - 1;
    cur = ensureChild(cur, seg);
    if (isLeaf) {
      // If multiple rows land on the same leaf, sum their values rather
      // than overwriting — this matches "rolled-up" GROUP BY semantics.
      cur.value = (cur.value ?? 0) + value;
      if (colorMetric !== null) {
        cur.__colorMetric =
          (cur.__colorMetric === null || cur.__colorMetric === undefined ? 0 : cur.__colorMetric) +
          colorMetric;
      }
    }
  }
}

export interface BuildTreeArgs {
  rows: any[];
  /** Column name containing the full path string (shape A). */
  pathColumn?: string | null;
  /** Path separator for shape A. Defaults to ">". */
  pathSeparator?: string;
  /** Ordered list of column names representing nesting levels (shape B). */
  levelColumns?: string[] | null;
  /** Column with the numeric value used to size rectangles. */
  valueColumn: string;
  /** Optional column whose numeric value drives a color gradient. */
  colorColumn?: string | null;
  /** Skip rows whose computed value is null / zero / negative. Defaults to false. */
  dropEmpty?: boolean;
}

export interface BuildTreeResult {
  /** ECharts expects a top-level array; we return that here. */
  data: TreeNode[];
  /** Min/max color metric values, suitable for visualMap. null if no color column. */
  colorMin: number | null;
  colorMax: number | null;
}

export default function buildTree(args: BuildTreeArgs): BuildTreeResult {
  const {
    rows,
    pathColumn,
    pathSeparator = ">",
    levelColumns,
    valueColumn,
    colorColumn,
    dropEmpty = false,
  } = args;

  const root: TreeNode = { name: "__root__", children: [] };

  let colorMin: number | null = null;
  let colorMax: number | null = null;

  rows.forEach((row: any) => {
    if (!row || typeof row !== "object") return;

    const value = asNumber(row[valueColumn]);
    if (value === null) return;
    if (dropEmpty && value <= 0) return;

    let colorMetric: number | null = null;
    if (colorColumn) {
      colorMetric = asNumber(row[colorColumn]);
      if (colorMetric !== null) {
        if (colorMin === null || colorMetric < colorMin) colorMin = colorMetric;
        if (colorMax === null || colorMetric > colorMax) colorMax = colorMetric;
      }
    }

    let segments: string[] = [];
    if (pathColumn) {
      const pathStr = asString(row[pathColumn]);
      if (!pathStr) return;
      segments = pathStr
        .split(pathSeparator)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
    } else if (levelColumns && levelColumns.length > 0) {
      segments = compact(map(levelColumns, (col: string) => asString(row[col])));
    }

    if (segments.length === 0) return;
    insertPath(root, segments, value, colorMetric);
  });

  // ECharts treemap rolls parent values from children when value is unset,
  // but we explicitly bubble the sums up so tooltip formatting is reliable
  // even when the user hovers a non-leaf node.
  const rollup = (node: TreeNode): number => {
    if (!node.children || node.children.length === 0) {
      return node.value ?? 0;
    }
    const sum = node.children.reduce((acc, c) => acc + rollup(c), 0);
    if (isNil(node.value)) node.value = sum;
    return node.value ?? 0;
  };
  rollup(root);

  return {
    data: root.children || [],
    colorMin,
    colorMax,
  };
}
