/**
 * "Download as Excel (as shown)" — builds the ExportGrid JSON that the client
 * POSTs to /api/jrny/excel-export (see the JRNY spec
 * docs/superpowers/specs/2026-10-21-jrnybi-excel-as-shown-design.md).
 *
 * Pure functions, no React:
 *   - pivotExportGrid: the grid react-pivottable's TableRenderer draws, built
 *     with the same PivotData so keys, order and aggregation match exactly.
 *   - tableExportGrid: displayed table columns + rows, as typed cells.
 */
import { PivotData as PivotDataClass } from "react-pivottable/Utilities";
import {
  RedashDisplayAs,
  displayAsToCellType,
  numberFormatToExcel,
  dateTimeFormatToExcel,
  parseFormattedNumber,
} from "./excel-export";

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

export type ExportCellType = "s" | "n" | "d" | "b";
export type ExportCellStyle = "header" | "rowhead" | "total" | "body";

export interface ExportCellValue {
  v: string | number | boolean;
  t: ExportCellType;
  /** Excel number format. */
  z?: string;
  /** Defaults to "body" on the server. */
  s?: ExportCellStyle;
}

/** null = empty, or covered by a merge. */
export type ExportCell = ExportCellValue | null;

/** 0-based [first_row, first_col, last_row, last_col]; the top-left cell holds the value. */
export type ExportMerge = [number, number, number, number];

export interface ExportGrid {
  title?: string;
  subtitle?: string;
  sheet_name?: string;
  rows: ExportCell[][];
  header_rows: number;
  header_cols: number;
  merges: ExportMerge[];
  /** Excel row groups (table row tree): an outline level 0..7 per row, summary row above its detail. */
  row_outline?: { levels: number[]; collapsed: boolean };
}

/** What a Renderer puts in `exportRef.current` while mounted. */
export interface ExportGridSource {
  getGrid: () => ExportGrid | null;
}

export type ExportRef = { current: ExportGridSource | null };

// ---------------------------------------------------------------------------
// Pivot
// ---------------------------------------------------------------------------

// The typings don't declare getRowKeys / getColKeys / getAggregator.
const PivotData: any = PivotDataClass;

const PIVOT_DATA_OPTIONS = [
  "rows",
  "cols",
  "vals",
  "aggregatorName",
  "valueFilter",
  "sorters",
  "rowOrder",
  "colOrder",
  "derivedAttributes",
];

const INTEGER_AGGREGATORS = ["Count", "Count Unique Values", "Integer Sum"];
// Aggregators whose screen format passes non-numbers through untouched.
const PASS_THROUGH_AGGREGATORS = ["First", "Last", "Minimum", "Maximum"];

export function isTablePivotRenderer(rendererName: string | undefined | null): boolean {
  // PivotTableUI defaults to the first renderer, "Table".
  return rendererName == null || String(rendererName).startsWith("Table");
}

function numberFormatForAggregator(aggregatorName: string): string {
  if (aggregatorName.includes("Fraction")) return "0.0%";
  if (INTEGER_AGGREGATORS.includes(aggregatorName)) return "#,##0";
  return "#,##0.00";
}

/** react-pivottable's spanSize (TableRenderers.jsx): -1 = covered by the cell above/left. */
function spanSize(arr: any[][], i: number, j: number): number {
  if (i !== 0) {
    let noDraw = true;
    for (let x = 0; x <= j; x += 1) {
      if (arr[i - 1][x] !== arr[i][x]) noDraw = false;
    }
    if (noDraw) return -1;
  }
  let len = 0;
  while (i + len < arr.length) {
    let stop = false;
    for (let x = 0; x <= j; x += 1) {
      if (arr[i][x] !== arr[i + len][x]) stop = true;
    }
    if (stop) break;
    len += 1;
  }
  return len;
}

function labelCell(value: any, s: ExportCellStyle): ExportCellValue {
  return { v: value === null || value === undefined ? "" : String(value), t: "s", s };
}

function pivotValueCell(value: any, aggregatorName: string, s: ExportCellStyle): ExportCell {
  if (value === null || value === undefined || value === "") return null;
  let num: number | null = null;
  if (typeof value === "number") {
    num = value;
  } else if (
    typeof value === "string" &&
    PASS_THROUGH_AGGREGATORS.includes(aggregatorName) &&
    value.trim() !== "" &&
    !isNaN(Number(value))
  ) {
    // First/Last of a numeric string: the screen formats it as a number.
    num = Number(value);
  }
  if (num !== null) {
    if (!isFinite(num)) return null;
    return { v: num, t: "n", z: numberFormatForAggregator(aggregatorName), s };
  }
  return { v: String(value), t: "s", s };
}

