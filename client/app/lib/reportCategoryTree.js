// Report folders: pure helpers over the flat category list served by /api/jrny/report-categories.
// Each category is {id, name, icon, color, description, parent}; `parent` is the parent folder's id
// or null (top-level). List order is the display order among siblings. No React or antd here.

const REPORT_TAG_PREFIX = "report:";

/** The category id of a dashboard's first "report:<id>" tag, or null. */
export function getReportCategoryId(dashboard) {
  const tags = dashboard && Array.isArray(dashboard.tags) ? dashboard.tags : [];
  const tag = tags.find((t) => typeof t === "string" && t.startsWith(REPORT_TAG_PREFIX));
  return tag ? tag.substring(REPORT_TAG_PREFIX.length) : null;
}

/**
 * Builds the folder tree: {roots, byId}. Each node is {id, category, parentId, depth, children}.
 * Roots and children keep list order. A category whose parent is unknown, itself, or part of a
 * cycle is treated as top-level, so no category ever disappears.
 */
export function buildCategoryTree(categories) {
  const list = Array.isArray(categories) ? categories : [];
  const byId = {};
  list.forEach((category) => {
    byId[category.id] = { id: category.id, category, parentId: null, depth: 0, children: [] };
  });

  const parentOf = (id) => {
    const parent = byId[id].category.parent;
    return parent && byId[parent] ? parent : null;
  };
  // True when following parents from `id` never comes back to `id`.
  const reachesRoot = (id) => {
    const seen = new Set([id]);
    for (let current = parentOf(id); current; current = parentOf(current)) {
      if (seen.has(current)) return false;
      seen.add(current);
    }
    return true;
  };

  const roots = [];
  list.forEach((category) => {
    const node = byId[category.id];
    const parentId = parentOf(category.id);
    if (parentId && reachesRoot(category.id)) {
      node.parentId = parentId;
      byId[parentId].children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Depth is set once the tree is complete, since a parent may come after its children in the list.
  const setDepth = (node, depth) => {
    node.depth = depth;
    node.children.forEach((child) => setDepth(child, depth + 1));
  };
  roots.forEach((root) => setDepth(root, 0));

  return { roots, byId };
}

/**
 * Assigns dashboards to folders: {byCategory: {id: [dashboard]}, uncategorized: [dashboard]}.
 * A dashboard belongs to the folder of its first report:<id> tag. With `bareTagTopLevel`, a
 * dashboard tagged with a top-level folder's bare id (e.g. "sales") is also listed there.
 */
export function assignReports(tree, dashboards, { bareTagTopLevel = false } = {}) {
  const byCategory = {};
  Object.keys(tree.byId).forEach((id) => {
    byCategory[id] = [];
  });
  const uncategorized = [];

  (dashboards || []).forEach((dashboard) => {
    const categoryId = getReportCategoryId(dashboard);
    if (categoryId && byCategory[categoryId]) {
      byCategory[categoryId].push(dashboard);
    } else {
      uncategorized.push(dashboard);
    }
    if (bareTagTopLevel) {
      const tags = Array.isArray(dashboard.tags) ? dashboard.tags : [];
      tree.roots.forEach((root) => {
        if (root.id !== categoryId && tags.includes(root.id)) {
          byCategory[root.id].push(dashboard);
        }
      });
    }
  });

  return { byCategory, uncategorized };
}

/** Every category id beneath `categoryId`, depth first in folder order. */
export function descendantIds(tree, categoryId) {
  const node = tree.byId[categoryId];
  if (!node) return [];
  const ids = [];
  const walk = (parent) =>
    parent.children.forEach((child) => {
      ids.push(child.id);
      walk(child);
    });
  walk(node);
  return ids;
}

/** The ids from the top-level folder down to the parent of `categoryId` (for breadcrumbs). */
export function ancestorIds(tree, categoryId) {
  const ids = [];
  const node = tree.byId[categoryId];
  for (let current = node ? node.parentId : null; current; current = tree.byId[current].parentId) {
    ids.unshift(current);
  }
  return ids;
}

/** A folder's own reports plus those of all its sub-folders, each dashboard once. */
export function subtreeReports(tree, byCategory, categoryId) {
  if (!tree.byId[categoryId]) return [];
  const seen = new Set();
  const reports = [];
  [categoryId, ...descendantIds(tree, categoryId)].forEach((id) => {
    (byCategory[id] || []).forEach((dashboard) => {
      if (!seen.has(dashboard.id)) {
        seen.add(dashboard.id);
        reports.push(dashboard);
      }
    });
  });
  return reports;
}

/** All categories depth first, as [{category, depth}], for indented lists and pickers. */
export function flattenTree(tree) {
  const rows = [];
  const walk = (nodes) =>
    nodes.forEach((node) => {
      rows.push({ category: node.category, depth: node.depth });
      walk(node.children);
    });
  walk(tree.roots);
  return rows;
}

/**
 * Moves a category one place up (-1) or down (+1) among its siblings by swapping it with the
 * neighbouring sibling in the flat list. Returns a new list, or null when there is no such sibling.
 */
export function moveAmongSiblings(categories, categoryId, direction) {
  const tree = buildCategoryTree(categories);
  const node = tree.byId[categoryId];
  if (!node) return null;
  const siblings = node.parentId ? tree.byId[node.parentId].children : tree.roots;
  const position = siblings.indexOf(node);
  const neighbour = siblings[position + direction];
  if (!neighbour) return null;

  const next = [...categories];
  const from = next.findIndex((c) => c.id === categoryId);
  const to = next.findIndex((c) => c.id === neighbour.id);
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
