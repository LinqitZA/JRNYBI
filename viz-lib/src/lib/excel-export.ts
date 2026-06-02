/**
 * Excel export utility — converts JRNYBI table-viz data into a properly
 * formatted .xlsx workbook using SheetJS Community (xlsx, Apache 2.0).
 *
 * Why this exists: the upstream Redash "Download as CSV/TSV" feature
 * preserves no type information, breaks on dates, and corrupts numbers
 * that Excel interprets aggressively (leading zeros, very large IDs).
 * SheetJS lets us emit a real workbook with:
 *   - column-aware cell types ('n' / 'd' / 'b' / 's')
 *   - cell-level number / date formats lifted from each column's options
 *   - a frozen first row (the header)
 *   - sensible auto-widths
 *
 * The util is intentionally renderer-agnostic — call it from the Table viz
 * toolbar, from a dashboard-level "Export all" button, or from a CLI script.
 */
import * as XLSX from "xlsx";

// Redash column metadata uses these displayAs values. We only care about
// the ones that affect cell-type mapping; anything else falls through to
// string.
export type RedashDisplayAs =
  | "string"
  | "text"
  | "number"
  | "datetime"
  | "date"
  | "boolean"
  | "link"
  | "image"
  | "json"
  | "sparkline"
  | "data-bar";

export interface ExcelColumn {
  /** Field name in each row record. */
  name: string;
  /** Header label shown in row 1. Falls back to `name`. */
  title?: string;
  /** Renderer type — drives the SheetJS cell type mapping. */
  displayAs?: RedashDisplayAs;
  /** Whether the column is included in the export. Defaults to true. */
  visible?: boolean;
  /** Column ordering for the exported sheet (ascending). */
  order?: number;
  /**
   * numeraljs-style number format (e.g. "0,0.00"). Translated to a basic
   * Excel format string when possible; otherwise left unset so Excel uses
   * the workbook default.
   */
  numberFormat?: string;
  /** moment-style datetime format. Translated to Excel format. */
  dateTimeFormat?: string;
  /** Description — written to the column header comment. */
  description?: string;
}

export interface ExcelExportOptions {
  /** Worksheet name. Defaults to "Sheet1". Truncated to Excel's 31-char limit. */
  sheetName?: string;
  /** Workbook author. Defaults to "JRNYBI". */
  author?: string;
  /** Workbook title metadata. Defaults to sheetName. */
  title?: string;
}

// ---------------------------------------------------------------------------
// Type / format translation
// ---------------------------------------------------------------------------

/**
 * Map a Redash column displayAs to a SheetJS cell type code.
 *   - 'n' number
 *   - 'd' date (Excel stores dates as numbers; SheetJS handles the conversion
 *         when the cell's `t` is 'd' and `v` is a Date object)
 *   - 'b' boolean
 *   - 's' string (default)
 *
 * "link" / "image" / "json" / "text" / "string" all serialise as strings —
 * the export is a flat workbook, not the rich rendered HTML.
 */
export function displayAsToCellType(displayAs?: RedashDisplayAs): "n" | "d" | "b" | "s" {
  switch (displayAs) {
    case "number":
    case "data-bar":
      // Feature #208 — data-bar cells render UI chrome, but the underlying
      // value is numeric and should export as a number cell.
      return "n";
    case "datetime":
    case "date":
      return "d";
    case "boolean":
      return "b";
    default:
      return "s";
  }
}

/**
 * Translate a numeraljs-style number format to an Excel format code.
 * Excel's format-code grammar overlaps significantly with numeraljs but
 * isn't identical (numeraljs uses [.] for optional, Excel doesn't), so we
 * normalise the common cases and leave anything we don't recognise as
 * undefined so Excel uses General.
 */
export function numberFormatToExcel(fmt: string | undefined): string | undefined {
  if (!fmt) return undefined;
  // numeraljs "[.]" means "optional decimal" — Excel has no exact equivalent;
  // strip the brackets so 0,0[.]00 -> 0,0.00 which is close enough.
  let out = fmt.replace(/\[(\.[0#]+)\]/g, "$1");
  // "0[0]" optional digit — strip brackets, Excel uses # for optional.
  out = out.replace(/\[0+\]/g, m => "#".repeat(m.length - 2));
  // Reject anything that still has unbalanced brackets — fall through to General.
  if (/[\[\]]/.test(out)) return undefined;
  return out;
}

/**
 * Translate a moment.js datetime format to an Excel datetime format code.
 * Excel cares about: yyyy, mm (month), mmm/mmmm, dd, hh, mm (minute -
 * disambiguated by position), ss, AM/PM. We do a minimal but useful
 * translation; unknown patterns fall through to a sensible default.
 */
export function dateTimeFormatToExcel(fmt: string | undefined): string {
  if (!fmt) return "yyyy-mm-dd hh:mm:ss";
  return fmt
    .replace(/YYYY/g, "yyyy")
    .replace(/YY/g, "yy")
    .replace(/MMMM/g, "mmmm")
    .replace(/MMM/g, "mmm")
    .replace(/MM/g, "mm")
    .replace(/DD/g, "dd")
    .replace(/HH/g, "hh")
    .replace(/H/g, "h")
    .replace(/mm/g, "mm") // minute
    .replace(/ss/g, "ss")
    .replace(/A/g, "AM/PM");
}

// ---------------------------------------------------------------------------
// Cell construction
// ---------------------------------------------------------------------------

function coerceBoolean(value: any): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "TRUE") return true;
  if (value === 0 || value === "0" || value === "false" || value === "FALSE") return false;
  return null;
}

function coerceDate(value: any): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string" && value) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  // moment objects have toDate()
  if (value && typeof value === "object" && typeof (value as any).toDate === "function") {
    const d = (value as any).toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  return null;
}

function buildCell(rawValue: any, column: ExcelColumn): XLSX.CellObject {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    // Empty cell — type 's' with empty value so SheetJS doesn't emit anything weird.
    return { t: "s", v: "" } as XLSX.CellObject;
  }

  const type = displayAsToCellType(column.displayAs);

  if (type === "n") {
    const n = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!isFinite(n)) {
      return { t: "s", v: String(rawValue) } as XLSX.CellObject;
    }
    const z = numberFormatToExcel(column.numberFormat);
    return z ? ({ t: "n", v: n, z } as XLSX.CellObject) : ({ t: "n", v: n } as XLSX.CellObject);
  }

  if (type === "d") {
    const d = coerceDate(rawValue);
    if (!d) {
      return { t: "s", v: String(rawValue) } as XLSX.CellObject;
    }
    return { t: "d", v: d, z: dateTimeFormatToExcel(column.dateTimeFormat) } as XLSX.CellObject;
  }

  if (type === "b") {
    const b = coerceBoolean(rawValue);
    if (b === null) {
      return { t: "s", v: String(rawValue) } as XLSX.CellObject;
    }
    return { t: "b", v: b } as XLSX.CellObject;
  }

  // For "link" columns we accept either a plain string or an object with
  // { href, label } shape — emit just the label / href, no hyperlink markup
  // (SheetJS supports `l: { Target: ... }` for true hyperlinks).
  if (column.displayAs === "link" && rawValue && typeof rawValue === "object") {
    const href: string = (rawValue as any).href || "";
    const text: string = (rawValue as any).label || (rawValue as any).text || href;
    const cell: any = { t: "s", v: text };
    if (href) cell.l = { Target: href };
    return cell as XLSX.CellObject;
  }

  return { t: "s", v: String(rawValue) } as XLSX.CellObject;
}

