import { filter, sortBy, get } from "lodash";
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import Input from "antd/lib/input";
import axios from "axios";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

import { RendererPropTypes } from "@/visualizations/prop-types";
import ColumnTypes from "../shared/columns";
// Feature #212 — Excel export from the Table viz toolbar. Uses the SheetJS
// (xlsx) Community utility added in the foundation feature so we get column
// typing, number/date formats, and a frozen header row in the exported file.
import { downloadExcel } from "@/lib/excel-export";
import {
  evaluateRules,
  extractColumnNumbers,
  toAgCellStyle,
} from "../shared/conditionalFormatting";

import "./renderer.less";

/**
 * AG Grid Community-backed Renderer for the Table viz.
 *
 * Features:
 *   - Maps Redash column metadata to AG Grid colDefs.
 *   - Cell rendering delegates to the existing shared ColumnTypes
 *     (number/datetime/boolean/link/image/json/text formatters) so existing
 *     options (numberFormat / dateTimeFormat / allowHTML / etc.) keep working.
 *   - Native sortable headers, sticky headers (AG Grid default),
 *     frozen columns via column.pinned ("left" / "right" / "none").
 *   - Pagination using existing `itemsPerPage` option.
 *   - Quick filter search using existing `allowSearch` column flag.
 *   - Optional detail-row expansion via the `detailQuery` option
 *     (fetches a child query parameterised by the row's key column,
 *     renders an inline panel via AG Grid Community's full-width row).
 */

const KEY_COLUMN_PARAM = "row_key";

// ---------------------------------------------------------------------------
// Mobile breakpoint (feature #191)
// ---------------------------------------------------------------------------
// Below this container width, the Table viz stacks each row into a card so
// columns aren't sliced off behind a horizontal scrollbar. Matches the
// @jrny-breakpoint-mobile token defined in jrny-theme.less — kept in sync
// here because this component doesn't import LESS variables at runtime.
const MOBILE_BREAKPOINT = 480;

// Custom hook: report whether the given element is narrower than `threshold`.
// Uses ResizeObserver so the card view kicks in when the surrounding widget
// is resized (dashboard edit mode, browser zoom, device rotation) without a
// full re-mount.
function useIsNarrow(threshold: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const evaluate = (width: number) => {
      const next = width > 0 && width < threshold;
      // Functional setter avoids a stale-closure re-render loop when the
      // observer fires repeatedly with the same width.
      setIsNarrow(prev => (prev === next ? prev : next));
    };

    // Seed with the current width so card view applies on first paint when
    // the widget was already narrow at mount time.
    evaluate(node.getBoundingClientRect().width);

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        evaluate(entry.contentRect.width);
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [threshold]);

  return [ref, isNarrow] as const;
}

