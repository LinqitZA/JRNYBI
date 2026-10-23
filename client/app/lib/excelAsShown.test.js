import {
  canExportAsShown,
  formatParameterValue,
  buildExportSubtitle,
  buildExportTitle,
  sanitizeExcelFileName,
  resolveSelectedVisualization,
} from "./excelAsShown";

const param = (name, value, title) => ({
  name,
  title,
  getExecutionValue: () => value,
});

describe("canExportAsShown", () => {
  test("pivot and table with rows can be exported", () => {
    expect(canExportAsShown({ visualizationType: "PIVOT", isQueryResultEmpty: false })).toBe(true);
    expect(canExportAsShown({ visualizationType: "TABLE", isQueryResultEmpty: false })).toBe(true);
  });

  test("an empty result cannot be exported", () => {
    expect(canExportAsShown({ visualizationType: "PIVOT", isQueryResultEmpty: true })).toBe(false);
    expect(canExportAsShown({ visualizationType: "TABLE", isQueryResultEmpty: true })).toBe(false);
  });

  test("other visualization types cannot be exported", () => {
    ["CHART", "COUNTER", "REPORT", "MAP", undefined, null].forEach((visualizationType) => {
      expect(canExportAsShown({ visualizationType, isQueryResultEmpty: false })).toBe(false);
    });
  });
});

describe("formatParameterValue", () => {
  test("plain values become text", () => {
    expect(formatParameterValue("X")).toBe("X");
    expect(formatParameterValue(42)).toBe("42");
    expect(formatParameterValue(0)).toBe("0");
  });

  test("lists are joined with commas", () => {
    expect(formatParameterValue(["A", "B"])).toBe("A, B");
  });

  test("date ranges show start to end", () => {
    expect(formatParameterValue({ start: "2026-10-01", end: "2026-10-21" })).toBe("2026-10-01 – 2026-10-21");
  });

  test("empty values give null", () => {
    expect(formatParameterValue(null)).toBeNull();
    expect(formatParameterValue(undefined)).toBeNull();
    expect(formatParameterValue("")).toBeNull();
    expect(formatParameterValue([])).toBeNull();
  });
});

describe("buildExportSubtitle", () => {
  const now = new Date(2026, 9, 21, 20, 40, 5);

  test("parameters as Name: value joined by a middle dot, then the export time", () => {
    const subtitle = buildExportSubtitle([param("po", "X", "PONumber"), param("week", ["1", "2"], "Week")], now);
    expect(subtitle).toBe("PONumber: X · Week: 1, 2 · Exported 21 Oct 2026 20:40");
  });

  test("falls back to the parameter name and skips empty values", () => {
    const subtitle = buildExportSubtitle([param("po", "X"), param("empty", null, "Empty")], now);
    expect(subtitle).toBe("po: X · Exported 21 Oct 2026 20:40");
  });

  test("no parameters gives only the export time", () => {
    expect(buildExportSubtitle([], now)).toBe("Exported 21 Oct 2026 20:40");
    expect(buildExportSubtitle(undefined, now)).toBe("Exported 21 Oct 2026 20:40");
  });

  test("ignores entries without getExecutionValue", () => {
    expect(buildExportSubtitle([{ name: "x", value: "y" }, null], now)).toBe("Exported 21 Oct 2026 20:40");
  });
});

describe("buildExportTitle", () => {
  test("query name with a custom visualization name", () => {
    expect(buildExportTitle("Shoprite Weekly", { type: "PIVOT", name: "By week" })).toBe("Shoprite Weekly – By week");
  });

  test("a default visualization name is left out", () => {
    expect(buildExportTitle("Shoprite Weekly", { type: "PIVOT", name: "Pivot Table" })).toBe("Shoprite Weekly");
    expect(buildExportTitle("Shoprite Weekly", { type: "TABLE", name: "Table" })).toBe("Shoprite Weekly");
    expect(buildExportTitle("Shoprite Weekly", { type: "TABLE", name: "  " })).toBe("Shoprite Weekly");
  });

  test("falls back to the visualization name, then to Export", () => {
    expect(buildExportTitle("", { type: "PIVOT", name: "By week" })).toBe("By week");
    expect(buildExportTitle(null, null)).toBe("Export");
  });
});

describe("sanitizeExcelFileName", () => {
  test("adds .xlsx", () => {
    expect(sanitizeExcelFileName("Shoprite Weekly Invoice Count")).toBe("Shoprite Weekly Invoice Count.xlsx");
  });

  test("replaces characters that are not allowed in file names", () => {
    expect(sanitizeExcelFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j.xlsx");
    expect(sanitizeExcelFileName("tab\there\nnew")).toBe("tab_here_new.xlsx");
  });

  test("trims spaces and dots and collapses whitespace", () => {
    expect(sanitizeExcelFileName("  .. My   report ..  ")).toBe("My report.xlsx");
  });

  test("empty names fall back to export", () => {
    expect(sanitizeExcelFileName("")).toBe("export.xlsx");
    expect(sanitizeExcelFileName(null)).toBe("export.xlsx");
    expect(sanitizeExcelFileName("///")).toBe("___.xlsx");
  });

  test("long names are cut to 150 characters before the extension", () => {
    expect(sanitizeExcelFileName("x".repeat(300))).toBe(`${"x".repeat(150)}.xlsx`);
  });
});

describe("resolveSelectedVisualization", () => {
  const visualizations = [
    { id: 7, type: "PIVOT", name: "Pivot" },
    { id: 3, type: "TABLE", name: "Table" },
  ];

  test("finds the selected tab", () => {
    expect(resolveSelectedVisualization(visualizations, 7)).toBe(visualizations[0]);
  });

  test("falls back to the lowest id, as the tabs do", () => {
    expect(resolveSelectedVisualization(visualizations, 99)).toBe(visualizations[1]);
    expect(resolveSelectedVisualization(visualizations, null)).toBe(visualizations[1]);
  });

  test("no visualizations means the default table", () => {
    expect(resolveSelectedVisualization([], null)).toEqual({ type: "TABLE", name: "Table", id: null, options: {} });
    expect(resolveSelectedVisualization(undefined, 1)).toEqual({ type: "TABLE", name: "Table", id: null, options: {} });
  });
});
