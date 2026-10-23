/**
 * "Download as Excel (as shown)" grid builder tests.
 *
 * The pivot grid must mirror what react-pivottable's TableRenderer draws:
 * same keys, same order, same aggregation, same spans (as merges), with the
 * totals the screen shows (rendererOptions.table.rowTotals / colTotals).
 */
import { pivotExportGrid, tableExportGrid, ExportGrid } from "./export-grid";

const H = (v: string) => ({ v, t: "s", s: "header" });
const RH = (v: string) => ({ v, t: "s", s: "rowhead" });
const TL = (v = "Totals") => ({ v, t: "s", s: "total" });
const N = (v: number, z = "#,##0") => ({ v, t: "n", z, s: "body" });
const TN = (v: number, z = "#,##0") => ({ v, t: "n", z, s: "total" });

// Mirrors the Shoprite Weekly Invoice Count report: customers down the side,
// year-weeks across, Integer Sum of InvoiceCount, both totals shown. Rows are
// deliberately out of order so the test proves the pivot's own sorting.
const shopriteRows = [
  { CustomerName: "Shoprite Checkers", YearWeek: "2026-41", InvoiceCount: 3 },
  { CustomerName: "Checkers Hyper", YearWeek: "2026-40", InvoiceCount: 2 },
  { CustomerName: "Shoprite Checkers", YearWeek: "2026-40", InvoiceCount: 5 },
  { CustomerName: "Shoprite Checkers", YearWeek: "2026-41", InvoiceCount: 1 },
  { CustomerName: "Usave", YearWeek: "2026-42", InvoiceCount: 4 },
];

function shopriteConfig(table: any = { rowTotals: true, colTotals: true }) {
  return {
    rows: ["CustomerName"],
    cols: ["YearWeek"],
    vals: ["InvoiceCount"],
    aggregatorName: "Integer Sum",
    rendererName: "Table",
    rowOrder: "key_a_to_z",
    colOrder: "key_a_to_z",
    rendererOptions: { table },
  };
}

