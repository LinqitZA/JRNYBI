"""
Folder rules for JRNY report categories.

A category may sit inside another one through its ``parent`` (the parent's id, or ``None`` for a
top-level folder). Categories stored before folders existed have no ``parent`` key and are all
top-level. The list order stays the display order among siblings, so a parent may come after its
children in the list.

Kept free of Flask/SQLAlchemy so the rules can be tested on their own.
"""

MAX_DEPTH = 6


def normalise_parent(value):
    """Return the parent id to store: ``None`` for top level, else the trimmed, lowercased id."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("parent must be a category id or null")
    value = value.strip().lower()
    return value or None


def tree_error(categories):
    """Return why *categories* do not form a valid folder tree, or ``None`` when they do."""
    parents = {c["id"]: c.get("parent") for c in categories}
    for cat_id, parent in parents.items():
        if parent is None:
            continue
        if parent == cat_id:
            return f"category '{cat_id}' cannot be its own parent"
        if parent not in parents:
            return f"category '{cat_id}' has unknown parent '{parent}'"

    for cat_id in parents:
        seen = [cat_id]
        node = parents[cat_id]
        while node is not None:
            if node in seen:
                return f"categories {' > '.join(seen + [node])} form a cycle"
            seen.append(node)
            if len(seen) > MAX_DEPTH:
                return f"category '{cat_id}' is nested deeper than {MAX_DEPTH} levels"
            node = parents[node]
    return None


def child_ids(categories, parent_id):
    """Ids of the direct sub-folders of *parent_id*, in list order."""
    return [c["id"] for c in categories if c.get("parent") == parent_id]
