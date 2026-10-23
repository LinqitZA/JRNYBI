from unittest import TestCase

from redash.utils.report_category_tree import (
    MAX_DEPTH,
    child_ids,
    normalise_parent,
    tree_error,
)


def cat(cat_id, parent=None):
    return {"id": cat_id, "name": cat_id, "parent": parent}


class TestNormaliseParent(TestCase):
    def test_blank_values_mean_top_level(self):
        for value in (None, "", "   "):
            self.assertIsNone(normalise_parent(value))

    def test_trims_and_lowercases(self):
        self.assertEqual(normalise_parent("  AON-Orders "), "aon-orders")

    def test_non_string_is_rejected(self):
        with self.assertRaises(ValueError):
            normalise_parent(5)


class TestTreeError(TestCase):
    def test_flat_list_without_parent_keys_is_valid(self):
        # categories stored before folders existed have no "parent" at all
        self.assertIsNone(tree_error([{"id": "sales"}, {"id": "finance"}]))

    def test_valid_nesting(self):
        cats = [cat("aon-migrated"), cat("aon-orders", "aon-migrated"), cat("aon-orders-capitec", "aon-orders")]
        self.assertIsNone(tree_error(cats))

    def test_parent_may_come_after_child_in_the_list(self):
        self.assertIsNone(tree_error([cat("b", "a"), cat("a")]))

    def test_unknown_parent(self):
        self.assertIn("unknown parent 'nope'", tree_error([cat("a", "nope")]))

    def test_self_parent(self):
        self.assertIn("cannot be its own parent", tree_error([cat("a", "a")]))

    def test_cycle(self):
        self.assertIn("cycle", tree_error([cat("a", "b"), cat("b", "a")]))

    def test_depth_limit(self):
        cats = [cat("l0")] + [cat(f"l{i}", f"l{i - 1}") for i in range(1, MAX_DEPTH)]
        self.assertIsNone(tree_error(cats))
        cats.append(cat(f"l{MAX_DEPTH}", f"l{MAX_DEPTH - 1}"))
        self.assertIn("deeper than", tree_error(cats))


class TestChildIds(TestCase):
    def test_direct_children_in_list_order(self):
        cats = [cat("root"), cat("b", "root"), cat("x"), cat("a", "root"), cat("deep", "a")]
        self.assertEqual(child_ids(cats, "root"), ["b", "a"])
        self.assertEqual(child_ids(cats, "x"), [])
