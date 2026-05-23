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
  is_primary_key: PropTypes.bool,
  is_unique: PropTypes.bool,
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
  source_tables: PropTypes.arrayOf(PropTypes.string),
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
 * Build a map of "sourceTable -> targetTable" -> list of FK column names.
 * Used to detect when multiple FK columns in one table reference the same target.
 */
function buildMultiFkMap(schema) {
  return reduce(
    schema,
    (result, item) => {
      if (item.columns) {
        const fksByTarget = {};
        item.columns.forEach((col) => {
          const fk = get(col, "fk");
          if (fk) {
            const refTableName = fk.schema + "." + fk.table;
            if (!fksByTarget[refTableName]) {
              fksByTarget[refTableName] = [];
            }
            fksByTarget[refTableName].push(get(col, "name"));
          }
        });
        // Only store entries where multiple FKs point to the same target
        Object.entries(fksByTarget).forEach(([target, cols]) => {
          if (cols.length > 1) {
            const key = item.name + "|" + target;
            result[key] = cols;
          }
        });
      }
      return result;
    },
    {}
  );
}

/**
 * Cardinality badge config: maps cardinality type to display properties.
 */
const CARDINALITY_CONFIG = {
  "M:1": { label: "→1", color: "#2563eb", title: "Many-to-One" },
  "1:1": { label: "1:1", color: "#16a34a", title: "One-to-One" },
  "1:M": { label: "1→N", color: "#d97706", title: "One-to-Many" },
  "M:M": { label: "M↔M", color: "#7c3aed", title: "Many-to-Many" },
};

/**
 * Build a cardinality map for all FK columns in the schema.
 * Key: "tableName.columnName", Value: { cardinality, junctionTable?, fanOutWarning }
 *
 * Also builds incoming FK cardinality: Key: "referencedTable.__incoming__sourceTable.sourceCol"
 * for showing 1:M badges on the referenced table side.
 *
 * Uses the same logic as buildFKGraph in ace.js.
 */
