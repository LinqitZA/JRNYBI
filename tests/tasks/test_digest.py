"""Unit tests for digest delta/series/sparkline helpers (feature #219)."""
import pytest

from redash.tasks.digest import (
    compute_delta,
    extract_series,
    _format_value,
    _format_delta_text,
    _render_sparkline_svg,
    render_sparkline_png,
)


class TestComputeDelta:
    def test_returns_none_when_missing(self):
        assert compute_delta(None, 5) is None
        assert compute_delta(5, None) is None
        assert compute_delta("abc", 5) is None

    def test_positive_delta(self):
        r = compute_delta(110, 100)
        assert r["delta"] == 10
        assert r["direction"] == 1
        assert r["pct"] == pytest.approx(0.1)

    def test_negative_delta(self):
        r = compute_delta(80, 100)
        assert r["direction"] == -1

    def test_zero_compared_returns_null_pct(self):
        r = compute_delta(5, 0)
        assert r["pct"] is None

    def test_flat(self):
        r = compute_delta(10, 10)
        assert r["direction"] == 0


class TestExtractSeries:
    def test_empty_inputs(self):
        assert extract_series([], "v") == []
        assert extract_series([{"v": 1}], None) == []

    def test_preserves_row_order(self):
        rows = [{"v": 3}, {"v": 1}, {"v": 2}]
        assert extract_series(rows, "v") == [3.0, 1.0, 2.0]

    def test_sorts_by_date_column(self):
        rows = [
            {"v": 3, "t": "2024-03"},
            {"v": 1, "t": "2024-01"},
            {"v": 2, "t": "2024-02"},
        ]
        assert extract_series(rows, "v", "t") == [1.0, 2.0, 3.0]

    def test_drops_non_numeric(self):
        rows = [{"v": 1}, {"v": None}, {"v": "abc"}, {"v": 5}]
        assert extract_series(rows, "v") == [1.0, 5.0]


class TestFormatHelpers:
    def test_format_value_int(self):
        assert _format_value(12345) == "12,345"

    def test_format_value_float(self):
        assert _format_value(1.5) == "1.50"

    def test_format_value_none(self):
        assert _format_value(None) == "—"

    def test_delta_text_with_pct(self):
        text = _format_delta_text({"delta": 10, "pct": 0.08, "direction": 1})
        assert text == "+8.0%"

    def test_delta_text_negative(self):
        text = _format_delta_text({"delta": -5, "pct": -0.05, "direction": -1})
        assert text.startswith("-")

    def test_delta_text_none(self):
        assert _format_delta_text(None) == ""


class TestSparkline:
    def test_svg_renders_for_valid_series(self):
        uri = _render_sparkline_svg([1, 2, 3, 4, 5], 100, 30)
        assert uri.startswith("data:image/svg+xml;base64,")

    def test_svg_handles_constant_series(self):
        # No range — code must not divide by zero.
        uri = _render_sparkline_svg([5, 5, 5], 100, 30)
        assert uri.startswith("data:image/svg+xml;base64,")

    def test_png_returns_none_for_short_series(self):
        assert render_sparkline_png([]) is None
        assert render_sparkline_png([1]) is None