describe("pivotExportGrid()", () => {
  test("Shoprite-style pivot: exact grid with both totals", () => {
    const grid = pivotExportGrid(shopriteConfig(), shopriteRows) as ExportGrid;
    expect(grid).not.toBeNull();
    expect(grid.rows).toEqual([
      [null, H("YearWeek"), H("2026-40"), H("2026-41"), H("2026-42"), TL()],
      [H("CustomerName"), null, null, null, null, null],
      [RH("Checkers Hyper"), null, N(2), null, null, TN(2)],
      [RH("Shoprite Checkers"), null, N(5), N(4), null, TN(9)],
      [RH("Usave"), null, null, null, N(4), TN(4)],
      [TL(), null, TN(7), TN(4), TN(4), TN(15)],
    ]);
    expect(grid.header_rows).toBe(2);
    expect(grid.header_cols).toBe(2);
    expect(grid.merges).toEqual([
      [0, 2, 1, 2],
      [0, 3, 1, 3],
      [0, 4, 1, 4],
      [0, 5, 1, 5],
      [2, 0, 2, 1],
      [3, 0, 3, 1],
      [4, 0, 4, 1],
      [5, 0, 5, 1],
    ]);
  });

  test("undefined rendererName defaults to the Table renderer", () => {
    const config: any = shopriteConfig();
    delete config.rendererName;
    expect(pivotExportGrid(config, shopriteRows)).toEqual(pivotExportGrid(shopriteConfig(), shopriteRows));
  });

  test("totals off: no Totals column and no Totals row", () => {
    const grid = pivotExportGrid(shopriteConfig({}), shopriteRows) as ExportGrid;
    expect(grid.rows).toEqual([
      [null, H("YearWeek"), H("2026-40"), H("2026-41"), H("2026-42")],
      [H("CustomerName"), null, null, null, null],
      [RH("Checkers Hyper"), null, N(2), null, null],
      [RH("Shoprite Checkers"), null, N(5), N(4), null],
      [RH("Usave"), null, null, null, N(4)],
    ]);
    expect(grid.merges).toEqual([
      [0, 2, 1, 2],
      [0, 3, 1, 3],
      [0, 4, 1, 4],
      [2, 0, 2, 1],
      [3, 0, 3, 1],
      [4, 0, 4, 1],
    ]);
  });

  test("row totals only: right column without the bottom row", () => {
    const grid = pivotExportGrid(shopriteConfig({ rowTotals: true }), shopriteRows) as ExportGrid;
    expect(grid.rows.length).toBe(5);
    expect(grid.rows[0][5]).toEqual(TL());
    expect(grid.rows[3][5]).toEqual(TN(9));
  });

  test("column totals only: bottom row without the grand total", () => {
    const grid = pivotExportGrid(shopriteConfig({ colTotals: true }), shopriteRows) as ExportGrid;
    expect(grid.rows[0].length).toBe(5);
    expect(grid.rows[5]).toEqual([TL(), null, TN(7), TN(4), TN(4)]);
  });

  test("two row attributes: repeated outer labels merge vertically", () => {
    const rows = [
      { Region: "Gauteng", Customer: "A", Week: "W1", Qty: 1 },
      { Region: "Gauteng", Customer: "B", Week: "W1", Qty: 2 },
      { Region: "KZN", Customer: "C", Week: "W1", Qty: 3 },
    ];
    const grid = pivotExportGrid(
      {
        rows: ["Region", "Customer"],
        cols: ["Week"],
        vals: ["Qty"],
        aggregatorName: "Integer Sum",
        rendererOptions: { table: { rowTotals: true, colTotals: true } },
      },
      rows
    ) as ExportGrid;
    expect(grid.rows).toEqual([
      [null, null, H("Week"), H("W1"), TL()],
      [H("Region"), H("Customer"), null, null, null],
      [RH("Gauteng"), RH("A"), null, N(1), TN(1)],
      [null, RH("B"), null, N(2), TN(2)],
      [RH("KZN"), RH("C"), null, N(3), TN(3)],
      [TL(), null, null, TN(6), TN(6)],
    ]);
    expect(grid.header_rows).toBe(2);
    expect(grid.header_cols).toBe(3);
    expect(grid.merges).toEqual([
      [0, 3, 1, 3],
      [0, 4, 1, 4],
      [2, 0, 3, 0],
      [2, 1, 2, 2],
      [3, 1, 3, 2],
      [4, 1, 4, 2],
      [5, 0, 5, 2],
    ]);
  });

  test("two column attributes: repeated outer labels merge horizontally", () => {
    const rows = [
      { Cust: "A", Year: "2025", Month: "01", Qty: 1 },
      { Cust: "A", Year: "2025", Month: "02", Qty: 2 },
      { Cust: "A", Year: "2026", Month: "01", Qty: 4 },
    ];
    const grid = pivotExportGrid(
      {
        rows: ["Cust"],
        cols: ["Year", "Month"],
        vals: ["Qty"],
        aggregatorName: "Integer Sum",
        rendererOptions: { table: { rowTotals: true, colTotals: true } },
      },
      rows
    ) as ExportGrid;
    expect(grid.rows).toEqual([
      [null, H("Year"), H("2025"), null, H("2026"), TL()],
      [null, H("Month"), H("01"), H("02"), H("01"), null],
      [H("Cust"), null, null, null, null, null],
      [RH("A"), null, N(1), N(2), N(4), TN(7)],
      [TL(), null, TN(1), TN(2), TN(4), TN(7)],
    ]);
    expect(grid.header_rows).toBe(3);
    expect(grid.header_cols).toBe(2);
    expect(grid.merges).toEqual([
      [0, 2, 0, 3],
      [0, 5, 2, 5],
      [1, 2, 2, 2],
      [1, 3, 2, 3],
      [1, 4, 2, 4],
      [3, 0, 3, 1],
      [4, 0, 4, 1],
    ]);
  });

  test("Fraction aggregators use a percentage format", () => {
    const grid = pivotExportGrid(
      { ...shopriteConfig(), aggregatorName: "Sum as Fraction of Total" },
      shopriteRows
    ) as ExportGrid;
    expect(grid.rows[2][2]).toEqual({ v: 2 / 15, t: "n", z: "0.0%", s: "body" });
    expect(grid.rows[5][5]).toEqual({ v: 1, t: "n", z: "0.0%", s: "total" });
  });

  test("Count is an integer format; Sum/Average use two decimals", () => {
    const count = pivotExportGrid({ ...shopriteConfig(), aggregatorName: "Count" }, shopriteRows) as ExportGrid;
    expect(count.rows[3][3]).toEqual(N(2));
    const avg = pivotExportGrid({ ...shopriteConfig(), aggregatorName: "Average" }, shopriteRows) as ExportGrid;
    expect(avg.rows[3][3]).toEqual(N(2, "#,##0.00"));
  });

  test("List Unique Values is text", () => {
    const grid = pivotExportGrid(
      { ...shopriteConfig(), aggregatorName: "List Unique Values" },
      shopriteRows
    ) as ExportGrid;
    expect(grid.rows[3][3]).toEqual({ v: "3, 1", t: "s", s: "body" });
  });

  test("chart renderers cannot be exported", () => {
    expect(pivotExportGrid({ ...shopriteConfig(), rendererName: "Grouped Column Chart" }, shopriteRows)).toBeNull();
    expect(pivotExportGrid({ ...shopriteConfig(), rendererName: "Exportable TSV" }, shopriteRows)).toBeNull();
  });

  test("heatmap table renderers export like the plain table", () => {
    const grid = pivotExportGrid({ ...shopriteConfig(), rendererName: "Table Heatmap" }, shopriteRows);
    expect(grid).toEqual(pivotExportGrid(shopriteConfig(), shopriteRows));
  });

  test("no rows → null", () => {
    expect(pivotExportGrid(shopriteConfig(), [])).toBeNull();
    expect(pivotExportGrid(shopriteConfig(), undefined as any)).toBeNull();
  });

  test("valueFilter excludes filtered records, as on screen", () => {
    const grid = pivotExportGrid(
      { ...shopriteConfig(), valueFilter: { CustomerName: { Usave: true } } },
      shopriteRows
    ) as ExportGrid;
    expect(grid.rows.map((r) => r[0])).toEqual([
      null,
      H("CustomerName"),
      RH("Checkers Hyper"),
      RH("Shoprite Checkers"),
      TL(),
    ]);
    // Week 2026-42 only had Usave rows, so its column goes too.
    expect(grid.rows[0]).toEqual([null, H("YearWeek"), H("2026-40"), H("2026-41"), TL()]);
    expect(grid.rows[4][4]).toEqual(TN(11));
  });
});