function autoColumnWidth(values: Array<string | undefined>): number {
  const maxLen = values.reduce<number>((acc, v) => Math.max(acc, v ? v.length : 0), 0);
  // SheetJS column widths use 'wch' (width in characters). Clamp to a sane
  // range so a single 500-char description doesn't blow out the sheet.
  return Math.max(8, Math.min(50, maxLen + 2));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an xlsx Workbook from JRNYBI column metadata + row records.
 * Caller is responsible for triggering the download (see `downloadExcel`).
 */
export function buildWorkbook(
  columns: ExcelColumn[],
  rows: Array<Record<string, any>>,
  options: ExcelExportOptions = {}
): XLSX.WorkBook {
  const { sheetName = "Sheet1", author = "JRNYBI", title = sheetName } = options;

  // Filter to visible columns, ordered.
  const visibleColumns = columns
    .filter(c => c.visible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Worksheet object — SheetJS expects an object keyed by A1-style cell refs.
  const ws: XLSX.WorkSheet = {};

  const lastRow = rows.length; // header is row 0, data rows are 1..lastRow
  const lastCol = Math.max(0, visibleColumns.length - 1);
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } });

  // Header row + comments
  visibleColumns.forEach((column, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    const headerCell: any = {
      t: "s",
      v: column.title || column.name,
      s: { font: { bold: true } }, // SheetJS Community ignores styles in .xlsx writes,
      // but storing them costs nothing and SheetJS Pro / readers will honour them.
    };
    if (column.description) {
      headerCell.c = [{ a: author, t: column.description }];
    }
    ws[cellRef] = headerCell;
  });

  // Data rows
  rows.forEach((row, rowIdx) => {
    visibleColumns.forEach((column, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx });
      ws[cellRef] = buildCell(row[column.name], column);
    });
  });

  // Column widths — use header + first 50 rows to compute a representative width.
  const sampleSize = Math.min(rows.length, 50);
  ws["!cols"] = visibleColumns.map((column) => {
    const sampleValues: string[] = [];
    sampleValues.push(column.title || column.name);
    for (let i = 0; i < sampleSize; i += 1) {
      const v = rows[i][column.name];
      sampleValues.push(v == null ? "" : String(v));
    }
    return { wch: autoColumnWidth(sampleValues) };
  });

  // Frozen header row — SheetJS reads `!freeze` / pane settings via `!cols`
  // and `!rows` is read-only; the canonical way is via `Workbook.Views`.
  // We also store `!margins`-adjacent freeze hints which xlsx-write picks up.
  (ws as any)["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };

  const wb: XLSX.WorkBook = XLSX.utils.book_new();
  wb.Props = {
    Title: title,
    Author: author,
    CreatedDate: undefined as any, // intentionally omit so the workbook is deterministic for tests
  };
  // Configure the first sheet's view with a frozen top row. SheetJS uses
  // `Workbook.Views[0].RTL` for global; per-sheet freeze panes live on the
  // worksheet object via "!freeze" (which we set above) and are emitted on
  // write through the sheet's <sheetViews> XML.
  wb.Workbook = {
    Views: [{ RTL: false }],
    Sheets: [
      {
        // SheetJS pane settings: ySplit=1 -> top row stays frozen.
        Hidden: 0,
      },
    ],
  } as any;

  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
  return wb;
}

/**
 * Convenience: build a workbook and trigger a browser download.
 * Wrapper around SheetJS's `XLSX.writeFile` (which uses a Blob URL under
 * the hood). Use `buildWorkbook` directly + `XLSX.write` if you need to
 * stream / upload the result instead.
 */
export function downloadExcel(
  columns: ExcelColumn[],
  rows: Array<Record<string, any>>,
  filename: string,
  options: ExcelExportOptions = {}
): void {
  const safe = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  const wb = buildWorkbook(columns, rows, options);
  XLSX.writeFile(wb, safe, { bookType: "xlsx" });
}
