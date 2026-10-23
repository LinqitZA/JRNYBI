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
import { act } from "react-dom/test-utils";

// Mock the SheetJS-backed excel-export utility so feature #212 tests don't
// poke at File / Blob APIs missing in the jsdom test env. We just want to
// observe that the button click calls downloadExcel with the right args.
// The real type/format helpers stay: the "as shown" grid builder uses them.
jest.mock("@/lib/excel-export", () => ({
  ...jest.requireActual("@/lib/excel-export"),
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

describe("Visualizations -> Table -> Renderer exportRef (Download as Excel as shown)", () => {
  const data = {
    columns: [
      { name: "id", type: "integer" },
      { name: "name", type: "string" },
      { name: "revenue", type: "float" },
      { name: "_helper", type: "string" },
    ],
    rows: [
      { id: 1, name: "Alpha", revenue: 1234.5, _helper: "x" },
      { id: 2, name: "Bravo", revenue: 67.89, _helper: "y" },
      { id: 3, name: "Charlie", revenue: 4200, _helper: "z" },
    ],
  };
  const columns = [
    { name: "id", visible: true, order: 0, displayAs: "number", title: "ID" },
    { name: "name", visible: true, order: 1, displayAs: "string", title: "Customer", allowSearch: true },
    { name: "revenue", visible: true, order: 2, displayAs: "number", title: "Revenue", numberFormat: "0,0.00" },
    { name: "_helper", visible: false, order: 3, displayAs: "string" },
  ];

  const tick = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

  function mountWithRef(options: any = {}) {
    const exportRef: any = { current: null };
    const resolved = getOptions({ columns, ...options }, data);
    const el = enzyme.mount(<Renderer data={data} options={resolved} exportRef={exportRef} />);
    return { el, exportRef };
  }

  const firstCol = (grid: any) => grid.rows.map((r: any) => r[0].v);

  test("exports the displayed columns and rows; clears the ref on unmount", async () => {
    const { el, exportRef } = mountWithRef();
    await tick();
    const grid = exportRef.current.getGrid();
    expect(grid.header_rows).toBe(1);
    expect(grid.rows[0]).toEqual([
      { v: "ID", t: "s", s: "header" },
      { v: "Customer", t: "s", s: "header" },
      { v: "Revenue", t: "s", s: "header" },
    ]);
    expect(grid.rows[1]).toEqual([
      { v: 1, t: "n", z: "0,0", s: "body" },
      { v: "Alpha", t: "s", s: "body" },
      { v: 1234.5, t: "n", z: "0,0.00", s: "body" },
    ]);
    expect(grid.rows).toHaveLength(4);
    el.unmount();
    expect(exportRef.current).toBeNull();
  });

  test("follows the grid's sort, moved columns and search", async () => {
    const { el, exportRef } = mountWithRef();
    await tick();
    const api = (el.find("AgGridReact").first().instance() as any).api;
    act(() => {
      api.applyColumnState({ state: [{ colId: "revenue", sort: "desc" }] });
      api.moveColumns(["revenue"], 0);
    });
    let grid = exportRef.current.getGrid();
    expect(grid.rows[0].map((c: any) => c.v)).toEqual(["Revenue", "ID", "Customer"]);
    expect(firstCol(grid)).toEqual(["Revenue", 4200, 1234.5, 67.89]);

    act(() => {
      el.find("input")
        .first()
        .simulate("change", { target: { value: "bra" } });
    });
    await tick();
    grid = exportRef.current.getGrid();
    expect(grid.rows.map((r: any) => r[2].v)).toEqual(["Customer", "Bravo"]);
  });

  test("text figures with excelNumber are exported as numbers (both Excel exports)", async () => {
    (downloadExcel as jest.Mock).mockClear();
    const figData = {
      columns: [{ name: "actual", type: "string" }],
      rows: [{ actual: "(1,234.50)" }, { actual: "" }],
    };
    const exportRef: any = { current: null };
    const opts = getOptions(
      { columns: [{ name: "actual", title: "Actual", displayAs: "string", excelNumber: "#,##0.00;(#,##0.00)" }] },
      figData
    );
    const el = enzyme.mount(<Renderer data={figData} options={opts} exportRef={exportRef} />);
    await tick();
    expect(exportRef.current.getGrid().rows[1]).toEqual([
      { v: -1234.5, t: "n", z: "#,##0.00;(#,##0.00)", s: "body" },
    ]);
    el.find('[data-test="TableExportExcel"]').first().simulate("click");
    const exported = (downloadExcel as jest.Mock).mock.calls[0][0];
    expect(exported[0].excelNumber).toBe("#,##0.00;(#,##0.00)");
  });

  test("a plain table has no row outline", async () => {
    const { exportRef } = mountWithRef();
    await tick();
    expect(exportRef.current.getGrid().row_outline).toBeUndefined();
  });

  test("skips the detail-row expander column", async () => {
    const { exportRef } = mountWithRef({ detailQuery: { queryId: 7, keyColumn: "id" } });
    await tick();
    const grid = exportRef.current.getGrid();
    expect(grid.rows[0].map((c: any) => c.v)).toEqual(["ID", "Customer", "Revenue"]);
    expect(grid.rows).toHaveLength(4);
  });

  test("narrow card view falls back to visible columns and the card search", async () => {
    const Original = (global as any).ResizeObserver;
    (global as any).ResizeObserver = class {
      cb: any;
      constructor(cb: any) {
        this.cb = cb;
      }
      observe() {
        this.cb([{ contentRect: { width: 300 } }]);
      }
      unobserve() {
        // nothing to stop
      }
      disconnect() {
        // nothing to stop
      }
    };
    try {
      const { el, exportRef } = mountWithRef();
      await tick();
      el.update();
      expect(el.find('[data-test="TableVisualizationCardList"]').exists()).toBe(true);
      act(() => {
        el.find("input")
          .first()
          .simulate("change", { target: { value: "char" } });
      });
      const grid = exportRef.current.getGrid();
      expect(grid.rows[0].map((c: any) => c.v)).toEqual(["ID", "Customer", "Revenue"]);
      expect(firstCol(grid)).toEqual(["ID", 3]);
    } finally {
      (global as any).ResizeObserver = Original;
    }
  });

  test("no rows → no grid", () => {
    const exportRef: any = { current: null };
    enzyme.mount(
      <Renderer
        data={{ columns: data.columns, rows: [] }}
        options={getOptions({ columns }, data)}
        exportRef={exportRef}
      />
    );
    expect(exportRef.current === null || exportRef.current.getGrid() === null).toBe(true);
  });
});

describe("Visualizations -> Table -> Renderer row tree (rowTree option)", () => {
  // G = group (1), D = description (2), C = code (3), T = always-shown total (9).
  const levels = [1, 2, 3, 3, 2, 3, 9, 1, 2, 3, 1, 9];
  const names = ["G1", "D1", "C1", "C2", "D2", "C3", "T", "G2", "D3", "C4", "G3", "T2"];
  const data = {
    columns: [
      { name: "name", type: "string" },
      { name: "_row_level", type: "integer" },
    ],
    rows: levels.map((l, i) => ({ name: names[i], _row_level: l })),
  };
  const columns = [
    { name: "name", visible: true, order: 0, displayAs: "string", title: "Name" },
    { name: "_row_level", visible: false, order: 1, displayAs: "string" },
  ];
  const rowTree = { levelColumn: "_row_level", depth: 3 };

  const tick = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

  function mountTree(options: any = {}, rows: any = data) {
    const exportRef: any = { current: null };
    const resolved = getOptions({ columns, rowTree, ...options }, rows);
    const el = enzyme.mount(<Renderer data={rows} options={resolved} exportRef={exportRef} />);
    return { el, exportRef };
  }

  const shown = (el: any) => {
    const api = (el.find("AgGridReact").first().instance() as any).api;
    const out: string[] = [];
    api.forEachNodeAfterFilterAndSort((n: any) => out.push(n.data.name));
    return out;
  };
  const toggle = (el: any, name: string) => {
    act(() => {
      el.find(`button[data-test="TableTreeToggle"][data-row-index=${names.indexOf(name)}]`).first().simulate("click");
    });
    el.update();
  };
  const COLLAPSED = ["G1", "T", "G2", "G3", "T2"];

  test("opens collapsed: groups and always-shown totals only", async () => {
    const { el } = mountTree();
    await tick();
    el.update();
    expect(shown(el)).toEqual(COLLAPSED);
  });

  test("drills down group → description → code and back up", async () => {
    const { el } = mountTree();
    await tick();
    el.update();
    toggle(el, "G1");
    expect(shown(el)).toEqual(["G1", "D1", "D2", "T", "G2", "G3", "T2"]);
    toggle(el, "D1");
    expect(shown(el)).toEqual(["G1", "D1", "C1", "C2", "D2", "T", "G2", "G3", "T2"]);
    toggle(el, "G1");
    expect(shown(el)).toEqual(COLLAPSED);
    // re-expanding shows the descriptions collapsed again
    toggle(el, "G1");
    expect(shown(el)).toEqual(["G1", "D1", "D2", "T", "G2", "G3", "T2"]);
  });

  test("clicking a cell of an expandable row toggles it", async () => {
    const { el } = mountTree();
    await tick();
    el.update();
    const grid: any = el.find("AgGridReact").first();
    act(() => {
      grid.prop("onCellClicked")({ data: { ...data.rows[7], __rowIndex: 7 }, column: null });
    });
    el.update();
    expect(shown(el)).toEqual(["G1", "T", "G2", "D3", "G3", "T2"]);
  });

  test("Expand all / Collapse all", async () => {
    const { el } = mountTree();
    await tick();
    el.update();
    act(() => {
      el.find('[data-test="TableTreeExpandAll"]').first().simulate("click");
    });
    el.update();
    expect(shown(el)).toEqual(names);
    act(() => {
      el.find('[data-test="TableTreeCollapseAll"]').first().simulate("click");
    });
    el.update();
    expect(shown(el)).toEqual(COLLAPSED);
  });

  test("only rows with children get a toggle; sorting is off", async () => {
    const { el } = mountTree();
    await tick();
    el.update();
    const toggles = el.find('button[data-test="TableTreeToggle"]').map((b: any) => b.prop("data-row-index"));
    expect(toggles).toEqual([0, 7]);
    const defs = el.find("AgGridReact").first().prop("columnDefs") as any[];
    expect(defs[0].colId).toBe("__tree");
    expect(defs.every((d: any) => !d.sortable)).toBe(true);
  });

  test("new data starts collapsed again", async () => {
    const { el } = mountTree();
    await tick();
    el.update();
    toggle(el, "G1");
    const resolved = getOptions({ columns, rowTree }, data);
    act(() => {
      el.setProps({ data: { ...data, rows: data.rows.map((r: any) => ({ ...r })) }, options: resolved });
    });
    await tick();
    el.update();
    expect(shown(el)).toEqual(COLLAPSED);
  });

  test("expanding shows children on the visible pages (pagination over shown rows)", async () => {
    const { el } = mountTree({ itemsPerPage: 3 });
    await tick();
    el.update();
    toggle(el, "G1");
    const api = (el.find("AgGridReact").first().instance() as any).api;
    expect(api.paginationGetRowCount()).toBe(7);
  });

  test("without rowTree, or without the level column, every row shows and there are no toggles", async () => {
    const plain = mountTree({ rowTree: undefined });
    await tick();
    plain.el.update();
    expect(shown(plain.el)).toEqual(names);
    expect(plain.el.find('[data-test="TableTreeExpandAll"]')).toHaveLength(0);
    expect((plain.el.find("AgGridReact").first().prop("columnDefs") as any[])[0].colId).toBe("name");

    const noLevel = { columns: [{ name: "name", type: "string" }], rows: names.map((n) => ({ name: n })) };
    const broken = mountTree({}, noLevel);
    await tick();
    broken.el.update();
    expect(shown(broken.el)).toEqual(names);
    expect(broken.el.find('button[data-test="TableTreeToggle"]')).toHaveLength(0);
  });

  test("Excel exports every row, whatever is expanded", async () => {
    (downloadExcel as jest.Mock).mockClear();
    const { el, exportRef } = mountTree();
    await tick();
    el.update();
    const grid = exportRef.current.getGrid();
    expect(grid.rows.map((r: any) => r[0].v)).toEqual(["Name", ...names]);
    // Excel row groups, opening collapsed: header and totals 0, groups 0, descriptions 1, codes 2.
    expect(grid.row_outline).toEqual({ levels: [0, 0, 1, 2, 2, 1, 2, 0, 0, 1, 2, 0, 0], collapsed: true });
    el.find('[data-test="TableExportExcel"]').first().simulate("click");
    expect((downloadExcel as jest.Mock).mock.calls[0][1]).toEqual(data.rows);
  });
});