describe("tableExportGrid()", () => {
  const columns = [
    { name: "doc", title: "Document", displayAs: "string" },
    { name: "amount", title: "Amount", displayAs: "number", numberFormat: "0,0.00" },
    { name: "posted", title: "Posted", displayAs: "datetime", dateTimeFormat: "DD/MM/YYYY" },
    { name: "paid", title: "Paid", displayAs: "boolean" },
  ];

  test("header row uses titles in the given order, then typed body cells", () => {
    const grid = tableExportGrid(columns, [
      { doc: "=SUM(A1)", amount: 1234.5, posted: "2026-10-21T08:30:00", paid: true },
      { doc: "INV-2", amount: "12", posted: new Date(2026, 9, 1), paid: "false" },
    ]) as ExportGrid;
    expect(grid.header_rows).toBe(1);
    expect(grid.header_cols).toBe(0);
    expect(grid.merges).toEqual([]);
    expect(grid.rows[0]).toEqual([H("Document"), H("Amount"), H("Posted"), H("Paid")]);
    expect(grid.rows[1]).toEqual([
      { v: "=SUM(A1)", t: "s", s: "body" },
      { v: 1234.5, t: "n", z: "0,0.00", s: "body" },
      { v: "2026-10-21T08:30:00", t: "d", z: "dd/mm/yyyy", s: "body" },
      { v: true, t: "b", s: "body" },
    ]);
    expect(grid.rows[2]).toEqual([
      { v: "INV-2", t: "s", s: "body" },
      { v: 12, t: "n", z: "0,0.00", s: "body" },
      { v: "2026-10-01", t: "d", z: "dd/mm/yyyy", s: "body" },
      { v: false, t: "b", s: "body" },
    ]);
  });

  test("moment-like values export their local wall-clock time", () => {
    const fakeMoment = {
      isValid: () => true,
      format: (f: string) => (f === "YYYY-MM-DDTHH:mm:ss" ? "2026-10-21T20:40:00" : "x"),
      toDate: () => new Date(2026, 9, 21, 20, 40, 0),
    };
    const grid = tableExportGrid([columns[2]], [{ posted: fakeMoment }]) as ExportGrid;
    expect(grid.rows[1][0]).toEqual({ v: "2026-10-21T20:40:00", t: "d", z: "dd/mm/yyyy", s: "body" });
  });

  test("null handling and fallbacks", () => {
    const grid = tableExportGrid(columns, [
      { doc: null, amount: NaN, posted: "not a date", paid: "maybe" },
      { doc: undefined, amount: undefined, posted: null, paid: null },
      { doc: 42, amount: Infinity, posted: "", paid: undefined },
    ]) as ExportGrid;
    expect(grid.rows[1]).toEqual([
      null,
      null,
      { v: "not a date", t: "s", s: "body" },
      { v: "maybe", t: "s", s: "body" },
    ]);
    expect(grid.rows[2]).toEqual([null, null, null, null]);
    expect(grid.rows[3]).toEqual([{ v: "42", t: "s", s: "body" }, null, null, null]);
  });

  test("title falls back to the column name; no z when the format is unset", () => {
    const grid = tableExportGrid([{ name: "qty", displayAs: "number" }], [{ qty: 3 }]) as ExportGrid;
    expect(grid.rows).toEqual([[H("qty")], [{ v: 3, t: "n", s: "body" }]]);
  });

  test("no columns → null; no rows → header only", () => {
    expect(tableExportGrid([], [{ a: 1 }])).toBeNull();
    const grid = tableExportGrid(columns, []) as ExportGrid;
    expect(grid.rows).toEqual([[H("Document"), H("Amount"), H("Posted"), H("Paid")]]);
  });
});

describe("tableExportGrid() with excelNumber columns", () => {
  test("text figures become numbers with the column's Excel format", () => {
    const grid = tableExportGrid(
      [
        { name: "g", title: "Group", displayAs: "string" },
        { name: "a", title: "Actual", displayAs: "string", excelNumber: "#,##0.00;(#,##0.00)" },
        { name: "v", title: "Variance", displayAs: "string", excelNumber: "#,##0;(#,##0)" },
      ],
      [
        { g: "Sales", a: "(8,355,186.77)", v: "1,200" },
        { g: "Gross Income", a: "", v: "n/a" },
      ]
    ) as ExportGrid;
    expect(grid.rows[1]).toEqual([
      { v: "Sales", t: "s", s: "body" },
      { v: -8355186.77, t: "n", z: "#,##0.00;(#,##0.00)", s: "body" },
      { v: 1200, t: "n", z: "#,##0;(#,##0)", s: "body" },
    ]);
    expect(grid.rows[2]).toEqual([{ v: "Gross Income", t: "s", s: "body" }, null, { v: "n/a", t: "s", s: "body" }]);
  });
});