/**
 * The grid react-pivottable's TableRenderer draws for `config` + `dataRows`
 * (the formatted rows the Renderer hands PivotTableUI), or null for chart
 * renderers / no rows.
 */
export function pivotExportGrid(config: any, dataRows: any[]): ExportGrid | null {
  const cfg = config || {};
  if (!isTablePivotRenderer(cfg.rendererName)) return null;
  if (!Array.isArray(dataRows) || dataRows.length === 0) return null;

  // Leave out undefined keys so PivotData's defaults apply (as on screen).
  const props: any = { data: dataRows };
  PIVOT_DATA_OPTIONS.forEach((key) => {
    if (cfg[key] !== undefined && cfg[key] !== null) props[key] = cfg[key];
  });

  let pivotData: any;
  try {
    pivotData = new PivotData(props);
  } catch (err) {
    // Same failure the screen shows as "An error occurred computing the PivotTable results."
    return null;
  }

  const aggregatorName: string = pivotData.props.aggregatorName;
  const rowAttrs: string[] = pivotData.props.rows;
  const colAttrs: string[] = pivotData.props.cols;
  const rowKeys: any[][] = pivotData.getRowKeys();
  const colKeys: any[][] = pivotData.getColKeys();
  const R = rowAttrs.length;
  const C = colAttrs.length;
  const nR = rowKeys.length;
  const nC = colKeys.length;

  // The screen hides these via CSS unless the options turn them on.
  const tableOptions = (cfg.rendererOptions && cfg.rendererOptions.table) || {};
  const showRowTotals = !!tableOptions.rowTotals; // right-hand Totals column
  const showColTotals = !!tableOptions.colTotals; // bottom Totals row

  if (R === 0 && C === 0) {
    // Only the grand total is drawn ("Totals | n").
    if (!(showRowTotals && showColTotals)) return null;
    return {
      rows: [
        [
          labelCell("Totals", "total"),
          pivotValueCell(pivotData.getAggregator([], []).value(), aggregatorName, "total"),
        ],
      ],
      header_rows: 0,
      header_cols: 1,
      merges: [],
    };
  }

  // Row labels occupy columns 0..R-1; when there are column attributes the
  // last row label also spans the column-axis-label column (colSpan 2).
  const firstValCol = R + (C > 0 ? 1 : 0);
  const totalCol = firstValCol + nC;
  const width = totalCol + (showRowTotals ? 1 : 0);
  const headerRows = C + (R > 0 ? 1 : 0);
  const height = headerRows + nR + (showColTotals ? 1 : 0);

  const rows: ExportCell[][] = [];
  for (let r = 0; r < height; r += 1) rows.push(new Array(width).fill(null));
  const merges: ExportMerge[] = [];

  const place = (r: number, c: number, cell: ExportCell, rowSpan = 1, colSpan = 1) => {
    if (c >= width || r >= height) return;
    rows[r][c] = cell;
    if (cell && (rowSpan > 1 || colSpan > 1)) {
      merges.push([r, c, Math.min(height, r + rowSpan) - 1, Math.min(width, c + colSpan) - 1]);
    }
  };

  // Column-attribute header rows. The top-left corner (colSpan R, rowSpan C)
  // is an empty header cell and stays null.
  colAttrs.forEach((attr, j) => {
    place(j, R, labelCell(attr, "header"));
    colKeys.forEach((colKey, i) => {
      const span = spanSize(colKeys, i, j);
      if (span === -1) return;
      const rowSpan = j === C - 1 && R !== 0 ? 2 : 1;
      place(j, firstValCol + i, labelCell(colKey[j], "header"), rowSpan, span);
    });
    if (j === 0 && showRowTotals) {
      place(0, totalCol, labelCell("Totals", "total"), headerRows, 1);
    }
  });

  // Row-attribute label row.
  if (R !== 0) {
    rowAttrs.forEach((attr, i) => place(C, i, labelCell(attr, "header")));
    // The th after the row attrs is empty when there are column attrs;
    // with none, it is the row-totals header.
    if (C === 0 && showRowTotals) place(C, totalCol, labelCell("Totals", "total"));
  }

  // Body.
  rowKeys.forEach((rowKey, i) => {
    const r = headerRows + i;
    rowKey.forEach((txt, j) => {
      const span = spanSize(rowKeys, i, j);
      if (span === -1) return;
      const colSpan = j === R - 1 && C !== 0 ? 2 : 1;
      place(r, j, labelCell(txt, "rowhead"), span, colSpan);
    });
    colKeys.forEach((colKey, k) => {
      place(
        r,
        firstValCol + k,
        pivotValueCell(pivotData.getAggregator(rowKey, colKey).value(), aggregatorName, "body")
      );
    });
    if (showRowTotals) {
      place(r, totalCol, pivotValueCell(pivotData.getAggregator(rowKey, []).value(), aggregatorName, "total"));
    }
  });

  // Totals row.
  if (showColTotals) {
    const r = headerRows + nR;
    place(r, 0, labelCell("Totals", "total"), 1, Math.max(1, firstValCol));
    colKeys.forEach((colKey, k) => {
      place(r, firstValCol + k, pivotValueCell(pivotData.getAggregator([], colKey).value(), aggregatorName, "total"));
    });
    if (showRowTotals) {
      place(r, totalCol, pivotValueCell(pivotData.getAggregator([], []).value(), aggregatorName, "total"));
    }
  }

  return { rows, header_rows: headerRows, header_cols: firstValCol, merges };
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export interface TableExportColumn {
  name: string;
  title?: string;
  displayAs?: RedashDisplayAs | string;
  numberFormat?: string;
  dateTimeFormat?: string;
  /** Excel format for text figures exported as numbers (see ExcelColumn.excelNumber). */
  excelNumber?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" at midnight, else "YYYY-MM-DDTHH:MM:SS". */
function isoFromParts(y: number, mo: number, d: number, h: number, mi: number, s: number): string {
  const date = `${String(y).padStart(4, "0")}-${pad(mo)}-${pad(d)}`;
  if (h === 0 && mi === 0 && s === 0) return date;
  return `${date}T${pad(h)}:${pad(mi)}:${pad(s)}`;
}

function isoFromLocalDate(d: Date): string {
  return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
}

const NAIVE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/** The wall-clock date/time the screen shows, as an ISO string, or null. */
function toIsoDateTime(value: any): string | null {
  if (value && typeof value === "object" && typeof value.format === "function" && typeof value.isValid === "function") {
    // moment: format() renders in the moment's own zone, as the table does.
    if (!value.isValid()) return null;
    const m = NAIVE_DATETIME.exec(value.format("YYYY-MM-DDTHH:mm:ss"));
    return m ? isoFromParts(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null;
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : isoFromLocalDate(value);
  }
  if (typeof value === "string") {
    const text = value.trim();
    const m = NAIVE_DATETIME.exec(text);
    // A zone-less string is kept as written, without shifting through a Date.
    if (m) return isoFromParts(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
    const d = new Date(text);
    return isNaN(d.getTime()) ? null : isoFromLocalDate(d);
  }
  return null;
}

function toBoolean(value: any): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "TRUE") return true;
  if (value === 0 || value === "0" || value === "false" || value === "FALSE") return false;
  return null;
}

function toText(value: any): string {
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
}

function tableCell(value: any, column: TableExportColumn): ExportCell {
  if (value === null || value === undefined || value === "") return null;
  if (column.excelNumber) {
    const figure = parseFormattedNumber(value);
    if (figure !== null) return { v: figure, t: "n", z: column.excelNumber, s: "body" };
  }
  const type = displayAsToCellType(column.displayAs as RedashDisplayAs);

  if (type === "n") {
    if (typeof value === "number" && !isFinite(value)) return null;
    const n = typeof value === "number" ? value : Number(value);
    if (isFinite(n) && !(typeof value === "string" && value.trim() === "")) {
      const z = numberFormatToExcel(column.numberFormat);
      return z ? { v: n, t: "n", z, s: "body" } : { v: n, t: "n", s: "body" };
    }
  } else if (type === "d") {
    const iso = toIsoDateTime(value);
    if (iso) return { v: iso, t: "d", z: dateTimeFormatToExcel(column.dateTimeFormat), s: "body" };
  } else if (type === "b") {
    const b = toBoolean(value);
    if (b !== null) return { v: b, t: "b", s: "body" };
  }
  // Text, including anything that doesn't parse as its column type.
  return { v: toText(value), t: "s", s: "body" };
}

/**
 * The table as displayed: `columns` are the visible columns in display order,
 * `rows` the data rows in display order (after search and sort).
 */
export function tableExportGrid(columns: TableExportColumn[], rows: any[]): ExportGrid | null {
  if (!Array.isArray(columns) || columns.length === 0) return null;
  const header: ExportCell[] = columns.map((c) => labelCell(c.title || c.name, "header"));
  const body: ExportCell[][] = (rows || []).map((row) =>
    columns.map((c) => tableCell(row ? row[c.name] : undefined, c))
  );
  return { rows: [header, ...body], header_rows: 1, header_cols: 0, merges: [] };
}
