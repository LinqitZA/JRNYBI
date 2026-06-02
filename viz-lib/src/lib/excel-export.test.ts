/**
 * Excel export utility tests.
 *
 * The tests do NOT crack open the binary .xlsx output — they inspect the
 * in-memory Workbook structure that SheetJS produces before serialization
 * (cell types, formats, header, frozen pane, column widths). This keeps
 * the assertions readable and avoids depending on the binary format.
 */
import * as XLSX from "xlsx";

import {
  buildWorkbook,
  displayAsToCellType,
  numberFormatToExcel,
  dateTimeFormatToExcel,
  ExcelColumn,
} from "./excel-export";

describe("displayAsToCellType()", () => {
  test("maps number → 'n'", () => {
    expect(displayAsToCellType("number")).toBe("n");
  });
  test("maps datetime / date → 'd'", () => {
    expect(displayAsToCellType("datetime")).toBe("d");
    expect(displayAsToCellType("date")).toBe("d");
  });
  test("maps boolean → 'b'", () => {
    expect(displayAsToCellType("boolean")).toBe("b");
  });
  test("everything else → 's'", () => {
    expect(displayAsToCellType("string")).toBe("s");
    expect(displayAsToCellType("link")).toBe("s");
    expect(displayAsToCellType("image")).toBe("s");
    expect(displayAsToCellType("json")).toBe("s");
    expect(displayAsToCellType(undefined)).toBe("s");
  });
});

describe("numberFormatToExcel()", () => {
  test("strips numeraljs optional-decimal brackets", () => {
    expect(numberFormatToExcel("0,0[.]00")).toBe("0,0.00");
  });
  test("passes through plain Excel-compatible formats", () => {
    expect(numberFormatToExcel("0,0.00")).toBe("0,0.00");
    expect(numberFormatToExcel("$#,##0.00")).toBe("$#,##0.00");
  });
  test("returns undefined for empty / nullish", () => {
    expect(numberFormatToExcel(undefined)).toBeUndefined();
    expect(numberFormatToExcel("")).toBeUndefined();
  });
});

describe("dateTimeFormatToExcel()", () => {
  test("translates moment tokens to Excel tokens", () => {
    expect(dateTimeFormatToExcel("YYYY-MM-DD HH:mm:ss")).toBe("yyyy-mm-dd hh:mm:ss");
  });
  test("provides a sensible default", () => {
    expect(dateTimeFormatToExcel(undefined)).toBe("yyyy-mm-dd hh:mm:ss");
  });
});

describe("buildWorkbook()", () => {
  const columns: ExcelColumn[] = [
    { name: "id", title: "ID", displayAs: "number", order: 0 },
    { name: "name", title: "Customer", displayAs: "string", order: 1 },
    { name: "created_at", title: "Created", displayAs: "datetime", order: 2, dateTimeFormat: "YYYY-MM-DD" },
    { name: "amount", title: "Amount", displayAs: "number", order: 3, numberFormat: "0,0[.]00" },
    { name: "active", title: "Active", displayAs: "boolean", order: 4 },
    { name: "hidden", title: "Hidden", displayAs: "string", order: 5, visible: false },
  ];

  const rows: Array<Record<string, any>> = [
    { id: 1, name: "Acme", created_at: "2026-01-15T09:30:00Z", amount: 1234.5, active: true, hidden: "x" },
    { id: 2, name: "Beta", created_at: "2026-02-20T12:00:00Z", amount: 7890.1, active: false, hidden: "y" },
  ];

  let wb: XLSX.WorkBook;
  let ws: XLSX.WorkSheet;

  beforeAll(() => {
    wb = buildWorkbook(columns, rows, { sheetName: "Customers", author: "TestAuthor" });
    ws = wb.Sheets[wb.SheetNames[0]];
  });

  test("creates a single sheet with the supplied name", () => {
    expect(wb.SheetNames).toEqual(["Customers"]);
  });

  test("emits a frozen-header pane setting", () => {
    expect((ws as any)["!freeze"]).toBeDefined();
    expect((ws as any)["!freeze"].ySplit).toBe(1);
  });

  test("writes the header row using column titles, bold style hint", () => {
    expect(ws["A1"].v).toBe("ID");
    expect(ws["B1"].v).toBe("Customer");
    expect(ws["C1"].v).toBe("Created");
    expect(ws["D1"].v).toBe("Amount");
    expect(ws["E1"].v).toBe("Active");
    // Hidden column should NOT appear in the export
    expect(ws["F1"]).toBeUndefined();
    // Bold style hint is stored even though SheetJS Community doesn't render it on write.
    expect(ws["A1"].s && ws["A1"].s.font && ws["A1"].s.font.bold).toBe(true);
  });

  test("maps each column's cell type correctly", () => {
    // Row 2 = first data row (header is row 1)
    expect(ws["A2"].t).toBe("n");
    expect(ws["A2"].v).toBe(1);

    expect(ws["B2"].t).toBe("s");
    expect(ws["B2"].v).toBe("Acme");

    expect(ws["C2"].t).toBe("d");
    expect(ws["C2"].v).toBeInstanceOf(Date);

    expect(ws["D2"].t).toBe("n");
    expect(ws["D2"].v).toBe(1234.5);
    // Number format translated and applied to the cell
    expect(ws["D2"].z).toBe("0,0.00");

    expect(ws["E2"].t).toBe("b");
    expect(ws["E2"].v).toBe(true);

    // boolean false also coerces correctly
    expect(ws["E3"].t).toBe("b");
    expect(ws["E3"].v).toBe(false);
  });

  test("applies dateTimeFormat to date cells", () => {
    expect(ws["C2"].z).toBe("yyyy-mm-dd");
  });

  test("computes column widths and the worksheet range", () => {
    expect(ws["!cols"]).toBeDefined();
    expect(ws["!cols"]!.length).toBe(5); // 5 visible columns
    ws["!cols"]!.forEach((c: any) => {
      expect(c.wch).toBeGreaterThanOrEqual(8);
      expect(c.wch).toBeLessThanOrEqual(50);
    });
    expect(ws["!ref"]).toBe("A1:E3"); // 5 cols × (1 header + 2 data) = A1:E3
  });

  test("uses Sheet1 by default", () => {
    const defaultWb = buildWorkbook(columns, rows);
    expect(defaultWb.SheetNames).toEqual(["Sheet1"]);
  });

  test("treats null / undefined / empty as blank string cell", () => {
    const wb2 = buildWorkbook(
      [{ name: "x", displayAs: "string" }],
      [{ x: null }, { x: undefined }, { x: "" }]
    );
    const ws2 = wb2.Sheets[wb2.SheetNames[0]];
    expect(ws2["A2"].t).toBe("s");
    expect(ws2["A2"].v).toBe("");
    expect(ws2["A3"].v).toBe("");
    expect(ws2["A4"].v).toBe("");
  });

  test("preserves workbook author metadata", () => {
    expect(wb.Props && wb.Props.Author).toBe("TestAuthor");
  });

  test("truncates very long sheet names to Excel's 31-char limit", () => {
    const long = "A".repeat(60);
    const wbLong = buildWorkbook(columns, rows, { sheetName: long });
    expect(wbLong.SheetNames[0].length).toBe(31);
  });

  test("falls back to string when a 'number'-typed cell isn't numeric", () => {
    const wb3 = buildWorkbook(
      [{ name: "n", displayAs: "number" }],
      [{ n: "not-a-number" }]
    );
    const ws3 = wb3.Sheets[wb3.SheetNames[0]];
    expect(ws3["A2"].t).toBe("s");
    expect(ws3["A2"].v).toBe("not-a-number");
  });
});
