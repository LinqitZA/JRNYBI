import { capitalize, isNil, map, get } from "lodash";
import AceEditor from "react-ace";
import ace from "ace-builds";
import { parseSQLContext } from "./sqlContext";

import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-sql";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/theme-textmate";
import "ace-builds/src-noconflict/ext-searchbox";

const langTools = ace.acequire("ace/ext/language_tools");
const snippetsModule = ace.acequire("ace/snippets");

// By default Ace will try to load snippet files for the different modes and fail.
// We don't need them, so we use these placeholders until we define our own.
function defineDummySnippets(mode) {
  ace.define(`ace/snippets/${mode}`, ["require", "exports", "module"], (require, exports) => {
    exports.snippetText = "";
    exports.scope = mode;
  });
}

defineDummySnippets("python");
defineDummySnippets("sql");
defineDummySnippets("json");
defineDummySnippets("yaml");

// without this line, ace will try to load a non-existent mode-custom.js file
// for data sources with syntax = "custom"
ace.define("ace/mode/custom", [], () => {});

function buildTableColumnKeywords(table) {
  const keywords = [];
  table.columns.forEach(column => {
    const columnName = get(column, "name");
    keywords.push({
      name: `${table.name}.${columnName}`,
      value: `${table.name}.${columnName}`,
      score: 100,
      meta: capitalize(get(column, "type", "Column")),
    });
  });
  return keywords;
}

function buildKeywordsFromSchema(schema) {
  const tableKeywords = [];
  const columnKeywords = {};
  const tableColumnKeywords = {};

  schema.forEach(table => {
    tableKeywords.push({
      name: table.name,
      value: table.name,
      score: 100,
      meta: "Table",
    });
    tableColumnKeywords[table.name] = buildTableColumnKeywords(table);
    table.columns.forEach(c => {
      const columnName = get(c, "name", c);
      columnKeywords[columnName] = capitalize(get(c, "type", "Column"));
    });
  });

  return {
    table: tableKeywords,
    column: map(columnKeywords, (v, k) => ({
      name: k,
      value: k,
      score: 50,
      meta: v,
    })),
    tableColumn: tableColumnKeywords,
  };
}

const schemaCompleterKeywords = {};
/** Raw schema data per editor (needed for context-aware lookups). */
const schemaRawData = {};

export function updateSchemaCompleter(editorKey, schema = null) {
  schemaCompleterKeywords[editorKey] = isNil(schema) ? null : buildKeywordsFromSchema(schema);
  schemaRawData[editorKey] = isNil(schema) ? null : schema;
}

// ---- Context-aware helpers ----------------------------------------------------

/** Clauses where we should show table names (not columns). */
const TABLE_CLAUSES = new Set([
  "FROM", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
  "OUTER JOIN", "CROSS JOIN", "FULL JOIN", "NATURAL JOIN",
  "LEFT OUTER JOIN", "RIGHT OUTER JOIN", "FULL OUTER JOIN",
  "INTO", "UPDATE",
]);

/** Clauses where we should show column names (not tables). */
const COLUMN_CLAUSES = new Set([
  "SELECT", "WHERE", "ON", "HAVING", "ORDER BY", "GROUP BY",
]);

/**
 * Given a list of referenced tables from the SQL context and the raw schema,
 * resolve which schema tables match (by name, schema.name, or alias) and
 * return their column completions.
 */
function getColumnsForReferencedTables(referencedTables, rawSchema, tableColumnKeywords) {
  if (!rawSchema || !referencedTables || referencedTables.length === 0) {
    return null; // fall back to all columns
  }

  const columns = [];
  const seenColumns = new Set();

  referencedTables.forEach(ref => {
    // Build possible schema item names to match against
    const possibleNames = [];
    if (ref.schema && ref.name) {
      possibleNames.push(`${ref.schema}.${ref.name}`);
    }
    possibleNames.push(ref.name);

    // Find matching schema item
    const matchedTable = rawSchema.find(schemaItem => {
      for (const pn of possibleNames) {
        if (schemaItem.name === pn) return true;
        // schema item might be "schema.table" and ref just has "table"
        if (schemaItem.name.endsWith(`.${pn}`)) return true;
      }
      return false;
    });

    if (matchedTable) {
      // Add unqualified columns (high score for context relevance)
      matchedTable.columns.forEach(c => {
        const colName = get(c, "name", c);
        if (!seenColumns.has(colName)) {
          seenColumns.add(colName);
          columns.push({
            name: colName,
            value: colName,
            score: 200, // higher than generic columns (50)
            meta: capitalize(get(c, "type", "Column")),
          });
        }
      });

      // Add alias-qualified columns if alias exists
      if (ref.alias) {
        matchedTable.columns.forEach(c => {
          const colName = get(c, "name", c);
          const qualified = `${ref.alias}.${colName}`;
          columns.push({
            name: qualified,
            value: qualified,
            score: 190,
            meta: capitalize(get(c, "type", "Column")),
          });
        });
      }

      // Add table.column qualified entries too
      if (tableColumnKeywords[matchedTable.name]) {
        tableColumnKeywords[matchedTable.name].forEach(kw => {
          columns.push({ ...kw, score: 180 });
        });
      }
    }
  });

  return columns.length > 0 ? columns : null;
}

