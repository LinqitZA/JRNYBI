import { filter, map, get, reduce, isFinite as _isFinite, first, last } from "lodash";
import React, { useMemo, useState, useEffect } from "react";
import Table from "antd/lib/table";
import Input from "antd/lib/input";
import Tooltip from "antd/lib/tooltip";
import InfoCircleFilledIcon from "@ant-design/icons/InfoCircleFilled";
import Popover from "antd/lib/popover";
import { RendererPropTypes } from "@/visualizations/prop-types";

import { prepareColumns, initRows, filterRows, sortRows } from "../table/utils";
import type { MetricCard } from "./getOptions";

import "./renderer.less";

// --- Aggregation logic ---

function aggregate(rows: any[], column: string, aggregation: string): number | string | null {
  if (!rows || rows.length === 0 || !column) return null;

  const values = map(rows, (row) => row[column]);
  const numericValues = filter(
    map(values, (v) => (typeof v === "string" ? parseFloat(v) : v)),
    (v) => typeof v === "number" && _isFinite(v)
  );

  switch (aggregation) {
    case "SUM":
      return reduce(numericValues, (sum: number, v: number) => sum + v, 0);
    case "COUNT":
      return values.length;
    case "AVG":
      return numericValues.length > 0
        ? reduce(numericValues, (sum: number, v: number) => sum + v, 0) / numericValues.length
        : null;
    case "MIN":
      return numericValues.length > 0 ? Math.min(...numericValues) : null;
    case "MAX":
      return numericValues.length > 0 ? Math.max(...numericValues) : null;
    case "FIRST":
      return first(values) ?? null;
    case "LAST":
      return last(values) ?? null;
    default:
      return null;
  }
}

function formatValue(value: number | string | null, format: string, decimalPlaces: number): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;

  switch (format) {
    case "currency":
      return value.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      });
    case "percentage":
      return (
        value.toLocaleString(undefined, {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        }) + "%"
      );
    case "date":
      return String(value);
    case "number":
    default:
      return value.toLocaleString(undefined, {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      });
  }
}

// --- Search helpers (mirrored from table Renderer) ---

function joinColumns(array: any[], separator = ", ") {
  return reduce(
    array,
    (result: any[], item: any, index: number) => {
      if (index > 0) result.push(separator);
      result.push(item);
      return result;
    },
    []
  );
}

function getSearchColumns(columns: any[], { limit = Infinity, renderColumn = (col: any) => col.title } = {}) {
  const firstColumns = map(columns.slice(0, limit), (col) => renderColumn(col));
  const restColumns = map(columns.slice(limit), (col) => col.title);
  if (restColumns.length > 0) {
    return [...joinColumns(firstColumns), ` and ${restColumns.length} others`];
  }
  if (firstColumns.length > 1) {
    const initial = firstColumns.slice(0, -1);
    const lastCol = firstColumns[firstColumns.length - 1];
    return [...joinColumns(initial), ` and `, lastCol];
  }
  return firstColumns;
}

function SearchInputInfoIcon({ searchColumns }: any) {
  return (
    <Popover
      arrowPointAtCenter
      placement="topRight"
      content={
        <div className="table-visualization-search-info-content">
          Search{" "}
          {getSearchColumns(searchColumns, {
            renderColumn: (col) => <code key={col.name}>{col.title}</code>,
          })}
        </div>
      }>
      <InfoCircleFilledIcon className="table-visualization-search-info-icon" />
    </Popover>
  );
}

function SearchInput({ searchColumns, ...props }: any) {
  if (searchColumns.length <= 0) return null;
  const searchColumnsLimit = 3;
  return (
    <Input.Search
      {...props}
      placeholder={`Search ${getSearchColumns(searchColumns, { limit: searchColumnsLimit }).join("")}...`}
      suffix={searchColumns.length > searchColumnsLimit ? <SearchInputInfoIcon searchColumns={searchColumns} /> : null}
    />
  );
}

// --- Metric card component ---

function MetricCardItem({ card, rows }: { card: MetricCard; rows: any[] }) {
  const value = aggregate(rows, card.column, card.aggregation);
  const formattedValue = formatValue(
    typeof value === "number" ? value : null,
    card.format,
    card.decimalPlaces
  );

  let valueClassName = "report-metric-value";
  if (card.conditionalFormatting && typeof value === "number") {
    if (value > 0) valueClassName += " report-metric-positive";
    else if (value < 0) valueClassName += " report-metric-negative";
  }

  const style: React.CSSProperties = {};
  if (card.conditionalFormatting && typeof value === "number") {
    if (value > 0) style.color = card.positiveColor || "#16a34a";
    else if (value < 0) style.color = card.negativeColor || "#dc2626";
  }

  return (
    <div className="report-metric-card" data-test="ReportMetricCard">
      <div className="report-metric-label">{card.label || card.column}</div>
      <Tooltip title={`${card.aggregation} of ${card.column}`}>
        <div className={valueClassName} style={style}>
          {formattedValue}
        </div>
      </Tooltip>
    </div>
  );
}

// --- Report Header ---

function ReportHeader({ metricCards, rows }: { metricCards: MetricCard[]; rows: any[] }) {
  if (!metricCards || metricCards.length === 0) return null;

  return (
    <div className="report-header" data-test="ReportHeader">
      <div className="report-metric-cards">
        {map(metricCards, (card, index) => (
          <MetricCardItem key={card.id || `metric-${index}`} card={card} rows={rows} />
        ))}
      </div>
    </div>
  );
}

// --- Main Renderer ---

export default function Renderer({ options, data }: any) {
  const [searchTerm, setSearchTerm] = useState("");
  const [orderBy, setOrderBy] = useState([]);

  const searchColumns = useMemo(() => filter(options.columns, "allowSearch"), [options.columns]);

  const tableColumns = useMemo(() => {
    const searchInput =
      searchColumns.length > 0 ? (
        <SearchInput searchColumns={searchColumns} onChange={(event: any) => setSearchTerm(event.target.value)} />
      ) : null;
    return prepareColumns(options.columns, searchInput, orderBy, (newOrderBy: any) => {
      setOrderBy(newOrderBy);
      // @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
      document.getSelection().removeAllRanges();
    });
  }, [options.columns, searchColumns, orderBy]);

  const preparedRows = useMemo(
    () => sortRows(filterRows(initRows(data.rows), searchTerm, searchColumns), orderBy),
    [data.rows, searchTerm, searchColumns, orderBy]
  );

  // Reset sorting when data or config changes
  useEffect(() => {
    setOrderBy([]);
  }, [options.columns, data.columns]);

  if (data.rows.length === 0) {
    return null;
  }

  return (
    <div className="report-visualization-container" data-test="ReportVisualization">
      <ReportHeader metricCards={options.metricCards || []} rows={data.rows} />
      <div className="report-table-section">
        <Table
          className="table-fixed-header"
          data-percy="show-scrollbars"
          data-test="ReportTableVisualization"
          // @ts-expect-error ts-migrate(2322) FIXME: Type '{ key: any; dataIndex: string; align: any; s... Remove this comment to see the full error message
          columns={tableColumns}
          dataSource={preparedRows}
          pagination={{
            size: get(options, "paginationSize", ""),
            // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'TablePagi... Remove this comment to see the full error message
            position: "bottom",
            pageSize: options.itemsPerPage,
            hideOnSinglePage: true,
            showSizeChanger: false,
          }}
          showSorterTooltip={false}
        />
      </div>
    </div>
  );
}

Renderer.propTypes = RendererPropTypes;
