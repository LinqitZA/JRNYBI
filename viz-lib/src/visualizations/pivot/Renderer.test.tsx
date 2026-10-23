/**
 * Pivot Renderer: exportRef for "Download as Excel (as shown)".
 */
import React from "react";
import enzyme from "enzyme";
import { act } from "react-dom/test-utils";

import Renderer from "./Renderer";

// jest.mock calls are hoisted above the imports.
// Plotly doesn't load in jsdom; the chart renderers aren't under test here.
jest.mock("@/visualizations/chart/plotly", () => ({ Plotly: {} }));
jest.mock("react-plotly.js/factory", () => () => () => null);
jest.mock("react-pivottable/PlotlyRenderers", () => () => ({ "Grouped Column Chart": () => null }));

const data = {
  columns: [
    { name: "CustomerName", type: "string" },
    { name: "YearWeek", type: "string" },
    { name: "InvoiceCount", type: "integer" },
  ],
  rows: [
    { CustomerName: "Usave", YearWeek: "2026-41", InvoiceCount: 2 },
    { CustomerName: "Checkers", YearWeek: "2026-40", InvoiceCount: 3 },
  ],
};

const options = {
  rows: ["CustomerName"],
  cols: ["YearWeek"],
  vals: ["InvoiceCount"],
  aggregatorName: "Integer Sum",
  rendererName: "Table",
  rendererOptions: { table: { rowTotals: true, colTotals: true } },
};

describe("Visualizations -> Pivot -> Renderer exportRef", () => {
  test("exposes getGrid while mounted and clears it on unmount", () => {
    const exportRef: any = { current: null };
    const el = enzyme.mount(<Renderer data={data} options={options} exportRef={exportRef} />);
    expect(typeof exportRef.current.getGrid).toBe("function");

    const grid = exportRef.current.getGrid();
    expect(grid.header_rows).toBe(2);
    expect(grid.rows.map((r: any) => r[0] && r[0].v)).toEqual([null, "CustomerName", "Checkers", "Usave", "Totals"]);
    expect(grid.rows[4][4]).toEqual({ v: 5, t: "n", z: "#,##0", s: "total" });

    el.unmount();
    expect(exportRef.current).toBeNull();
  });

  test("reads the latest config after the pivot controls change it", () => {
    const exportRef: any = { current: null };
    const el = enzyme.mount(<Renderer data={data} options={options} exportRef={exportRef} />);
    const onChange = el.find("PivotTableUI").prop("onChange") as any;
    act(() => {
      onChange({ ...options, rows: ["YearWeek"], cols: ["CustomerName"] });
    });
    const grid = exportRef.current.getGrid();
    expect(grid.rows[0][1]).toEqual({ v: "CustomerName", t: "s", s: "header" });
    expect(grid.rows[1][0]).toEqual({ v: "YearWeek", t: "s", s: "header" });
  });

  test("chart renderers give no grid", () => {
    const exportRef: any = { current: null };
    enzyme.mount(
      <Renderer data={data} options={{ ...options, rendererName: "Grouped Column Chart" }} exportRef={exportRef} />
    );
    expect(exportRef.current.getGrid()).toBeNull();
  });

  test("an unknown renderer name falls back to Table, as PivotTableUI does", () => {
    const exportRef: any = { current: null };
    enzyme.mount(<Renderer data={data} options={{ ...options, rendererName: "Nope" }} exportRef={exportRef} />);
    expect(exportRef.current.getGrid()).not.toBeNull();
  });

  test("works without an exportRef", () => {
    expect(() => enzyme.mount(<Renderer data={data} options={options} />).unmount()).not.toThrow();
  });
});
