import { isNil, map, filter, some, includes, get, reduce } from "lodash";
import cx from "classnames";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import PropTypes from "prop-types";
import { useDebouncedCallback } from "use-debounce";
import Input from "antd/lib/input";
import Button from "antd/lib/button";
import AutoSizer from "react-virtualized/dist/commonjs/AutoSizer";
import List from "react-virtualized/dist/commonjs/List";
import PlainButton from "@/components/PlainButton";
import Tooltip from "@/components/Tooltip";
import useDataSourceSchema from "@/pages/queries/hooks/useDataSourceSchema";
import useImmutableCallback from "@/lib/hooks/useImmutableCallback";
import LoadingState from "../items-list/components/LoadingState";

const SchemaItemColumnType = PropTypes.shape({
  name: PropTypes.string.isRequired,
  type: PropTypes.string,
  fk: PropTypes.shape({
    schema: PropTypes.string,
    table: PropTypes.string,
    column: PropTypes.string,
  }),
});

export const SchemaItemType = PropTypes.shape({
  name: PropTypes.string.isRequired,
  size: PropTypes.number,
  loading: PropTypes.bool,
  columns: PropTypes.arrayOf(SchemaItemColumnType).isRequired,
});

const schemaTableHeight = 22;
const schemaColumnHeight = 18;

/**
 * Determine the icon class for a table based on its name.
 * Views (prefixed with "v_" in any schema) get fa-eye, others get fa-table.
 */
function getTableIcon(tableName) {
  // Extract the table part (after the last dot for schema-qualified names)
  const parts = tableName.split(".");
  const rawName = parts[parts.length - 1];
  return rawName.startsWith("v_") ? "fa fa-eye" : "fa fa-table";
}

/**
 * Build a map of table name -> count of incoming FK references.
 * A "ref" means another table has a column with fk pointing to this table.
 */
function buildIncomingFkCounts(schema) {
  return reduce(
    schema,
    (counts, item) => {
      if (item.columns) {
        item.columns.forEach((col) => {
          const fk = get(col, "fk");
          if (fk) {
            const refTableName = fk.schema + "." + fk.table;
            counts[refTableName] = (counts[refTableName] || 0) + 1;
          }
        });
      }
      return counts;
    },
    {}
  );
}

/**
 * Build a set of table names related to the given table (via FK in either direction).
 */
function getRelatedTables(schema, tableName) {
  const related = new Set();
  related.add(tableName);

  schema.forEach((item) => {
    if (item.columns) {
      item.columns.forEach((col) => {
        const fk = get(col, "fk");
        if (fk) {
          const refTableName = fk.schema + "." + fk.table;
          // This table references another table
          if (item.name === tableName) {
            related.add(refTableName);
          }
          // Another table references this table
          if (refTableName === tableName) {
            related.add(item.name);
          }
        }
      });
    }
  });

  return related;
}