// Card view for mobile: each row becomes a vertical stack of (label, value)
// pairs so all columns stay readable on a phone-width viewport. Hidden columns
// and the expand chevron from feature #210 are skipped. Cells delegate to the
// shared ColumnTypes renderer so number / datetime / link formatting matches
// the desktop grid exactly.
function MobileCardView({
  options,
  data,
  searchTerm,
  itemsPerPage,
}: {
  options: any;
  data: any;
  searchTerm: string;
  itemsPerPage: number;
}) {
  const visibleColumns = useMemo(
    () => sortBy(filter(options.columns || [], (c: any) => c.visible !== false), "order"),
    [options.columns]
  );

  // Pre-build cell renderer components per column so we don't re-init on
  // every row. ColumnTypes[displayAs] returns a factory; calling it with the
  // column produces the actual React component.
  const cellComponents = useMemo(
    () =>
      visibleColumns.map((column: any) => {
        const init = (ColumnTypes as any)[column.displayAs] || (ColumnTypes as any).string;
        return { column, Component: init(column) };
      }),
    [visibleColumns]
  );

  // Simple text-based quick filter — matches AG Grid's quickFilterText
  // behaviour: any visible column with allowSearch === true contributes.
  const searchableNames = useMemo(
    () => filter(options.columns || [], (c: any) => c.allowSearch).map((c: any) => c.name),
    [options.columns]
  );

  const filteredRows = useMemo(() => {
    const allRows = data.rows || [];
    const trimmed = (searchTerm || "").trim().toLowerCase();
    if (!trimmed || searchableNames.length === 0) return allRows;
    return allRows.filter((row: any) =>
      searchableNames.some((name: string) => {
        const v = row[name];
        return v != null && String(v).toLowerCase().includes(trimmed);
      })
    );
  }, [data.rows, searchTerm, searchableNames]);

  // Single-shot pagination: phones rarely benefit from page jumps, so we
  // expose a simple "Load more" button instead of a numeric paginator.
  const [shown, setShown] = useState(itemsPerPage);
  useEffect(() => {
    setShown(itemsPerPage);
  }, [itemsPerPage, filteredRows.length, searchTerm]);

  const visibleRows = filteredRows.slice(0, shown);

  if (filteredRows.length === 0) {
    return <div className="jrnybi-table-card-empty">No matching rows.</div>;
  }

  return (
    <div className="jrnybi-table-card-list" data-test="TableVisualizationCardList">
      {visibleRows.map((row: any, idx: number) => (
        <div className="jrnybi-table-card" key={idx} data-test="TableVisualizationCard">
          {cellComponents.map(({ column, Component }) => (
            <div className="jrnybi-table-card-row" key={column.name}>
              <div className="jrnybi-table-card-label">{column.title || column.name}</div>
              <div className={`jrnybi-table-card-value display-as-${column.displayAs || "string"}`}>
                <Component row={row} />
              </div>
            </div>
          ))}
        </div>
      ))}
      {shown < filteredRows.length && (
        <button
          type="button"
          className="jrnybi-table-card-more"
          onClick={() => setShown(s => s + itemsPerPage)}>
          Show more ({filteredRows.length - shown} remaining)
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCellRenderer(column: any) {
  const initColumn = (ColumnTypes as any)[column.displayAs] || (ColumnTypes as any).string;
  const Component = initColumn(column);
  // Feature #207 — surface an optional icon from the first matching
  // conditional-formatting rule. Icons are arbitrary strings (emoji or
  // glyphs) the user types into the editor — we just render them inline.
  return function ColumnCellRenderer(params: any) {
    if (!params || !params.data || params.data.__detailRow) {
      return null;
    }
    const icon = params.__condFmtIcon;
    const cell = <Component row={params.data} />;
    if (icon) {
      return (
        <span className="jrnybi-cell-with-icon">
          <span className="jrnybi-cell-icon" aria-hidden="true">
            {icon}
          </span>
          {cell}
        </span>
      );
    }
    return cell;
  };
}

function makeValueGetter(column: any) {
  return function valueGetter(params: any) {
    if (!params.data || params.data.__detailRow) return null;
    return params.data[column.name];
  };
}

function makeQuickFilterText(column: any) {
  const initColumn = (ColumnTypes as any)[column.displayAs] || (ColumnTypes as any).string;
  const Component = initColumn(column);
  const prepareData = Component.prepareData;
  return function getQuickFilterText(params: any) {
    if (!params.data) return "";
    const data = prepareData ? prepareData(params.data) : { text: params.data[column.name] };
    return String(get(data, "text", ""));
  };
}

function normalisePinned(value: any) {
  if (value === "left" || value === "right") return value;
  return null;
}

function buildColumnDefs(
  columns: any[],
  detailQuery: any,
  expandedKey: string | null,
  onToggleExpand: (row: any) => void,
  getRowKey: (row: any) => string,
  rows: any[]
): any[] {
  const visible = sortBy(filter(columns, c => c.visible !== false), "order");
  // Pre-extract numeric values per column once — color-scale and top/bottom
  // rules need the whole column to compute anchors / cutoff. Keyed by
  // column.name so each cellStyle lookup is O(rule-count).
  const columnNumericValues: Record<string, number[]> = {};
  visible.forEach((column: any) => {
    if (column.conditionalFormatting && column.conditionalFormatting.length > 0) {
      columnNumericValues[column.name] = extractColumnNumbers(rows || [], column.name);
    }
  });

  const colDefs: any[] = [];

  // Optional expand chevron column for detail panels (feature #210)
  if (detailQuery && detailQuery.queryId) {
    colDefs.push({
      headerName: "",
      field: "__expand",
      colId: "__expand",
      width: 40,
      maxWidth: 40,
      minWidth: 40,
      pinned: "left",
      sortable: false,
      filter: false,
      resizable: false,
      suppressMenu: true,
      suppressMovable: true,
      headerClass: "ag-jrnybi-expand-header",
      cellClass: "ag-jrnybi-expand-cell",
      cellRenderer: function ExpandCellRenderer(params: any) {
        if (!params.data || params.data.__detailRow) return null;
        const key = getRowKey(params.data);
        const isExpanded = key === expandedKey;
        return (
          <button
            type="button"
            className={`jrnybi-table-expand-btn ${isExpanded ? "is-expanded" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(params.data);
            }}
            aria-label={isExpanded ? "Collapse row" : "Expand row"}>
            <span className="jrnybi-table-expand-chevron">{isExpanded ? "▾" : "▸"}</span>
          </button>
        );
      },
    });
  }

  visible.forEach(column => {
    // Feature #208 — data-bar columns need column-wide min/max to size the
    // bar. Compute once from the current rowset and stash on a shallow
    // column copy so the column module can read them per row.
    let effectiveColumn = column;
    if (column.displayAs === "data-bar") {
      const nums = extractColumnNumbers(rows || [], column.name);
      const dataMin = nums.length === 0 ? 0 : Math.min(...nums);
      const dataMax = nums.length === 0 ? 0 : Math.max(...nums);
      effectiveColumn = { ...column, __dataMin: dataMin, __dataMax: dataMax };
    }

    const colDef: any = {
      colId: column.name,
      field: column.name,
      headerName: column.title || column.name,
      headerTooltip: column.description || column.title || column.name,
      sortable: true,
      resizable: true,
      filter: false,
      suppressMenu: true,
      pinned: normalisePinned(column.pinned), // feature #209
      valueGetter: makeValueGetter(column),
      cellRenderer: makeCellRenderer(effectiveColumn),
      getQuickFilterText: makeQuickFilterText(column),
      cellClass: () => {
        const classes = [`display-as-${column.displayAs || "string"}`];
        if (column.alignContent === "right") classes.push("jrnybi-cell-align-right");
        else if (column.alignContent === "center") classes.push("jrnybi-cell-align-center");
        return classes;
      },
      headerClass: () => {
        const classes: string[] = [];
        if (column.alignContent === "right") classes.push("jrnybi-header-align-right");
        else if (column.alignContent === "center") classes.push("jrnybi-header-align-center");
        return classes;
      },
    };

    // Feature #207 — wire conditional formatting via AG Grid's cellStyle.
    // Evaluation runs per-cell against the pre-extracted column number list.
    // Returns undefined when no rule matched so AG Grid leaves the cell
    // styled by the theme.
    const rules = column.conditionalFormatting;
    if (rules && rules.length > 0) {
      const seriesValues = columnNumericValues[column.name] || [];
      colDef.cellStyle = (params: any) => {
        if (!params || !params.data || params.data.__detailRow) return undefined;
        const v = params.data[column.name];
        const style = evaluateRules(v, seriesValues, rules);
        const css = toAgCellStyle(style);
        return Object.keys(css).length > 0 ? css : undefined;
      };

      // Wrap cellRenderer to inject the rule's icon (if any). We compute the
      // style again here to extract the icon — pure functions and small
      // rule lists, so the perf cost is negligible.
      const baseRenderer = colDef.cellRenderer;
      colDef.cellRenderer = (params: any) => {
        if (!params || !params.data || params.data.__detailRow) return baseRenderer(params);
        const style = evaluateRules(params.data[column.name], seriesValues, rules);
        return baseRenderer({ ...params, __condFmtIcon: style.icon });
      };
    }
    colDefs.push(colDef);
  });

  return colDefs;
}

// ---------------------------------------------------------------------------
// Detail row renderer (full-width row that hosts the detail panel) — feature #210
// ---------------------------------------------------------------------------

function DetailPanel({ parentRow, detailQuery, cache }: any) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; rows: any[] | null }>(
    () => {
      const cached = cache.get(parentRow.__detailKey);
      if (cached) return cached;
      return { loading: true, error: null, rows: null };
    }
  );

  useEffect(() => {
    if (!parentRow.__detailKey) return;
    const cached = cache.get(parentRow.__detailKey);
    if (cached && cached.rows) {
      setState(cached);
      return;
    }
    let cancelled = false;
    const params: any = {};
    params[`p_${KEY_COLUMN_PARAM}`] = parentRow.__keyValue;
    const queryId = detailQuery.queryId;
    axios
      .post(`api/queries/${queryId}/results`, { parameters: params, max_age: 60 * 60 })
      .then(({ data }: any) => {
        if (cancelled) return;
        const rows = get(data, ["query_result", "data", "rows"], []) || [];
        const next = { loading: false, error: null, rows };
        cache.set(parentRow.__detailKey, next);
        setState(next);
      })
      .catch((err: any) => {
        if (cancelled) return;
        const next = { loading: false, error: err?.message || "Failed to load detail", rows: null };
        setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [parentRow.__detailKey, parentRow.__keyValue, detailQuery.queryId, cache]);

  if (state.loading) {
    return <div className="jrnybi-detail-panel jrnybi-detail-panel-loading">Loading detail…</div>;
  }
  if (state.error) {
    return <div className="jrnybi-detail-panel jrnybi-detail-panel-error">Error: {state.error}</div>;
  }
  const rows = state.rows || [];
  if (rows.length === 0) {
    return <div className="jrnybi-detail-panel">No related rows.</div>;
  }
  const columnNames = Object.keys(rows[0]);
  return (
    <div className="jrnybi-detail-panel" data-test="TableDetailPanel">
      <table className="jrnybi-detail-table">
        <thead>
          <tr>
            {columnNames.map(c => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any, idx: number) => (
            <tr key={idx}>
              {columnNames.map(c => (
                <td key={c}>{row[c] == null ? "" : String(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Renderer
// ---------------------------------------------------------------------------

export default function Renderer({ options, data }: any) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const gridRef = useRef<any>(null);
  // Session-scoped detail-row cache (Map kept in a ref to survive re-renders).
  const detailCacheRef = useRef<{ get: (k: string) => any; set: (k: string, v: any) => void }>({
    get: () => undefined,
    set: () => undefined,
  });
  if (!(detailCacheRef.current as any).__init) {
    const store = new Map<string, any>();
    detailCacheRef.current = {
      get: (k: string) => store.get(k),
      set: (k: string, v: any) => {
        store.set(k, v);
      },
    };
    (detailCacheRef.current as any).__init = true;
  }

  const detailQuery = options.detailQuery && options.detailQuery.queryId ? options.detailQuery : null;

  const searchColumns = useMemo(
    () => filter(options.columns, (c: any) => c.allowSearch),
    [options.columns]
  );

  const getRowKey = useCallback(
    (row: any) => {
      if (!row) return "";
      if (detailQuery && detailQuery.keyColumn) {
        return String(row[detailQuery.keyColumn]);
      }
      return String(row.__rowIndex);
    },
    [detailQuery]
  );

  const handleToggleExpand = useCallback(
    (row: any) => {
      const key = getRowKey(row);
      setExpandedKey(prev => (prev === key ? null : key));
    },
    [getRowKey]
  );

  // Inject row index for stable identity + expand the row data with detail rows.
  const rowData = useMemo(() => {
    const baseRows = (data.rows || []).map((row: any, idx: number) => ({
      ...row,
      __rowIndex: idx,
    }));
    if (!detailQuery || expandedKey == null) {
      return baseRows;
    }
    const out: any[] = [];
    baseRows.forEach((row: any) => {
      out.push(row);
      if (getRowKey(row) === expandedKey) {
        out.push({
          __detailRow: true,
          __detailKey: expandedKey,
          __keyValue: detailQuery.keyColumn ? row[detailQuery.keyColumn] : row.__rowIndex,
          __parentIndex: row.__rowIndex,
        });
      }
    });
    return out;
  }, [data.rows, detailQuery, expandedKey, getRowKey]);

  const columnDefs = useMemo(
    () =>
      buildColumnDefs(
        options.columns || [],
        detailQuery,
        expandedKey,
        handleToggleExpand,
        getRowKey,
        data?.rows || []
      ),
    [options.columns, detailQuery, expandedKey, handleToggleExpand, getRowKey, data?.rows]
  );

  const isFullWidthRow = useCallback((params: any) => !!params.rowNode.data?.__detailRow, []);

  // Feature #213 — cross-filter on row click.
  //
  // When a host (dashboard) provides options.onCrossFilter and the table has
  // at least one column marked `crossFilter: true` (or options.crossFilter
  // is enabled with an explicit dimension), clicking a cell dispatches that
  // cell's row value as a cross-filter. We dispatch on cellClicked rather
  // than rowClicked because the dimension is column-specific — the user
  // signals "filter the rest of the dashboard by THIS column's value" by
  // clicking on that column's cell.
  //
  // Falls back to dispatching on every clicked cell when options.crossFilter
  // declares a single dimension (so users can mark just one "key" column and
  // any click anywhere on the row triggers a filter on that key).
  const handleCellClicked = useCallback(
    (params: any) => {
      if (!params || !params.data || params.data.__detailRow) return;

      // Feature #214 — drill-down takes precedence over cross-filter when
      // both are wired on the same table. Drill-down navigates away, so
      // running the cross-filter dispatch as well would pollute the parent
      // dashboard's bus.
      if (
        typeof options.onDrillDown === "function" &&
        options.drillDown &&
        options.drillDown.target &&
        options.drillDown.enabled !== false
      ) {
        try {
          options.onDrillDown(params.data, {
            clickedColumn: params.column ? params.column.getColId() : null,
          });
          return;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Table drill-down dispatch failed:", err);
        }
      }

      if (typeof options.onCrossFilter !== "function") return;
      if (options.crossFilter === false) return;
      if (options.crossFilter && options.crossFilter.enabled === false) return;
      try {
        const clickedColumn = params.column ? params.column.getColId() : null;
        // Determine which dimension to dispatch:
        // 1. If options.crossFilter.dimension is explicit, always use that
        //    and pull the value from row[dimension].
        // 2. Else if the clicked column is marked `crossFilter: true` in its
        //    column config, use that column.
        // 3. Else if exactly one column is marked, use that as the dimension
        //    regardless of which cell was clicked.
        let dimension: string | null = null;
        if (options.crossFilter && options.crossFilter.dimension) {
          dimension = options.crossFilter.dimension;
        } else {
          const cols = options.columns || [];
          const flagged = cols.filter((c: any) => c && c.crossFilter);
          if (flagged.length === 1) {
            dimension = flagged[0].name;
          } else if (clickedColumn && flagged.some((c: any) => c.name === clickedColumn)) {
            dimension = clickedColumn;
          }
        }
        if (!dimension) return;
        const value = params.data[dimension];
        if (value === undefined) return;
        options.onCrossFilter(dimension, value, { label: String(value) });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Table cross-filter dispatch failed:", err);
      }
    },
    [options]
  );

  const fullWidthCellRenderer = useCallback(
    (params: any) => {
      if (!detailQuery) return null;
      return (
        <DetailPanel
          parentRow={params.data}
          detailQuery={detailQuery}
          cache={detailCacheRef.current}
        />
      );
    },
    [detailQuery]
  );

  const getRowHeight = useCallback((params: any) => {
    if (params.data && params.data.__detailRow) return 220;
    return undefined;
  }, []);

  // Reset expanded row when data or detail config changes.
  useEffect(() => {
    setExpandedKey(null);
  }, [data.rows, options.detailQuery && options.detailQuery.queryId]);

  // -------------------------------------------------------------------------
  // Feature #211 — Server-side virtualised scrolling.
  // -------------------------------------------------------------------------
  // When enabled AND options.queryResultId is set by the host (the JRNYBI
  // VisualizationRenderer plumbs it through), the grid switches to AG Grid's
  // `infinite` row model. Rows are streamed in block-by-block from
  // POST /api/query_results/<id>/page so the browser only ever holds the
  // visible window in memory.
  //
  // Recommended threshold: turn this on when the query routinely returns
  // 100,000+ rows. Below that, the default client-side path is faster (no
  // per-block network round-trip) and supports global sort/filter on the
  // entire dataset without any server cooperation.
  const serverSideQueryResultId =
    options.enableServerSideVirtualization && options.queryResultId
      ? options.queryResultId
      : null;
  const serverSidePageSize = options.serverSidePageSize || 200;

  // Build a datasource for AG Grid's infinite row model. The grid invokes
  // `getRows({ startRow, endRow, sortModel, filterModel, successCallback,
  // failCallback })`. We translate that to the paged endpoint and feed rows
  // back asynchronously.
  const serverSideDatasource = useMemo(() => {
    if (!serverSideQueryResultId) return null;
    return {
      getRows: (params: any) => {
        const startRow = Number(params.startRow) || 0;
        const endRow = Number(params.endRow) || startRow + serverSidePageSize;
        const sortModel = Array.isArray(params.sortModel) ? params.sortModel : [];
        const sort = sortModel.length > 0 ? sortModel[0] : null;
        const body: any = {
          offset: startRow,
          limit: endRow - startRow,
        };
        if (sort && sort.colId) {
          body.sort_by = sort.colId;
          body.sort_dir = sort.sort === "desc" ? "desc" : "asc";
        }
        if (searchTerm) body.filter = searchTerm;
        axios
          .post(`api/query_results/${serverSideQueryResultId}/page`, body)
          .then(({ data: payload }: any) => {
            const rows = payload && payload.rows ? payload.rows : [];
            const total =
              payload && typeof payload.total_rows === "number" ? payload.total_rows : null;
            // AG Grid expects `lastRow` set when the dataset's end is reached.
            // We always know `total_rows` from the response, so emit it when
            // the slice runs to or past the end.
            const lastRow =
              total != null && (startRow + rows.length >= total || rows.length < (endRow - startRow))
                ? total
                : -1;
            params.successCallback(rows, lastRow);
          })
          .catch((err: any) => {
            // eslint-disable-next-line no-console
            console.error("Server-side page fetch failed:", err);
            params.failCallback();
          });
      },
    };
  }, [serverSideQueryResultId, serverSidePageSize, searchTerm]);

  if (!data || !data.rows || data.rows.length === 0) {
    if (!serverSideQueryResultId) {
      return null;
    }
  }

  const showSearch = searchColumns.length > 0;
  const itemsPerPage = options.itemsPerPage || 25;

  // Mobile card-view detection (feature #191). Watches the outer container so
  // the layout adapts when the surrounding widget is resized — dashboard edit
  // mode, browser narrowing, or phone rotation.
  const [containerRef, isNarrow] = useIsNarrow(MOBILE_BREAKPOINT);

  // -------------------------------------------------------------------------
  // Feature #212 — "Export to Excel" toolbar action.
  // -------------------------------------------------------------------------
  // Delegates to the SheetJS-backed downloadExcel utility from the foundation
  // layer. Passes the full column metadata so each column's displayAs +
  // numberFormat + dateTimeFormat drives the exported cell type and format,
  // and so the visibility/order picked in the Columns editor is honoured.
  //
  // For server-side virtualised tables (feature #211) we only export the
  // currently-loaded blocks — exporting 500k rows client-side would freeze
  // the browser. A "full export" can still be triggered via the existing
  // backend /results.xlsx endpoint in the query-page dropdown.
  const handleExportExcel = useCallback(() => {
    const exportColumns = (options.columns || []).map((c: any) => ({
      name: c.name,
      title: c.title || c.name,
      displayAs: c.displayAs,
      visible: c.visible,
      order: c.order,
      numberFormat: c.numberFormat,
      dateTimeFormat: c.dateTimeFormat,
      description: c.description,
    }));
    const baseRows = (data && data.rows) || [];
    const filename = (options.exportFilenameStem || "table-export").toString();
    try {
      downloadExcel(exportColumns, baseRows, filename, {
        sheetName: options.exportSheetName || "Table",
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Excel export failed:", err);
    }
  }, [options.columns, data, options.exportFilenameStem, options.exportSheetName]);

  const showExcelExport =
    options.showExcelExport !== false &&
    Array.isArray(data && data.rows) &&
    (data.rows || []).length > 0 &&
    !serverSideQueryResultId; // hidden in infinite-scroll mode (see comment above)

  return (
    <div
      ref={containerRef}
      className={`table-visualization-container ag-jrnybi-table-container${isNarrow ? " jrnybi-table-mobile" : ""}`}
      data-test="TableVisualization">
      {(showSearch || showExcelExport) && (
        <div className="ag-jrnybi-table-toolbar">
          {showSearch && (
            <Input.Search
              allowClear
              placeholder={`Search ${searchColumns.map((c: any) => c.title).join(", ")}…`}
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value)}
            />
          )}
          {showExcelExport && (
            <button
              type="button"
              className="jrnybi-table-export-excel"
              data-test="TableExportExcel"
              onClick={handleExportExcel}
              title="Export this table to a formatted Excel (.xlsx) file"
              aria-label="Export to Excel">
              <span className="jrnybi-table-export-excel-icon" aria-hidden>
                {/* Inline file-spreadsheet glyph so we don't pull a new icon dep. */}
                ⤓
              </span>
              <span>Excel</span>
            </button>
          )}
        </div>
      )}
      {isNarrow ? (
        <MobileCardView
          options={options}
          data={data}
          searchTerm={searchTerm}
          itemsPerPage={itemsPerPage}
        />
      ) : serverSideQueryResultId ? (
        // Feature #211 — server-side virtualisation path. AG Grid manages a
        // viewport of `cacheBlockSize` rows and calls our datasource as the
        // user scrolls. We use a fixed-height container so virtualisation
        // actually triggers (autoHeight defeats the purpose of paging).
        <div
          className="ag-theme-alpine ag-jrnybi-theme ag-jrnybi-theme-serverside"
          data-test="TableServerSide"
          style={{ width: "100%", height: 480 }}>
          <AgGridReact
            ref={gridRef}
            columnDefs={columnDefs}
            rowModelType="infinite"
            datasource={serverSideDatasource as any}
            cacheBlockSize={serverSidePageSize}
            maxBlocksInCache={10}
            infiniteInitialRowCount={Math.min(serverSidePageSize * 2, 1000)}
            suppressDragLeaveHidesColumns
            headerHeight={36}
            rowHeight={32}
            animateRows={false}
            onCellClicked={handleCellClicked}
          />
        </div>
      ) : (
      <div className="ag-theme-alpine ag-jrnybi-theme" style={{ width: "100%", height: "100%", minHeight: 240 }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          pagination
          paginationPageSize={itemsPerPage}
          suppressPaginationPanel={rowData.length <= itemsPerPage && !detailQuery}
          quickFilterText={searchTerm}
          isFullWidthRow={isFullWidthRow}
          fullWidthCellRenderer={detailQuery ? fullWidthCellRenderer : undefined}
          getRowHeight={getRowHeight}
          suppressDragLeaveHidesColumns
          domLayout="autoHeight"
          headerHeight={36}
          rowHeight={32}
          animateRows={false}
          onCellClicked={handleCellClicked}
        />
      </div>
      )}
    </div>
  );
}

Renderer.propTypes = RendererPropTypes;
