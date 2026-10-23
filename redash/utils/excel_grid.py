"""
Write an "as shown" grid (a pivot or table exactly as the browser draws it) to a styled .xlsx.

The grid format is the ExportGrid of docs/superpowers/specs/2026-10-21-jrnybi-excel-as-shown-design.md
(jrny repo): ``rows`` of cells (``None`` or ``{"v", "t", "z"?, "s"?}``), ``merges`` as 0-based
``[first_row, first_col, last_row, last_col]``, the frozen ``header_rows`` / ``header_cols``, and an
optional ``title``, ``subtitle`` and ``sheet_name``. An optional ``row_outline`` ``{"levels", "collapsed"?}``
groups rows the Excel way (one outline level 0..7 per grid row, the summary row above its detail; with
``collapsed`` the file opens showing only level-0 rows), for the table row tree. The server only formats
what it is given; it reads no data.

Kept free of Flask so it can be tested on its own.
"""

import datetime
import io
import re

import xlsxwriter

MAX_CELLS = 1_000_000
MAX_COLS = 16_384
MAX_HEADER_ROWS = 200
CELL_TYPES = {"s", "n", "d", "b"}
STYLES = {"header", "rowhead", "total", "body"}
MIN_WIDTH, MAX_WIDTH = 6, 60
MAX_OUTLINE_LEVEL = 7  # Excel's limit

_SHEET_BAD = re.compile(r"[\[\]:*?/\\]")
_FILE_BAD = re.compile(r'[\\/:*?"<>|\r\n\t]+')


class GridError(ValueError):
    pass


def _parse_date(value):
    if not isinstance(value, str):
        raise GridError(f"date cell needs an ISO date string, got {value!r}")
    try:
        if "T" in value:
            return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        return datetime.datetime.combine(datetime.date.fromisoformat(value), datetime.time())
    except ValueError:
        raise GridError(f"invalid ISO date {value!r}")


def _clean_cell(c, where):
    if c is None:
        return None
    if not isinstance(c, dict):
        raise GridError(f"cell {where} must be an object or null")
    t = c.get("t", "s")
    if t not in CELL_TYPES:
        raise GridError(f"cell {where} has unknown type {t!r}")
    s = c.get("s", "body")
    if s not in STYLES:
        raise GridError(f"cell {where} has unknown style {s!r}")
    v = c.get("v")
    if v is not None:
        if t == "n" and (isinstance(v, bool) or not isinstance(v, (int, float))):
            raise GridError(f"cell {where} must hold a number")
        if t == "d":
            v = _parse_date(v)
        if t == "b" and not isinstance(v, bool):
            raise GridError(f"cell {where} must hold true or false")
        if t == "s":
            v = str(v)
    z = c.get("z")
    if z is not None and not isinstance(z, str):
        raise GridError(f"cell {where} has a non-text number format")
    return {"v": v, "t": t, "s": s, "z": z}


