import React, { useState, useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import { get } from "lodash";
import "./FanOutWarningBanner.less";

/**
 * FanOutWarningBanner - Shows a contextual warning when the user writes a JOIN
 * that creates a 1:Many or M:M fan-out (one row on the left becomes many rows).
 *
 * Detection logic:
 * 1. Parse JOINs from the query text using regex
 * 2. Look up each JOIN pair against FK graph cardinality data
 * 3. If any edge is 1:M or M:M, show the fan-out warning
 * 4. If 2+ fan-out JOINs from same base, show stronger Cartesian product warning
 *
 * Renders below the query editor alongside other hint banners.
 */

/**
 * Build a simple FK cardinality graph from schema data.
 * Returns { "tableA||tableB": { cardinality, joinPairs, sourceTable, targetTable, junctionTable } }
 */
function buildFKCardinalityGraph(schema) {
  if (!schema || schema.length === 0) return {};

  // Build constraint lookup
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

  // Collect FK pairs
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
    if (allConstrained) junctionTables.add(tableName);
  });

  // Build bidirectional cardinality graph
  const graph = {};
  Object.values(pairMap).forEach((g) => {
    const isJunction = junctionTables.has(g.sourceTable);

    // Outgoing: FK holder -> referenced table
    const allSourceUnique = g.pairs.every((p) => {
      const key = g.sourceTable + "." + p.sourceCol;
      const c = constraintMap[key];
      return c && (c.isPK || c.isUnique);
    });
    const outCardinality = isJunction ? "M:M" : allSourceUnique ? "1:1" : "M:1";

    const outKey = g.sourceTable + "||" + g.targetTable;
    graph[outKey] = {
      cardinality: outCardinality,
      sourceTable: g.sourceTable,
      targetTable: g.targetTable,
      junctionTable: isJunction ? g.sourceTable : null,
      fanOut: outCardinality === "1:M" || outCardinality === "M:M",
    };

    // Incoming: referenced table -> FK holder
    const inCardinality = isJunction ? "M:M" : allSourceUnique ? "1:1" : "1:M";

    const inKey = g.targetTable + "||" + g.sourceTable;
    graph[inKey] = {
      cardinality: inCardinality,
      sourceTable: g.targetTable,
      targetTable: g.sourceTable,
      junctionTable: isJunction ? g.sourceTable : null,
      fanOut: inCardinality === "1:M" || inCardinality === "M:M",
    };
  });

  return graph;
}

/**
 * Extract short table name (without schema prefix).
 */
function shortName(fullName) {
  if (!fullName) return fullName;
  const dot = fullName.lastIndexOf(".");
  return dot >= 0 ? fullName.substring(dot + 1) : fullName;
}

/**
 * Parse JOIN clauses from query text and extract table pairs.
 * Returns array of { leftTable, rightTable, joinType }
 */
function parseJoins(queryText) {
  if (!queryText) return [];

  // Remove comments and string literals to avoid false matches
  const cleaned = queryText
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");

  const joins = [];

  // Match FROM clause to get the base table(s)
  const fromMatch = cleaned.match(/\bFROM\s+([\w.]+)(?:\s+(?:AS\s+)?([\w]+))?/i);
  const fromTable = fromMatch ? fromMatch[1] : null;

  // Match JOIN clauses: [LEFT|RIGHT|INNER|CROSS|FULL]? JOIN schema.table [alias] ON ...
  const joinRegex = /\b(?:LEFT\s+(?:OUTER\s+)?|RIGHT\s+(?:OUTER\s+)?|INNER\s+|CROSS\s+|FULL\s+(?:OUTER\s+)?)?JOIN\s+([\w.]+)(?:\s+(?:AS\s+)?([\w]+))?/gi;
  let match;
  let prevTable = fromTable;

  while ((match = joinRegex.exec(cleaned)) !== null) {
    const rightTable = match[1];
    if (prevTable) {
      joins.push({
        leftTable: prevTable,
        rightTable,
        joinType: "JOIN",
      });
    }
    // Track cumulative tables for detecting double fan-out
    // The next JOIN's left table is still the original FROM table
    // (in most cases JOINs are chained from the base)
  }

  return { fromTable, joins };
}

/**
 * Resolve a table name (possibly without schema) to its full schema-qualified name.
 */
function resolveTableName(name, schema) {
  if (!name || !schema) return name;

  // Already fully qualified
  const item = schema.find((s) => s.name === name);
  if (item) return item.name;

  // Try matching without schema prefix
  const match = schema.find((s) => s.name.endsWith("." + name));
  return match ? match.name : name;
}

/**
 * Detect fan-out JOINs in the query.
 * Returns array of { leftTable, rightTable, cardinality, junctionTable }
 */
