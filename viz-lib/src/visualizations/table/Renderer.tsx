import { filter, sortBy, get } from "lodash";
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import Input from "antd/lib/input";
import axios from "axios";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

import { RendererPropTypes } from "@/visualizations/prop-types";
import ColumnTypes from "../shared/columns";

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
// Helpers
// ---------------------------------------------------------------------------

function makeCellRenderer(column: any) {
  const initColumn = (ColumnTypes as any)[column.displayAs] || (ColumnTypes as any).string;
  const Component = initColumn(column);
  return function ColumnCellRenderer(params: any) {
    if (!params || !params.data || params.data.__detailRow) {
      return null;
    }
    return <Component row={params.data} />;
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
  getRowKey: (row: any) => string
): any[] {
  const visible = sortBy(filter(columns, c => c.visible !== false), "order");

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
      cellRenderer: makeCellRenderer(column),
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
    () => buildColumnDefs(options.columns || [], detailQuery, expandedKey, handleToggleExpand, getRowKey),
    [options.columns, detailQuery, expandedKey, handleToggleExpand, getRowKey]
  );

  const isFullWidthRow = useCallback((params: any) => !!params.rowNode.data?.__detailRow, []);

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

  if (!data || !data.rows || data.rows.length === 0) {
    return null;
  }

  const showSearch = searchColumns.length > 0;
  const itemsPerPage = options.itemsPerPage || 25;

  return (
    <div className="table-visualization-container ag-jrnybi-table-container" data-test="TableVisualization">
      {showSearch && (
        <div className="ag-jrnybi-table-toolbar">
          <Input.Search
            allowClear
            placeholder={`Search ${searchColumns.map((c: any) => c.title).join(", ")}…`}
            value={searchTerm}
            onChange={(e: any) => setSearchTerm(e.target.value)}
          />
        </div>
      )}
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
        />
      </div>
    </div>
  );
}

Renderer.propTypes = RendererPropTypes;