/**
 * Get columns for an alias-qualified prefix (e.g. "so." -> columns from the
 * table aliased as "so").
 */
function getColumnsForAlias(alias, referencedTables, rawSchema) {
  if (!rawSchema || !referencedTables) return null;

  // Find which table this alias refers to
  const ref = referencedTables.find(t => t.alias === alias || t.name === alias);
  if (!ref) return null;

  // Find matching schema item
  const possibleNames = [];
  if (ref.schema && ref.name) possibleNames.push(`${ref.schema}.${ref.name}`);
  possibleNames.push(ref.name);

  const matchedTable = rawSchema.find(schemaItem => {
    for (const pn of possibleNames) {
      if (schemaItem.name === pn) return true;
      if (schemaItem.name.endsWith(`.${pn}`)) return true;
    }
    return false;
  });

  if (!matchedTable) return null;

  return matchedTable.columns.map(c => {
    const colName = get(c, "name", c);
    return {
      name: colName,
      value: colName,
      score: 300, // highest score - most specific match
      meta: capitalize(get(c, "type", "Column")),
    };
  });
}

/**
 * Convert Ace editor row/column position to a character offset in the full text.
 */
function posToOffset(session, pos) {
  let offset = 0;
  for (let row = 0; row < pos.row; row++) {
    offset += session.getLine(row).length + 1; // +1 for newline
  }
  offset += pos.column;
  return offset;
}

// ---- Completer setup ----------------------------------------------------------

langTools.setCompleters([
  langTools.snippetCompleter,
  langTools.keyWordCompleter,
  langTools.textCompleter,
  {
    identifierRegexps: [/[a-zA-Z_0-9.\-\u00A2-\uFFFF]/],
    getCompletions: (editor, session, pos, prefix, callback) => {
      const keywords = schemaCompleterKeywords[editor.id] || {
        table: [],
        column: [],
        tableColumn: {},
      };
      const { table, column, tableColumn } = keywords;
      const rawSchema = schemaRawData[editor.id];

      if (prefix.length === 0 || table.length === 0) {
        callback(null, []);
        return;
      }

      // --- Context-aware completion ---
      try {
        const queryText = session.getValue();
        const cursorOffset = posToOffset(session, pos);
        const ctx = parseSQLContext(queryText, cursorOffset);

        // Alias-qualified completion: "so." \u2192 columns from aliased table
        if (prefix.includes(".")) {
          const dotIdx = prefix.lastIndexOf(".");
          const qualifier = prefix.substring(0, dotIdx);

          // Check if qualifier is an alias from the query context
          const aliasColumns = getColumnsForAlias(qualifier, ctx.tables, rawSchema);
          if (aliasColumns) {
            callback(null, aliasColumns);
            return;
          }

          // Fall back: qualifier might be a table name from schema
          const tableName = prefix.substring(0, prefix.length - (prefix.endsWith(".") ? 1 : 0));
          const dotPrefix = tableName.includes(".") ? tableName.substring(0, tableName.lastIndexOf(".") + 1) : "";
          const lookupName = prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : tableName;
          if (tableColumn[lookupName]) {
            callback(null, table.concat(tableColumn[lookupName]));
            return;
          }
          // Show tables for schema-qualified prefix (e.g. "reporting.")
          callback(null, table);
          return;
        }

        // FROM / JOIN clauses: show only table names (no columns)
        if (TABLE_CLAUSES.has(ctx.clause)) {
          // Boost table scores for contextual relevance
          const boostedTables = table.map(t => ({ ...t, score: 200 }));
          callback(null, boostedTables);
          return;
        }

        // SELECT / WHERE / ON / ORDER BY / GROUP BY / HAVING: show columns from referenced tables
        if (COLUMN_CLAUSES.has(ctx.clause)) {
          const contextColumns = getColumnsForReferencedTables(ctx.tables, rawSchema, tableColumn);
          if (contextColumns) {
            callback(null, contextColumns);
            return;
          }
          // No tables identified yet \u2014 fall back to all columns
          callback(null, column);
          return;
        }
      } catch (e) {
        // If context parsing fails for any reason, fall back to default behavior
      }

      // --- Default fallback: show everything (original behavior) ---
      if (prefix[prefix.length - 1] === ".") {
        const tableName = prefix.substring(0, prefix.length - 1);
        callback(null, table.concat(tableColumn[tableName]));
        return;
      }
      callback(null, table.concat(column));
    },
  },
]);

export { AceEditor, langTools, snippetsModule };