function buildCardinalityMap(schema) {
  if (!schema || schema.length === 0) return {};

  // Build constraint lookup: "tableName.colName" -> { isPK, isUnique }
  const constraintMap = {};
  schema.forEach((table) => {
    (table.columns || []).forEach((col) => {
      const colName = get(col, "name");
      if (!colName) return;
      const key = table.name + "." + colName;
      constraintMap[key] = {
        isPK: !!get(col, "is_primary_key"),
        isUnique: !!get(col, "is_unique"),
      };
    });
  });

  // Collect FK relationships grouped by source→target table pair
  const pairMap = {};
  schema.forEach((table) => {
    (table.columns || []).forEach((col) => {
      const fk = get(col, "fk");
      if (!fk) return;
      const targetTable = fk.schema ? fk.schema + "." + fk.table : fk.table;
      const pairKey = table.name + "||" + targetTable;
      if (!pairMap[pairKey]) {
        pairMap[pairKey] = { sourceTable: table.name, targetTable, pairs: [] };
      }
      pairMap[pairKey].pairs.push({
        sourceCol: get(col, "name"),
        targetCol: fk.column,
      });
    });
  });

  // Detect junction tables
  const junctionTables = new Set();
  const tableFK = {};
  Object.values(pairMap).forEach((g) => {
    if (!tableFK[g.sourceTable]) tableFK[g.sourceTable] = [];
    g.pairs.forEach((p) => {
      tableFK[g.sourceTable].push({ targetTable: g.targetTable, sourceCol: p.sourceCol });
    });
  });
  Object.entries(tableFK).forEach(([tableName, fkEntries]) => {
    const distinctTargets = new Set(fkEntries.map((e) => e.targetTable));
    if (distinctTargets.size < 2) return;
    const allConstrained = fkEntries.every((e) => {
      const key = tableName + "." + e.sourceCol;
      const c = constraintMap[key];
      return c && (c.isPK || c.isUnique);
    });
    if (allConstrained) {
      junctionTables.add(tableName);
    }
  });

  // Build cardinality map
  const cardMap = {};

  Object.values(pairMap).forEach((g) => {
    const isJunction = junctionTables.has(g.sourceTable);

    g.pairs.forEach((p) => {
      // Outgoing: FK column in source table
      const sourceKey = g.sourceTable + "." + p.sourceCol;
      const cSource = constraintMap[sourceKey];
      const isSourceUnique = cSource && (cSource.isPK || cSource.isUnique);

      let outgoingCardinality;
      if (isJunction) {
        outgoingCardinality = "M:M";
      } else if (isSourceUnique) {
        outgoingCardinality = "1:1";
      } else {
        outgoingCardinality = "M:1";
      }

      cardMap[sourceKey] = {
        cardinality: outgoingCardinality,
        junctionTable: isJunction ? g.sourceTable : null,
        fanOutWarning: outgoingCardinality === "1:M" || outgoingCardinality === "M:M",
        targetTable: g.targetTable,
        targetCol: p.targetCol,
      };
    });
  });

  // Build incoming cardinality entries for referenced columns
  // Key: "referencedTable.referencedCol" → array of incoming refs
  // This allows showing 1:M badges on PK/referenced columns
  const incomingMap = {};

  Object.values(pairMap).forEach((g) => {
    const isJunction = junctionTables.has(g.sourceTable);

    g.pairs.forEach((p) => {
      const sourceKey = g.sourceTable + "." + p.sourceCol;
      const cSource = constraintMap[sourceKey];
      const isSourceUnique = cSource && (cSource.isPK || cSource.isUnique);

      let incomingCardinality;
      if (isJunction) {
        incomingCardinality = "M:M";
      } else if (isSourceUnique) {
        incomingCardinality = "1:1";
      } else {
        incomingCardinality = "1:M";
      }

      const targetColKey = g.targetTable + "." + p.targetCol;
      if (!incomingMap[targetColKey]) {
        incomingMap[targetColKey] = [];
      }
      incomingMap[targetColKey].push({
        cardinality: incomingCardinality,
        junctionTable: isJunction ? g.sourceTable : null,
        fanOutWarning: incomingCardinality === "1:M" || incomingCardinality === "M:M",
        sourceTable: g.sourceTable,
        sourceCol: p.sourceCol,
      });
    });
  });

  return { outgoing: cardMap, incoming: incomingMap };
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

function SchemaItem({ item, expanded, onToggle, onSelect, onNavigateToTable, incomingFkCount, multiFkNotes, cardinalityMap, ...props }) {
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
  const hasSourceTables = item.source_tables && item.source_tables.length > 0;
  const viewTooltip = hasSourceTables
    ? (item.description ? item.description + "\n\n" : "") +
      "View - sources from: " + item.source_tables.join(", ")
    : item.description;

  return (
    <div {...props}>
      <div className="schema-list-item">
        <Tooltip
          title={viewTooltip}
          mouseEnterDelay={0}
          mouseLeaveDelay={0}
          placement="rightTop"
          trigger={viewTooltip ? "hover" : ""}
          overlayStyle={{ whiteSpace: "pre-line" }}
        >
          <PlainButton className="table-name" onClick={onToggle}>
            <i className={cx(tableIcon, "m-r-5")} aria-hidden="true" />
            <strong>
              <span title={item.name}>{tableDisplayName}</span>
              {!isNil(item.size) && <span> ({item.size})</span>}
            </strong>
            {hasSourceTables && (
              <span className="view-badge" title={"View - sources: " + item.source_tables.join(", ")}>
                VIEW
              </span>
            )}
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
              const fkTarget = fk ? fk.schema + "." + fk.table : null;

              // Get outgoing cardinality info for this FK column
              const outgoing = cardinalityMap ? cardinalityMap.outgoing || {} : {};
              const incoming = cardinalityMap ? cardinalityMap.incoming || {} : {};
              const cardKey = fk ? item.name + "." + columnName : null;
              const cardInfo = cardKey ? outgoing[cardKey] : null;
              const cardinality = cardInfo ? cardInfo.cardinality : null;
              const cardConfig = cardinality ? CARDINALITY_CONFIG[cardinality] : null;

              // Get incoming FK references for this column (other tables referencing this column)
              const incomingColKey = item.name + "." + columnName;
              const incomingRefs = incoming[incomingColKey] || [];
              // Pick the "worst" incoming cardinality to show as badge
              const hasIncoming = !fk && incomingRefs.length > 0;
              let incomingCardinality = null;
              let incomingConfig = null;
              if (hasIncoming) {
                // Prioritize: M:M > 1:M > 1:1
                const hasMM = incomingRefs.some((r) => r.cardinality === "M:M");
                const has1M = incomingRefs.some((r) => r.cardinality === "1:M");
                if (hasMM) incomingCardinality = "M:M";
                else if (has1M) incomingCardinality = "1:M";
                else incomingCardinality = "1:1";
                incomingConfig = CARDINALITY_CONFIG[incomingCardinality];
              }

              // Build enhanced FK tooltip with cardinality description
              let fkTooltip = null;
              if (fk && fkTarget) {
                if (cardinality === "M:1") {
                  fkTooltip = "References " + fkTarget + "." + fk.column + " (Many → One: each row links to one " + fk.table + ")";
                } else if (cardinality === "1:1") {
                  fkTooltip = "References " + fkTarget + "." + fk.column + " (One-to-One: unique constraint)";
                } else if (cardinality === "M:M" && cardInfo && cardInfo.junctionTable) {
                  fkTooltip = "Many-to-Many with " + fkTarget + " via " + cardInfo.junctionTable;
                } else {
                  fkTooltip = "References " + fkTarget + "." + fk.column;
                }
              }

              // Build incoming FK tooltip
              let incomingTooltip = null;
              if (hasIncoming) {
                const refLines = incomingRefs.map((r) => {
                  if (r.cardinality === "1:M") {
                    return "Referenced by " + r.sourceTable + "." + r.sourceCol + " (One → Many: one " + columnName + " has many " + r.sourceTable.split(".").pop() + ")";
                  } else if (r.cardinality === "M:M") {
                    return "Many-to-Many via " + (r.junctionTable || r.sourceTable);
                  } else {
                    return "Referenced by " + r.sourceTable + "." + r.sourceCol + " (1:1)";
                  }
                });
                incomingTooltip = refLines.join("\n");
              }

              // Fan-out warning for outgoing M:M or incoming 1:M/M:M
              const fanOutNote = (cardInfo && cardInfo.fanOutWarning) ||
                (hasIncoming && (incomingCardinality === "1:M" || incomingCardinality === "M:M"))
                ? "\n\n⚠ Joining to this table will multiply rows. Consider GROUP BY or a subquery."
                : null;

              // Check for multi-FK note (multiple FKs from this table to same target)
              const multiFkNote = fk && multiFkNotes && multiFkNotes[fkTarget]
                ? "\n\n⚠ " + multiFkNotes[fkTarget].length + " columns in this table reference " + fkTarget + " (" + multiFkNotes[fkTarget].join(", ") + ") — use separate aliases for each JOIN"
                : null;

              // Determine if this column has any FK relevance (outgoing or incoming)
              const hasFkIndicator = !!fk || hasIncoming;

              return (
                <Tooltip
                  title={
                    "Insert column name into query text" +
                    (fkTooltip ? "\n\n" + fkTooltip : "") +
                    (incomingTooltip ? "\n\n" + incomingTooltip : "") +
                    (fanOutNote || "") +
                    (multiFkNote || "") +
                    (columnDescription ? "\n\n" + columnDescription : "")
                  }
                  mouseEnterDelay={0}
                  mouseLeaveDelay={0}
                  placement="rightTop"
                  overlayStyle={{ whiteSpace: "pre-line" }}
                >
                  <PlainButton
                    key={columnName}
                    className={cx("table-open-item", { "fk-column": !!fk, "fk-referenced-column": hasIncoming })}
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
                            className={cx("fk-icon", {
                              "fa fa-link": cardinality === "M:1" || cardinality === "1:1" || !cardinality,
                              "fa fa-code-fork": cardinality === "1:M",
                              "fa fa-exchange": cardinality === "M:M",
                            })}
                            aria-hidden="true"
                            style={cardConfig ? { color: cardConfig.color } : undefined}
                            onClick={(e) => handleFkClick(e, fk)}
                          />
                        </Tooltip>
                      )}
                      {hasIncoming && (
                        <i
                          className="fa fa-code-fork fk-icon fk-incoming-icon"
                          aria-hidden="true"
                          style={incomingConfig ? { color: incomingConfig.color } : undefined}
                          title={incomingRefs.length + " table(s) reference this column"}
                        />
                      )}
                      {fk && cardConfig && (
                        <span
                          className="cardinality-badge"
                          style={{ backgroundColor: cardConfig.color + "1a", color: cardConfig.color, borderColor: cardConfig.color + "40" }}
                          title={cardConfig.title}
                        >
                          {cardConfig.label}
                        </span>
                      )}
                      {hasIncoming && incomingConfig && (
                        <span
                          className="cardinality-badge"
                          style={{ backgroundColor: incomingConfig.color + "1a", color: incomingConfig.color, borderColor: incomingConfig.color + "40" }}
                          title={incomingConfig.title + " (incoming)"}
                        >
                          {incomingConfig.label}
                        </span>
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
  multiFkNotes: PropTypes.object,
  cardinalityMap: PropTypes.object,
};

SchemaItem.defaultProps = {
  item: null,
  expanded: false,
  onToggle: () => {},
  onSelect: () => {},
  onNavigateToTable: null,
  incomingFkCount: 0,
  multiFkNotes: null,
  cardinalityMap: null,
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
  multiFkMap,
  cardinalityMap,
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
                // Extract multi-FK notes for this table: { targetTable: [col1, col2] }
                const itemMultiFkNotes = multiFkMap
                  ? reduce(
                      Object.entries(multiFkMap),
                      (acc, [mapKey, cols]) => {
                        const [src, tgt] = mapKey.split("|");
                        if (src === item.name) {
                          acc[tgt] = cols;
                        }
                        return acc;
                      },
                      {}
                    )
                  : null;
                const hasMultiFk = itemMultiFkNotes && Object.keys(itemMultiFkNotes).length > 0;
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
                    multiFkNotes={hasMultiFk ? itemMultiFkNotes : null}
                    cardinalityMap={cardinalityMap}
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
  const multiFkMap = useMemo(() => buildMultiFkMap(schema), [schema]);
  const cardinalityMap = useMemo(() => buildCardinalityMap(schema), [schema]);

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
        multiFkMap={multiFkMap}
        cardinalityMap={cardinalityMap}
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
