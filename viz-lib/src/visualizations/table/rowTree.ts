/**
 * Row tree for the Table viz: expand / collapse rows by a level column the
 * query returns (e.g. the AON Income Statement's `_row_level`: 1 = group,
 * 2 = description, 3 = code, 9 = totals). Option `rowTree: { levelColumn, depth }`.
 *
 * Rows with a level 1..depth form the tree, in query order: a row's children
 * are the rows after it with a higher level, up to the next row whose level is
 * the same or lower. Any other level (the totals) is always shown, is never
 * expandable and ends the preceding group.
 *
 * Pure functions, no React.
 */

export interface RowTreeConfig {
  levelColumn: string;
  depth: number;
}

export interface TreeInfo {
  /** Tree level (1..depth), or null for an always-shown row. */
  level: number | null;
  /** Indexes of the row's ancestors, outermost first. */
  parents: number[];
  hasChildren: boolean;
}

function toLevel(value: any): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

/** The row tree config, or null when the option is unset or the rows don't carry a numeric level column. */
export function getRowTreeConfig(options: any, rows: any[]): RowTreeConfig | null {
  const rt = options && options.rowTree;
  if (!rt || !rt.levelColumn || !rows || rows.length === 0) return null;
  if (!(rt.levelColumn in rows[0])) return null;
  if (rows.some(row => !Number.isFinite(toLevel(row[rt.levelColumn])))) return null;
  return { levelColumn: rt.levelColumn, depth: Number(rt.depth) || 3 };
}

export function buildRowTree(rows: any[], cfg: RowTreeConfig): TreeInfo[] {
  const tree: TreeInfo[] = [];
  // Open ancestors of the current row, outermost first.
  const stack: Array<{ index: number; level: number }> = [];
  rows.forEach((row, index) => {
    const lv = toLevel(row[cfg.levelColumn]);
    if (!(lv >= 1 && lv <= cfg.depth)) {
      stack.length = 0;
      tree.push({ level: null, parents: [], hasChildren: false });
      return;
    }
    while (stack.length > 0 && stack[stack.length - 1].level >= lv) stack.pop();
    if (stack.length > 0) tree[stack[stack.length - 1].index].hasChildren = true;
    tree.push({ level: lv, parents: stack.map(s => s.index), hasChildren: false });
    stack.push({ index, level: lv });
  });
  return tree;
}

/** Indexes of the rows to show: always-shown rows, and tree rows whose every ancestor is expanded. */
export function visibleRowIndexes(tree: TreeInfo[], expanded: Set<number>): number[] {
  const out: number[] = [];
  tree.forEach((t, i) => {
    if (t.parents.every(p => expanded.has(p))) out.push(i);
  });
  return out;
}

/** Every row that has children (for "Expand all"). */
export function expandableIndexes(tree: TreeInfo[]): Set<number> {
  const out = new Set<number>();
  tree.forEach((t, i) => {
    if (t.hasChildren) out.add(i);
  });
  return out;
}

/** `expanded` without `index` and its descendants, so a re-expanded row shows its children collapsed. */
export function collapse(tree: TreeInfo[], expanded: Set<number>, index: number): Set<number> {
  const out = new Set<number>();
  expanded.forEach(i => {
    if (i !== index && !tree[i].parents.includes(index)) out.add(i);
  });
  return out;
}