function detectFanOutJoins(queryText, schema, fkGraph) {
  if (!queryText || !schema || !fkGraph) return [];

  const { fromTable, joins } = parseJoins(queryText);
  if (!fromTable || joins.length === 0) return [];

  const resolvedFrom = resolveTableName(fromTable, schema);
  const fanOuts = [];

  joins.forEach(({ leftTable, rightTable }) => {
    const resolvedLeft = resolveTableName(leftTable, schema);
    const resolvedRight = resolveTableName(rightTable, schema);

    // Check both directions for the join
    const key1 = resolvedLeft + "||" + resolvedRight;
    const key2 = resolvedRight + "||" + resolvedLeft;

    // We care about fan-out from the FROM table's perspective
    // FROM A JOIN B: if A->B is 1:M (one A row, many B rows), that's fan-out
    const edge1 = fkGraph[key1];
    const edge2 = fkGraph[key2];

    // Prioritize the edge from the FROM table side
    let relevantEdge = null;
    if (edge1 && edge1.sourceTable === resolvedFrom) {
      relevantEdge = edge1;
    } else if (edge2 && edge2.sourceTable === resolvedFrom) {
      relevantEdge = edge2;
    } else if (edge1 && edge1.fanOut) {
      relevantEdge = edge1;
    } else if (edge2 && edge2.fanOut) {
      relevantEdge = edge2;
    }

    if (relevantEdge && relevantEdge.fanOut) {
      fanOuts.push({
        leftTable: resolvedLeft,
        rightTable: resolvedRight,
        cardinality: relevantEdge.cardinality,
        junctionTable: relevantEdge.junctionTable,
        leftShort: shortName(resolvedLeft),
        rightShort: shortName(resolvedRight),
      });
    }
  });

  return fanOuts;
}

export default function FanOutWarningBanner({ queryText, schema }) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Build FK cardinality graph from schema
  const fkGraph = useMemo(() => buildFKCardinalityGraph(schema), [schema]);

  // Detect fan-out JOINs
  const fanOuts = useMemo(
    () => detectFanOutJoins(queryText, schema, fkGraph),
    [queryText, schema, fkGraph]
  );

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Reset dismissed state when query changes significantly (new fan-outs appear)
  const fanOutKey = fanOuts.map((f) => f.leftTable + "-" + f.rightTable).join(",");
  useMemo(() => {
    setDismissed(false);
  }, [fanOutKey]);

  if (dismissed || fanOuts.length === 0) return null;

  const isDoubleFanOut = fanOuts.length >= 2;

  return (
    <div className="fan-out-warning-banner" role="alert" aria-live="polite">
      <div className="fan-out-warning-header">
        <i className="fa fa-exclamation-triangle fan-out-icon" aria-hidden="true" />
        <span className="fan-out-text">
          {isDoubleFanOut ? (
            <>
              <strong>⚠ Multiple fan-out JOINs detected</strong>
              {" — this creates a Cartesian product. Consider subqueries."}
            </>
          ) : (
            <>
              <strong>Fan-out JOIN detected:</strong>
              {" "}
              <code>{fanOuts[0].rightShort}</code>
              {" has many rows per "}
              <code>{fanOuts[0].leftShort}</code>
              {". Aggregates (SUM, COUNT) may be inflated."}
            </>
          )}
        </span>
        <button
          type="button"
          className="fan-out-toggle"
          onClick={toggleExpanded}
          aria-label={expanded ? "Hide suggestions" : "Show suggestions"}
        >
          {expanded ? "Hide" : "Tips"}
          <i className={expanded ? "fa fa-chevron-up" : "fa fa-chevron-down"} aria-hidden="true" style={{ marginLeft: 4 }} />
        </button>
        <button
          type="button"
          className="fan-out-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss warning"
          title="Dismiss"
        >
          &times;
        </button>
      </div>

      {expanded && (
        <div className="fan-out-suggestions">
          <div className="fan-out-joins-list">
            {fanOuts.map((fo, idx) => (
              <div key={idx} className="fan-out-join-item">
                <code>{fo.leftShort}</code>
                <span className="fan-out-arrow">→</span>
                <code>{fo.rightShort}</code>
                <span className={"fan-out-cardinality fan-out-cardinality-" + fo.cardinality.replace(":", "")}>
                  {fo.cardinality}
                </span>
                {fo.junctionTable && (
                  <span className="fan-out-junction">
                    via <code>{shortName(fo.junctionTable)}</code>
                  </span>
                )}
              </div>
            ))}
          </div>
          <ul className="fan-out-suggestion-list">
            <li>
              <i className="fa fa-compress" aria-hidden="true" />
              {" Add "}
              <code>GROUP BY</code>
              {" to aggregate results"}
            </li>
            <li>
              <i className="fa fa-code" aria-hidden="true" />
              {" Use a subquery: "}
              {fanOuts[0] && (
                <code>
                  {"(SELECT ... FROM " + fanOuts[0].rightShort + " GROUP BY " + fanOuts[0].leftShort + "_id)"}
                </code>
              )}
            </li>
            <li>
              <i className="fa fa-filter" aria-hidden="true" />
              {" Use "}
              <code>DISTINCT</code>
              {" if you only need unique rows"}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

FanOutWarningBanner.propTypes = {
  queryText: PropTypes.string,
  schema: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      columns: PropTypes.arrayOf(PropTypes.object),
    })
  ),
};

FanOutWarningBanner.defaultProps = {
  queryText: "",
  schema: [],
};
