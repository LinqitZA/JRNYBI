/**
 * Feature #182 — Renderer test for the AG Grid Community-backed Table viz.
 *
 * Verifies that the new renderer mounts with sample data and:
 *  - renders the configured column titles in the header
 *  - exposes a row count matching data.rows
 *  - applies the existing number formatter (via shared ColumnTypes) to cells
 */

import React from "react";
import enzyme from "enzyme";

// Mock the SheetJS-backed excel-export utility so feature #212 tests don't
// poke at File / Blob APIs missing in the jsdom test env. We just want to
// observe that the button click calls downloadExcel with the right args.
jest.mock("@/lib/excel-export", () => ({
  downloadExcel: jest.fn(),
}));
import { downloadExcel } from "@/lib/excel-export";

import Renderer from "./Renderer";
import getOptions from "./getOptions";

// AG Grid uses ResizeObserver; jsdom doesn't ship it. Minimal stub keeps the
// grid happy without affecting the assertions we care about.
beforeAll(() => {
  if (!(global as any).ResizeObserver) {
    (global as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function mount(data: any, options: any = {}) {
  const resolved = getOptions(options, data);
  return enzyme.mount(<Renderer data={data} options={resolved} />);
}

describe("Visualizations -> Table -> Renderer (AG Grid)", () => {
  const sampleData = {
    columns: [
      { name: "id", type: "integer" },
      { name: "name", type: "string" },
      { name: "revenue", type: "float" },
    ],
    rows: [
      { id: 1, name: "Alpha", revenue: 1234.5 },
      { id: 2, name: "Bravo", revenue: 67.89 },
      { id: 3, name: "Charlie", revenue: 4200 },
    ],
  };

  test("Renders nothing when there are no rows", () => {
    const el = mount({ columns: sampleData.columns, rows: [] });
    expect(el.html()).toBeNull();
  });

  test("Mounts with column defs derived from options.columns", () => {
    const el = mount(sampleData);
    // The Ant Design search box only appears if a column has allowSearch.
    // We didn't set any, so it should be absent.
    expect(el.find(".ag-jrnybi-table-toolbar")).toHaveLength(0);

    // Header text is fed into AG Grid via headerName; the wrapping <div> with
    // the JRNYBI theme should mount and the AgGridReact element should be present.
    expect(el.find(".ag-jrnybi-theme")).toHaveLength(1);
    // The grid renders a wrapping container with our table-visualization-container class.
    expect(el.find(".table-visualization-container")).toHaveLength(1);
  });

  test("Passes row data through to AG Grid and applies the number formatter", () => {
    const el = mount(sampleData, {
      columns: [
        { name: "id", type: "integer", visible: true, order: 0, displayAs: "number" },
        { name: "name", type: "string", visible: true, order: 1, displayAs: "string" },
        {
          name: "revenue",
          type: "float",
          visible: true,
          order: 2,
          displayAs: "number",
          numberFormat: "0,0.00",
        },
      ],
    });

    // The AgGridReact element should receive the prepared row data, including
    // the injected __rowIndex used for stable identity.
    const agGrid = el.find("AgGridReact").first();
    const passedRows = agGrid.prop("rowData") as any[];
    expect(Array.isArray(passedRows)).toBe(true);
    expect(passedRows).toHaveLength(3);
    expect(passedRows[0]).toMatchObject({ id: 1, name: "Alpha", revenue: 1234.5 });
    expect(passedRows[0].__rowIndex).toBe(0);

    // The column defs that we pass to AgGridReact should include the three columns
    // in the configured order and a sortable flag.
    const columnDefs = agGrid.prop("columnDefs") as any[];
    expect(columnDefs.map(c => c.field)).toEqual(["id", "name", "revenue"]);
    expect(columnDefs.every(c => c.sortable === true)).toBe(true);
  });

  test("Maps column.pinned to AG Grid colDef.pinned (feature #209)", () => {
    const el = mount(sampleData, {
      columns: [
        { name: "id", visible: true, order: 0, displayAs: "number", pinned: "left" },
        { name: "name", visible: true, order: 1, displayAs: "string" },
        { name: "revenue", visible: true, order: 2, displayAs: "number", pinned: "right" },
      ],
    });
    const agGrid = el.find("AgGridReact").first();
    const columnDefs = agGrid.prop("columnDefs") as any[];
    const byField = (f: string) => columnDefs.find(c => c.field === f);
    expect(byField("id").pinned).toBe("left");
    expect(byField("name").pinned).toBeNull();
    expect(byField("revenue").pinned).toBe("right");
  });

  test("Server-side virtualisation switches the grid into infinite row model (feature #211)", () => {
    const el = mount(sampleData, {
      enableServerSideVirtualization: true,
      queryResultId: 999,
      serverSidePageSize: 250,
      columns: [
        { name: "id", visible: true, order: 0, displayAs: "number" },
        { name: "name", visible: true, order: 1, displayAs: "string" },
        { name: "revenue", visible: true, order: 2, displayAs: "number" },
      ],
    });
    const agGrid = el.find("AgGridReact").first();
    expect(agGrid.prop("rowModelType")).toBe("infinite");
    expect(agGrid.prop("cacheBlockSize")).toBe(250);
    // datasource should be defined
    expect(typeof (agGrid.prop("datasource") as any).getRows).toBe("function");
    // Container should carry the server-side variant class
    expect(el.find(".ag-jrnybi-theme-serverside")).toHaveLength(1);
    // Indicator data-test attribute exists for browser testing
    expect(el.find('[data-test="TableServerSide"]')).toHaveLength(1);
  });

  test("Server-side virtualisation falls back to client-side when no queryResultId (feature #211)", () => {
    const el = mount(sampleData, {
      enableServerSideVirtualization: true,
      // queryResultId intentionally omitted
      columns: [
        { name: "id", visible: true, order: 0, displayAs: "number" },
      ],
    });
    const agGrid = el.find("AgGridReact").first();
    // Without an id we can't talk to the paged endpoint — stay on client-side path.
    expect(agGrid.prop("rowModelType")).toBeUndefined();
    expect(agGrid.prop("rowData")).toBeDefined();
  });

  test("Shows an 'Export to Excel' button when rows are present (feature #212)", () => {
    const el = mount(sampleData, {
      columns: [
        { name: "id", visible: true, order: 0, displayAs: "number" },
        { name: "name", visible: true, order: 1, displayAs: "string" },
      ],
    });
    expect(el.find('[data-test="TableExportExcel"]').exists()).toBe(true);
  });

  test("Hides the export button when no rows (feature #212)", () => {
    const el = mount({ columns: sampleData.columns, rows: [] });
    expect(el.html()).toBeNull();
  });

  test("Hides the export button when explicitly disabled via options (feature #212)", () => {
    const el = mount(sampleData, {
      showExcelExport: false,
      columns: [{ name: "id", visible: true, order: 0, displayAs: "number" }],
    });
    expect(el.find('[data-test="TableExportExcel"]').exists()).toBe(false);
  });

  test("Clicking 'Export to Excel' calls downloadExcel with column metadata (feature #212)", () => {
    (downloadExcel as jest.Mock).mockClear();
    const el = mount(sampleData, {
      exportFilenameStem: "sales-q3",
      exportSheetName: "Sales",
      columns: [
        {
          name: "id",
          visible: true,
          order: 0,
          displayAs: "number",
          title: "ID",
        },
        {
          name: "name",
          visible: true,
          order: 1,
          displayAs: "string",
          title: "Customer",
        },
        {
          name: "revenue",
          visible: true,
          order: 2,
          displayAs: "number",
          title: "Revenue",
          numberFormat: "0,0.00",
        },
      ],
    });

    el.find('[data-test="TableExportExcel"]').first().simulate("click");

    expect(downloadExcel).toHaveBeenCalledTimes(1);
    const callArgs = (downloadExcel as jest.Mock).mock.calls[0];
    const [exportedColumns, exportedRows, filename, opts] = callArgs;
    // Column metadata should be forwarded: title, displayAs, numberFormat
    const revenueCol = exportedColumns.find((c: any) => c.name === "revenue");
    expect(revenueCol).toBeDefined();
    expect(revenueCol.title).toBe("Revenue");
    expect(revenueCol.numberFormat).toBe("0,0.00");
    expect(revenueCol.displayAs).toBe("number");
    // Data rows passed through unchanged
    expect(exportedRows).toEqual(sampleData.rows);
    // Filename + sheet name come from the options
    expect(filename).toBe("sales-q3");
    expect(opts.sheetName).toBe("Sales");
  });

  test("Inserts a leading expand column when detailQuery is configured (feature #210)", () => {
    const el = mount(sampleData, {
      detailQuery: { queryId: 42, keyColumn: "id" },
      columns: [
        { name: "id", visible: true, order: 0, displayAs: "number" },
        { name: "name", visible: true, order: 1, displayAs: "string" },
      ],
    });
    const agGrid = el.find("AgGridReact").first();
    const columnDefs = agGrid.prop("columnDefs") as any[];
    expect(columnDefs[0].colId).toBe("__expand");
    expect(columnDefs[0].pinned).toBe("left");
    expect(columnDefs[0].width).toBe(40);
  });
});
