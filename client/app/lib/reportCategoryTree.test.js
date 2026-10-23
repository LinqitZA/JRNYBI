import {
  getReportCategoryId,
  buildCategoryTree,
  assignReports,
  subtreeReports,
  ancestorIds,
  descendantIds,
  flattenTree,
  moveAmongSiblings,
} from "./reportCategoryTree";

const cat = (id, parent = null) => ({ id, name: id.toUpperCase(), parent });
const dash = (id, tags) => ({ id, name: `d${id}`, tags });

// migrated
//   orders
//     capitec
//   finance
// archive
const CATEGORIES = [
  cat("capitec", "orders"),
  cat("migrated"),
  cat("orders", "migrated"),
  cat("finance", "migrated"),
  cat("archive"),
];

describe("getReportCategoryId", () => {
  test("returns the id of the first report: tag", () => {
    expect(getReportCategoryId(dash(1, ["x", "report:a", "report:b"]))).toBe("a");
  });

  test("returns null when there is no report: tag or no tags", () => {
    expect(getReportCategoryId(dash(1, ["sales"]))).toBeNull();
    expect(getReportCategoryId({ id: 2 })).toBeNull();
  });
});

describe("buildCategoryTree", () => {
  test("keeps roots and children in list order, even when a parent comes after its children", () => {
    const tree = buildCategoryTree(CATEGORIES);
    expect(tree.roots.map((n) => n.id)).toEqual(["migrated", "archive"]);
    expect(tree.byId.migrated.children.map((n) => n.id)).toEqual(["orders", "finance"]);
    expect(tree.byId.orders.children.map((n) => n.id)).toEqual(["capitec"]);
    expect(tree.byId.capitec.depth).toBe(2);
    expect(tree.byId.capitec.category.name).toBe("CAPITEC");
  });

  test("treats a category with an unknown parent as top-level", () => {
    const tree = buildCategoryTree([cat("a"), cat("orphan", "missing")]);
    expect(tree.roots.map((n) => n.id)).toEqual(["a", "orphan"]);
    expect(tree.byId.orphan.depth).toBe(0);
    expect(tree.byId.orphan.parentId).toBeNull();
  });

  test("does not lose categories caught in a cycle or parented to themselves", () => {
    const tree = buildCategoryTree([cat("a", "b"), cat("b", "a"), cat("self", "self")]);
    const all = flattenTree(tree).map((r) => r.category.id);
    expect(all.sort()).toEqual(["a", "b", "self"]);
  });

  test("handles a missing or empty list", () => {
    expect(buildCategoryTree(undefined).roots).toEqual([]);
  });
});

describe("assignReports", () => {
  const tree = buildCategoryTree(CATEGORIES);

  test("puts each dashboard in the category of its first report: tag", () => {
    const { byCategory, uncategorized } = assignReports(tree, [
      dash(1, ["report:capitec", "report:finance"]),
      dash(2, ["report:archive"]),
    ]);
    expect(byCategory.capitec.map((d) => d.id)).toEqual([1]);
    expect(byCategory.finance).toEqual([]);
    expect(byCategory.archive.map((d) => d.id)).toEqual([2]);
    expect(uncategorized).toEqual([]);
  });

  test("puts dashboards with an unknown or missing category in uncategorized", () => {
    const { uncategorized } = assignReports(tree, [dash(1, ["report:gone"]), dash(2, [])]);
    expect(uncategorized.map((d) => d.id)).toEqual([1, 2]);
  });

  test("bare-tag matching applies to top-level categories only, when asked", () => {
    const dashboards = [dash(1, ["report:capitec", "archive", "orders"])];
    const plain = assignReports(tree, dashboards);
    expect(plain.byCategory.archive).toEqual([]);

    const bare = assignReports(tree, dashboards, { bareTagTopLevel: true });
    expect(bare.byCategory.archive.map((d) => d.id)).toEqual([1]);
    expect(bare.byCategory.orders).toEqual([]);
    expect(bare.byCategory.capitec.map((d) => d.id)).toEqual([1]);
  });

  test("a bare tag does not add a dashboard twice to the folder it already belongs to", () => {
    const { byCategory } = assignReports(tree, [dash(1, ["report:archive", "archive"])], { bareTagTopLevel: true });
    expect(byCategory.archive.map((d) => d.id)).toEqual([1]);
  });
});

describe("subtreeReports", () => {
  const tree = buildCategoryTree(CATEGORIES);

  test("returns a folder's own reports and those of all its sub-folders, each once", () => {
    const { byCategory } = assignReports(
      tree,
      [
        dash(1, ["report:capitec"]),
        dash(2, ["report:migrated"]),
        dash(3, ["report:finance", "migrated"]),
        dash(4, ["report:archive"]),
      ],
      { bareTagTopLevel: true }
    );
    expect(
      subtreeReports(tree, byCategory, "migrated")
        .map((d) => d.id)
        .sort()
    ).toEqual([1, 2, 3]);
    expect(subtreeReports(tree, byCategory, "orders").map((d) => d.id)).toEqual([1]);
    expect(subtreeReports(tree, byCategory, "archive").map((d) => d.id)).toEqual([4]);
  });

  test("returns an empty list for an unknown folder", () => {
    expect(subtreeReports(tree, {}, "nope")).toEqual([]);
  });
});

describe("ancestorIds and descendantIds", () => {
  const tree = buildCategoryTree(CATEGORIES);

  test("ancestorIds lists the path from the root down to the parent", () => {
    expect(ancestorIds(tree, "capitec")).toEqual(["migrated", "orders"]);
    expect(ancestorIds(tree, "migrated")).toEqual([]);
    expect(ancestorIds(tree, "nope")).toEqual([]);
  });

  test("descendantIds lists every category beneath, depth first", () => {
    expect(descendantIds(tree, "migrated")).toEqual(["orders", "capitec", "finance"]);
    expect(descendantIds(tree, "capitec")).toEqual([]);
  });
});

describe("flattenTree", () => {
  test("lists categories depth first with their depth", () => {
    const rows = flattenTree(buildCategoryTree(CATEGORIES));
    expect(rows.map((r) => [r.category.id, r.depth])).toEqual([
      ["migrated", 0],
      ["orders", 1],
      ["capitec", 2],
      ["finance", 1],
      ["archive", 0],
    ]);
  });
});

describe("moveAmongSiblings", () => {
  test("swaps a category with its next or previous sibling in the flat list", () => {
    const moved = moveAmongSiblings(CATEGORIES, "orders", 1);
    expect(moved.map((c) => c.id)).toEqual(["capitec", "migrated", "finance", "orders", "archive"]);
    const back = moveAmongSiblings(moved, "orders", -1);
    expect(back.map((c) => c.id)).toEqual(["capitec", "migrated", "orders", "finance", "archive"]);
  });

  test("moves top-level folders among top-level folders only", () => {
    expect(moveAmongSiblings(CATEGORIES, "archive", -1).map((c) => c.id)).toEqual([
      "capitec",
      "archive",
      "orders",
      "finance",
      "migrated",
    ]);
  });

  test("returns null when there is no sibling in that direction", () => {
    expect(moveAmongSiblings(CATEGORIES, "capitec", 1)).toBeNull();
    expect(moveAmongSiblings(CATEGORIES, "migrated", -1)).toBeNull();
    expect(moveAmongSiblings(CATEGORIES, "nope", 1)).toBeNull();
  });

  test("does not change the input list", () => {
    const copy = CATEGORIES.map((c) => c.id);
    moveAmongSiblings(CATEGORIES, "orders", 1);
    expect(CATEGORIES.map((c) => c.id)).toEqual(copy);
  });
});