function SchemaItem({ item, expanded, onToggle, onSelect, onNavigateToTable, incomingFkCount, ...props }) {
  const handleSelect = useCallback(
    (event, ...args) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect(...args);
    },
    [onSelect]
  );

  const handleFkClick = useCallback(
    (event, fk) => {
      event.preventDefault();
      event.stopPropagation();
      if (onNavigateToTable) {
        const targetTable = fk.schema + "." + fk.table;
        onNavigateToTable(targetTable);
      }
    },
    [onNavigateToTable]
  );

  if (!item) {
    return null;
  }

  const tableDisplayName = item.displayName || item.name;
  const tableIcon = getTableIcon(item.name);

  return (
    <div {...props}>
      <div className="schema-list-item">
        <Tooltip
          title={item.description}
          mouseEnterDelay={0}
          mouseLeaveDelay={0}
          placement="rightTop"
          trigger={item.description ? "hover" : ""}
          overlayStyle={{ whiteSpace: "pre-line" }}
        >
          <PlainButton className="table-name" onClick={onToggle}>
            <i className={cx(tableIcon, "m-r-5")} aria-hidden="true" />
            <strong>
              <span title={item.name}>{tableDisplayName}</span>
              {!isNil(item.size) && <span> ({item.size})</span>}
            </strong>
            {incomingFkCount > 0 && (
              <span className="fk-ref-badge" title={incomingFkCount + " FK refs"}>
                {incomingFkCount}
              </span>
            )}
          </PlainButton>
        </Tooltip>
        <Tooltip
          title="Insert table name into query text"
          mouseEnterDelay={0}
          mouseLeaveDelay={0}
          placement="topRight"
          arrowPointAtCenter
        >
          <PlainButton className="copy-to-editor" onClick={(e) => handleSelect(e, item.name)}>
            <i className="fa fa-angle-double-right" aria-hidden="true" />
          </PlainButton>
        </Tooltip>
      </div>
      {expanded && (
        <div className="table-open">
          {item.loading ? (
            <div className="table-open">Loading...</div>
          ) : (
            map(item.columns, (column) => {
              const columnName = get(column, "name");
              const columnType = get(column, "type");
              const columnDescription = get(column, "description");
              const fk = get(column, "fk");
              const fkTooltip = fk
                ? "References " + fk.schema + "." + fk.table + "." + fk.column
                : null;
              return (
                <Tooltip
                  title={
                    "Insert column name into query text" +
                    (fkTooltip ? "\n" + fkTooltip : "") +
                    (columnDescription ? "\n" + columnDescription : "")
                  }
                  mouseEnterDelay={0}
                  mouseLeaveDelay={0}
                  placement="rightTop"
                  overlayStyle={{ whiteSpace: "pre-line" }}
                >
                  <PlainButton
                    key={columnName}
                    className={cx("table-open-item", { "fk-column": !!fk })}
                    onClick={(e) => handleSelect(e, columnName)}
                  >
                    <div>
                      {fk && (
                        <Tooltip
                          title={"Click to go to " + fk.schema + "." + fk.table}
                          mouseEnterDelay={0}
                          mouseLeaveDelay={0}
                          placement="top"
                        >
                          <i
                            className="fa fa-link fk-icon"
                            aria-hidden="true"
                            onClick={(e) => handleFkClick(e, fk)}
                          />
                        </Tooltip>
                      )}
                      {columnName} {columnType && <span className="column-type">{columnType}</span>}
                    </div>

                    <div className="copy-to-editor">
                      <i className="fa fa-angle-double-right" aria-hidden="true" />
                    </div>
                  </PlainButton>
                </Tooltip>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

SchemaItem.propTypes = {
  item: SchemaItemType,
  expanded: PropTypes.bool,
  onToggle: PropTypes.func,
  onSelect: PropTypes.func,
  onNavigateToTable: PropTypes.func,
  incomingFkCount: PropTypes.number,
};

SchemaItem.defaultProps = {
  item: null,
  expanded: false,
  onToggle: () => {},
  onSelect: () => {},
  onNavigateToTable: null,
  incomingFkCount: 0,
};

function SchemaLoadingState() {
  return (
    <div className="schema-loading-state">
      <LoadingState className="" />
    </div>
  );
}

export function SchemaList({
  loading,
  schema,
  expandedFlags,
  onTableExpand,
  onItemSelect,
  onNavigateToTable,
  incomingFkCounts,
}) {
  const [listRef, setListRef] = useState(null);

  useEffect(() => {
    if (listRef) {
      listRef.recomputeRowHeights();
    }
  }, [listRef, schema, expandedFlags]);

  return (
    <div className="schema-browser">
      {loading && <SchemaLoadingState />}
      {!loading && (
        <AutoSizer>
          {({ width, height }) => (
            <List
              ref={setListRef}
              width={width}
              height={height}
              rowCount={schema.length}
              rowHeight={({ index }) => {
                const item = schema[index];
                const columnsLength = !item.loading ? item.columns.length : 1;
                let columnCount = expandedFlags[item.name] ? columnsLength : 0;
                return schemaTableHeight + schemaColumnHeight * columnCount;
              }}
              rowRenderer={({ key, index, style }) => {
                const item = schema[index];
                return (
                  <SchemaItem
                    key={key}
                    style={style}
                    item={item}
                    expanded={expandedFlags[item.name]}
                    onToggle={() => onTableExpand(item.name)}
                    onSelect={onItemSelect}
                    onNavigateToTable={onNavigateToTable}
                    incomingFkCount={get(incomingFkCounts, item.name, 0)}
                  />
                );
              }}
            />
          )}
        </AutoSizer>
      )}
    </div>
  );
}

export function applyFilterOnSchema(schema, filterString) {
  const filters = filter(filterString.toLowerCase().split(/\s+/), (s) => s.length > 0);

  // Empty string: return original schema
  if (filters.length === 0) {
    return schema;
  }

  // Single word: matches table or column
  if (filters.length === 1) {
    const nameFilter = filters[0];
    const columnFilter = filters[0];
    return filter(
      schema,
      (item) =>
        includes(item.name.toLowerCase(), nameFilter) ||
        some(item.columns, (column) => includes(get(column, "name").toLowerCase(), columnFilter))
    );
  }

  // Two (or more) words: first matches table, seconds matches column
  const nameFilter = filters[0];
  const columnFilter = filters[1];
  return filter(
    map(schema, (item) => {
      if (includes(item.name.toLowerCase(), nameFilter)) {
        item = {
          ...item,
          columns: filter(item.columns, (column) => includes(get(column, "name").toLowerCase(), columnFilter)),
        };
        return item.columns.length > 0 ? item : null;
      }
    })
  );
}

export default function SchemaBrowser({
  dataSource,
  onSchemaUpdate,
  onItemSelect,
  options,
  onOptionsUpdate,
  ...props
}) {
  const [schema, isLoading, refreshSchema] = useDataSourceSchema(dataSource);
  const [filterString, setFilterString] = useState("");
  const [expandedFlags, setExpandedFlags] = useState({});
  const [relationshipFilter, setRelationshipFilter] = useState(null); // table name to filter by

  const incomingFkCounts = useMemo(() => buildIncomingFkCounts(schema), [schema]);

  const filteredSchema = useMemo(() => {
    let result = applyFilterOnSchema(schema, filterString);
    if (relationshipFilter) {
      const related = getRelatedTables(schema, relationshipFilter);
      result = filter(result, (item) => related.has(item.name));
    }
    return result;
  }, [schema, filterString, relationshipFilter]);

  const [handleFilterChange] = useDebouncedCallback(setFilterString, 500);

  const handleSchemaUpdate = useImmutableCallback(onSchemaUpdate);

  useEffect(() => {
    setExpandedFlags({});
    handleSchemaUpdate(schema);
  }, [schema, handleSchemaUpdate]);

  // Navigate to a table (scroll + expand) when clicking an FK link
  const handleNavigateToTable = useCallback(
    (tableName) => {
      setExpandedFlags((prev) => ({ ...prev, [tableName]: true }));
      // Clear any relationship filter so the target table is visible
      setRelationshipFilter(null);
    },
    []
  );

  // Toggle relationship filtering for a table
  const handleToggleRelationships = useCallback(
    (tableName) => {
      setRelationshipFilter((prev) => (prev === tableName ? null : tableName));
    },
    []
  );

  if (schema.length === 0 && !isLoading) {
    return null;
  }

  function toggleTable(tableName) {
    setExpandedFlags({
      ...expandedFlags,
      [tableName]: !expandedFlags[tableName],
    });
  }

  return (
    <div className="schema-container" {...props}>
      <div className="schema-control">
        <Input
          className="m-r-5"
          placeholder="Search schema..."
          aria-label="Search schema"
          disabled={schema.length === 0}
          onChange={(event) => handleFilterChange(event.target.value)}
        />

        <Tooltip title="Refresh Schema">
          <Button onClick={() => refreshSchema(true)}>
            <i className={cx("zmdi zmdi-refresh", { "zmdi-hc-spin": isLoading })} aria-hidden="true" />
            <span className="sr-only">{isLoading ? "Loading, please wait." : "Press to refresh."}</span>
          </Button>
        </Tooltip>
      </div>
      {relationshipFilter && (
        <div className="relationship-filter-banner">
          <span>
            Showing tables related to <strong>{relationshipFilter}</strong>
          </span>
          <PlainButton onClick={() => setRelationshipFilter(null)} className="clear-filter">
            <i className="fa fa-times" aria-hidden="true" /> Clear
          </PlainButton>
        </div>
      )}
      <SchemaList
        loading={isLoading && schema.length === 0}
        schema={filteredSchema}
        expandedFlags={expandedFlags}
        onTableExpand={toggleTable}
        onItemSelect={onItemSelect}
        onNavigateToTable={handleNavigateToTable}
        incomingFkCounts={incomingFkCounts}
      />
    </div>
  );
}

SchemaBrowser.propTypes = {
  dataSource: PropTypes.object, // eslint-disable-line react/forbid-prop-types
  onSchemaUpdate: PropTypes.func,
  onItemSelect: PropTypes.func,
};

SchemaBrowser.defaultProps = {
  dataSource: null,
  onSchemaUpdate: () => {},
  onItemSelect: () => {},
};