def validate_grid(grid):
    """Check *grid* and return a cleaned copy (dates parsed). Raises GridError."""
    if not isinstance(grid, dict):
        raise GridError("the grid must be a JSON object")
    rows = grid.get("rows")
    if not isinstance(rows, list) or not all(isinstance(r, list) for r in rows):
        raise GridError("rows must be a list of lists")
    width = max((len(r) for r in rows), default=0)
    if width > MAX_COLS:
        raise GridError(f"too many columns ({width} > {MAX_COLS})")
    if sum(len(r) for r in rows) > MAX_CELLS:
        raise GridError(f"too many cells (more than {MAX_CELLS})")

    header_rows = grid.get("header_rows", 0) or 0
    header_cols = grid.get("header_cols", 0) or 0
    for name, n in (("header_rows", header_rows), ("header_cols", header_cols)):
        if not isinstance(n, int) or isinstance(n, bool) or n < 0:
            raise GridError(f"{name} must be a whole number")
    if header_rows > MAX_HEADER_ROWS:
        raise GridError(f"too many header rows ({header_rows} > {MAX_HEADER_ROWS})")

    clean_rows = [[_clean_cell(c, f"[{i}][{j}]") for j, c in enumerate(r)] for i, r in enumerate(rows)]

    merges = grid.get("merges") or []
    if not isinstance(merges, list):
        raise GridError("merges must be a list")
    covered = set()
    clean_merges = []
    for m in merges:
        if (
            not isinstance(m, list)
            or len(m) != 4
            or not all(isinstance(x, int) and not isinstance(x, bool) for x in m)
        ):
            raise GridError(f"merge {m!r} must be [first_row, first_col, last_row, last_col]")
        r1, c1, r2, c2 = m
        if not (0 <= r1 <= r2 < len(rows) and 0 <= c1 <= c2 < width):
            raise GridError(f"merge {m!r} is outside the grid")
        cells = {(r, c) for r in range(r1, r2 + 1) for c in range(c1, c2 + 1)}
        if cells & covered:
            raise GridError(f"merge {m!r} overlaps another merge")
        covered |= cells
        clean_merges.append(m)

    outline = grid.get("row_outline")
    if outline is not None:
        if not isinstance(outline, dict):
            raise GridError("row_outline must be an object")
        levels = outline.get("levels")
        if not isinstance(levels, list) or len(levels) != len(rows):
            raise GridError("row_outline.levels needs one level per row")
        if not all(
            isinstance(lv, int) and not isinstance(lv, bool) and 0 <= lv <= MAX_OUTLINE_LEVEL for lv in levels
        ):
            raise GridError(f"row_outline levels must be whole numbers 0..{MAX_OUTLINE_LEVEL}")
        collapsed = outline.get("collapsed", False)
        if not isinstance(collapsed, bool):
            raise GridError("row_outline.collapsed must be true or false")
        outline = {"levels": levels, "collapsed": collapsed}

    def text(key):
        value = grid.get(key)
        return str(value).strip() if value not in (None, "") else ""

    return {
        "title": text("title"),
        "subtitle": text("subtitle"),
        "sheet_name": text("sheet_name"),
        "rows": clean_rows,
        "width": width,
        "merges": clean_merges,
        "header_rows": header_rows,
        "header_cols": header_cols,
        "row_outline": outline,
    }


def sheet_title(name):
    name = _SHEET_BAD.sub(" ", name or "").strip().strip("'")[:31].strip()
    return name or "Report"


def safe_filename(title):
    stem = re.sub(r"\s+", " ", _FILE_BAD.sub(" ", title or "")).strip()[:120].strip()
    return f"{stem or 'report'}.xlsx"


def _display_len(cell):
    if cell is None or cell["v"] is None:
        return 0
    v = cell["v"]
    if cell["t"] == "n":
        return len(f"{v:,.2f}") if isinstance(v, float) else len(f"{v:,}")
    if cell["t"] == "d":
        return 16 if (v.hour or v.minute or v.second) else 10
    return max((len(line) for line in str(v).splitlines()), default=0)


class _Writer:
    """Writes one validated grid into a worksheet, with one cached format per (style, number format)."""

    LOOKS = {
        "header": {"bold": True, "bg_color": "#E8EEF7", "valign": "vcenter"},
        "rowhead": {"bold": True, "bg_color": "#F5F7FA"},
        "total": {"bold": True, "bg_color": "#F0F0F0"},
        "body": {},
    }

    def __init__(self, book, ws, top):
        self.book, self.ws, self.top = book, ws, top
        self.formats = {}

    def fmt(self, cell):
        style = cell["s"] if cell else "body"
        num_format = (cell["z"] or ("dd/mm/yyyy" if cell["t"] == "d" else None)) if cell else None
        key = (style, num_format)
        if key not in self.formats:
            props = dict({"border": 1, "valign": "top"}, **self.LOOKS[style])
            if num_format:
                props["num_format"] = num_format
            self.formats[key] = self.book.add_format(props)
        return self.formats[key]

    def write(self, r, c, cell):
        r, f = self.top + r, self.fmt(cell)
        v = cell["v"] if cell else None
        if v is None:
            self.ws.write_blank(r, c, None, f)
        elif cell["t"] == "n":
            self.ws.write_number(r, c, v, f)
        elif cell["t"] == "d":
            self.ws.write_datetime(r, c, v, f)
        elif cell["t"] == "b":
            self.ws.write_boolean(r, c, v, f)
        else:
            self.ws.write_string(r, c, v, f)

    def merge(self, r1, c1, r2, c2, cell):
        self.ws.merge_range(self.top + r1, c1, self.top + r2, c2, None, self.fmt(cell))
        if cell is not None and cell["v"] is not None:
            self.write(r1, c1, cell)


