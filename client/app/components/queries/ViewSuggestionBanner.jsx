import React, { useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import { parseSQLContext } from "./QueryEditor/sqlContext";
import "./ViewSuggestionBanner.less";

/**
 * Build a reverse lookup: given a base table name, which views reference it.
 * Prioritizes reporting schema views over others.
 *
 * @param {Array} schema - The schema items array from data source.
 * @returns {Object} Map of base table name -> [{viewName, schema: schemaName}]
 */
function buildViewReverseLookup(schema) {
  if (!schema || schema.length === 0) return {};

  const lookup = {};
  schema.forEach(item => {
    if (!item.source_tables || item.source_tables.length === 0) return;

    item.source_tables.forEach(baseTable => {
      if (!lookup[baseTable]) {
        lookup[baseTable] = [];
      }
      // Check if this view is in the reporting schema
      const isReporting = item.name.startsWith("reporting.");
      lookup[baseTable].push({
        viewName: item.name,
        isReporting,
        columnCount: item.columns ? item.columns.length : 0,
      });
    });
  });

  // Sort each entry: reporting views first, then by column count (richer views first)
  Object.keys(lookup).forEach(key => {
    lookup[key].sort((a, b) => {
      if (a.isReporting !== b.isReporting) return a.isReporting ? -1 : 1;
      return b.columnCount - a.columnCount;
    });
  });

  return lookup;
}

/**
 * Check if a table name refers to a view (has source_tables in schema).
 */
function isView(tableName, schema) {
  const item = schema.find(s => s.name === tableName);
  return item && item.source_tables && item.source_tables.length > 0;
}

/**
 * Find view suggestions for tables referenced in the current query.
 *
 * @param {string} queryText - Current query text.
 * @param {number} cursorPosition - Cursor position in text.
 * @param {Array} schema - Schema items from data source.
 * @returns {Array} Suggestions: [{baseTable, views: [{viewName, isReporting, columnCount}]}]
 */
function findViewSuggestions(queryText, cursorPosition, schema) {
  if (!queryText || !schema || schema.length === 0) return [];

  try {
    const ctx = parseSQLContext(queryText, cursorPosition || queryText.length);
    if (!ctx.tables || ctx.tables.length === 0) return [];

    const reverseLookup = buildViewReverseLookup(schema);
    const suggestions = [];
    const seen = new Set();

    ctx.tables.forEach(ref => {
      // Build possible full names to match
      const possibleNames = [];
      if (ref.schema && ref.name) {
        possibleNames.push(`${ref.schema}.${ref.name}`);
      }
      possibleNames.push(ref.name);

      // Also try matching without schema prefix against schema items
      const matchedSchemaItem = schema.find(item => {
        for (const pn of possibleNames) {
          if (item.name === pn) return true;
          if (!ref.schema && item.name.endsWith(`.${pn}`)) return true;
        }
        return false;
      });

      const fullTableName = matchedSchemaItem ? matchedSchemaItem.name : possibleNames[0];

      // Skip if this is already a view
      if (isView(fullTableName, schema)) return;

      // Look up views that reference this base table
      const views = reverseLookup[fullTableName];
      if (views && views.length > 0 && !seen.has(fullTableName)) {
        seen.add(fullTableName);
        suggestions.push({
          baseTable: fullTableName,
          alias: ref.alias,
          views: views.slice(0, 3), // max 3 suggestions per table
        });
      }
    });

    return suggestions;
  } catch (e) {
    return [];
  }
}

/**
 * ViewSuggestionBanner - Shows non-intrusive suggestions when users query
 * base tables that have richer reporting views available.
 */
export default function ViewSuggestionBanner({ queryText, cursorPosition, schema, onApplySuggestion }) {
  const suggestions = useMemo(
    () => findViewSuggestions(queryText, cursorPosition, schema),
    [queryText, cursorPosition, schema]
  );

  const handleApply = useCallback(
    (baseTable, viewName, alias) => {
      if (onApplySuggestion) {
        onApplySuggestion(baseTable, viewName, alias);
      }
    },
    [onApplySuggestion]
  );

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="view-suggestion-banner">
      {suggestions.map(suggestion => (
        <div key={suggestion.baseTable} className="view-suggestion-item">
          <i className="fa fa-lightbulb-o suggestion-icon" aria-hidden="true" />
          <span className="suggestion-text">
            <strong>{suggestion.views[0].viewName}</strong>
            {" includes pre-built JOINs and computed columns from "}
            <code>{suggestion.baseTable}</code>
            {" — "}
          </span>
          <button
            type="button"
            className="suggestion-action"
            onClick={() => handleApply(suggestion.baseTable, suggestion.views[0].viewName, suggestion.alias)}
          >
            Use it instead
          </button>
          {suggestion.views.length > 1 && (
            <span className="suggestion-alternatives">
              {" or "}
              {suggestion.views.slice(1).map((view, i) => (
                <span key={view.viewName}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    className="suggestion-alt-action"
                    onClick={() => handleApply(suggestion.baseTable, view.viewName, suggestion.alias)}
                  >
                    {view.viewName}
                  </button>
                </span>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

ViewSuggestionBanner.propTypes = {
  queryText: PropTypes.string,
  cursorPosition: PropTypes.number,
  schema: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      columns: PropTypes.array,
      source_tables: PropTypes.arrayOf(PropTypes.string),
    })
  ),
  onApplySuggestion: PropTypes.func,
};

ViewSuggestionBanner.defaultProps = {
  queryText: "",
  cursorPosition: 0,
  schema: [],
  onApplySuggestion: null,
};

export { buildViewReverseLookup, findViewSuggestions };
