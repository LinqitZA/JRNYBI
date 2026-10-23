import {
  getRowTreeConfig,
  buildRowTree,
  visibleRowIndexes,
  expandableIndexes,
  collapse,
} from "./rowTree";

// G = group (1), D = description (2), C = code (3), T = always-shown total (9).
const levels = [1, 2, 3, 3, 2, 3, 9, 1, 2, 3, 1, 9];
const names = ["G1", "D1", "C1", "C2", "D2", "C3", "T", "G2", "D3", "C4", "G3", "T2"];
const rows = levels.map((l, i) => ({ name: names[i], _row_level: l }));
const cfg = { levelColumn: "_row_level", depth: 3 };

describe("Visualizations -> Table -> rowTree", () => {
  const tree = buildRowTree(rows, cfg);

  test("buildRowTree: parents, always-shown rows and children", () => {
    expect(tree[2].parents).toEqual([0, 1]);
    expect(tree[6].parents).toEqual([]);
    expect(tree[6].level).toBeNull();
    expect(tree[0].level).toBe(1);
    expect(tree[10].hasChildren).toBe(false);
    expect(tree[1].hasChildren).toBe(true);
    expect(tree[2].hasChildren).toBe(false);
    // a total ends the preceding group: G2's children do not include rows after it
    expect(tree[7].parents).toEqual([]);
    expect(tree[9].parents).toEqual([7, 8]);
  });

  test("visibleRowIndexes: collapsed shows groups and totals only", () => {
    expect(visibleRowIndexes(tree, new Set())).toEqual([0, 6, 7, 10, 11]);
  });

  test("visibleRowIndexes: a row is shown only when every ancestor is expanded", () => {
    expect(visibleRowIndexes(tree, new Set([0]))).toEqual([0, 1, 4, 6, 7, 10, 11]);
    expect(visibleRowIndexes(tree, new Set([0, 1]))).toEqual([0, 1, 2, 3, 4, 6, 7, 10, 11]);
    expect(visibleRowIndexes(tree, new Set([1]))).toEqual([0, 6, 7, 10, 11]);
  });

  test("expandableIndexes: every row with children; all expanded shows every row", () => {
    const all = expandableIndexes(tree);
    expect(Array.from(all).sort((a, b) => a - b)).toEqual([0, 1, 4, 7, 8]);
    expect(visibleRowIndexes(tree, all)).toEqual(rows.map((_r, i) => i));
  });

  test("collapse: removes the row and its descendants", () => {
    expect(Array.from(collapse(tree, new Set([0, 1, 4, 7]), 0))).toEqual([7]);
  });

  test("getRowTreeConfig: only with a valid level column", () => {
    expect(getRowTreeConfig({}, rows)).toBeNull();
    expect(getRowTreeConfig({ rowTree: cfg }, [{ name: "x" }])).toBeNull();
    expect(getRowTreeConfig({ rowTree: cfg }, [{ _row_level: 1 }, { _row_level: "x" }])).toBeNull();
    expect(getRowTreeConfig({ rowTree: { levelColumn: "" } }, rows)).toBeNull();
    expect(getRowTreeConfig({ rowTree: cfg }, [])).toBeNull();
    expect(getRowTreeConfig({ rowTree: cfg }, rows)).toEqual(cfg);
    expect(getRowTreeConfig({ rowTree: cfg }, [{ _row_level: "1" }, { _row_level: "2" }])).toEqual(cfg);
  });

  test("a level-0 label row above the first group (Month On Month) is always shown", () => {
    const t = buildRowTree([0, 1, 2, 3, 9].map(l => ({ _row_level: l })), cfg);
    expect(t[0].level).toBeNull();
    expect(t[1].parents).toEqual([]);
    expect(visibleRowIndexes(t, new Set())).toEqual([0, 1, 4]);
    expect(visibleRowIndexes(t, expandableIndexes(t))).toEqual([0, 1, 2, 3, 4]);
  });

  test("buildRowTree accepts numeric-string levels", () => {
    const t = buildRowTree([{ _row_level: "1" }, { _row_level: "2" }], cfg);
    expect(t[0].hasChildren).toBe(true);
    expect(t[1].parents).toEqual([0]);
  });
});