def _write_heading(book, ws, grid):
    """Title, subtitle and a blank row; returns the first row of the grid."""
    if not grid["title"]:
        return 0
    ws.write_string(0, 0, grid["title"], book.add_format({"bold": True, "font_size": 14}))
    if not grid["subtitle"]:
        return 2
    ws.write_string(1, 0, grid["subtitle"], book.add_format({"font_color": "#666666", "italic": True}))
    return 3


_EMPTY_HEADER = {"v": None, "t": "s", "s": "header", "z": None}


def _cell_at(grid, r, c):
    """The cell at (r, c); an empty cell in the frozen header corner is drawn as a header, as on screen."""
    row = grid["rows"][r]
    cell = row[c] if c < len(row) else None
    if cell is None and r < grid["header_rows"] and c < grid["header_cols"]:
        return _EMPTY_HEADER
    return cell


def _column_widths(grid):
    """Widest text per column. A cell merged across columns is measured last: if its text is wider
    than the columns it spans, its first column takes the difference."""
    widths = [0] * grid["width"]
    wide = [(r1, c1, c2) for r1, c1, r2, c2 in grid["merges"] if c2 > c1]
    wide_starts = {(r1, c1) for r1, c1, c2 in wide}
    for i, row in enumerate(grid["rows"]):
        for j, cell in enumerate(row):
            if (i, j) not in wide_starts:
                widths[j] = max(widths[j], _display_len(cell))
    widths = [min(MAX_WIDTH, max(MIN_WIDTH, w + 2)) for w in widths]
    for r1, c1, c2 in wide:
        need = _display_len(_cell_at(grid, r1, c1)) + 2
        short = need - sum(widths[c1 : c2 + 1])
        if short > 0:
            widths[c1] = min(MAX_WIDTH, widths[c1] + short)
    return widths


def _write_outline(ws, top, outline):
    """Excel row groups, the summary row above its detail. Collapsed: every grouped row is hidden and each
    summary row carries the collapsed flag, so the file opens showing only level-0 rows."""
    ws.outline_settings(True, False, True, False)
    levels, collapsed = outline["levels"], outline["collapsed"]
    for i, lv in enumerate(levels):
        is_summary = i + 1 < len(levels) and levels[i + 1] > lv
        opts = {}
        if lv:
            opts["level"] = lv
            if collapsed:
                opts["hidden"] = True
        if collapsed and is_summary:
            opts["collapsed"] = True
        if opts:
            ws.set_row(top + i, None, None, opts)


def build_workbook(grid):
    """The .xlsx bytes for a grid returned by validate_grid."""
    out = io.BytesIO()
    book = xlsxwriter.Workbook(out, {"in_memory": True, "strings_to_formulas": False, "strings_to_urls": False})
    ws = book.add_worksheet(sheet_title(grid["sheet_name"]))
    top = _write_heading(book, ws, grid)
    writer = _Writer(book, ws, top)

    rows = grid["rows"]
    in_merge = set()
    for r1, c1, r2, c2 in grid["merges"]:
        in_merge |= {(r, c) for r in range(r1, r2 + 1) for c in range(c1, c2 + 1)}
        writer.merge(r1, c1, r2, c2, _cell_at(grid, r1, c1))
    for i in range(len(rows)):
        for j in range(grid["width"]):
            if (i, j) not in in_merge:
                writer.write(i, j, _cell_at(grid, i, j))

    for j, width in enumerate(_column_widths(grid)):
        ws.set_column(j, j, width)
    if grid.get("row_outline"):
        _write_outline(ws, top, grid["row_outline"])
    if grid["header_rows"] or grid["header_cols"]:
        ws.freeze_panes(top + grid["header_rows"], grid["header_cols"])
    book.close()
    return out.getvalue()
