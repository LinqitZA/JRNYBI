import { capitalize, isNil, map, get } from "lodash";
import AceEditor from "react-ace";
import ace from "ace-builds";
import { parseSQLContext } from "./sqlContext";
import { resolveDisplayColumn } from "./fkResolution";
import { buildTypeAwareSuggestions } from "./querySnippets";

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

// ---- Column documentation helpers (inline autocomplete enrichment) ----------

/**
 * Classify a PostgreSQL data type into a visual category for color-coding.
 */
function getTypeCategory(type) {
  if (!type) return "default";
  const t = type.toLowerCase();
  if (/int|numeric|decimal|float|double|real|serial|money|smallint|bigint/.test(t)) return "numeric";
  if (/date|time|interval|timestamp/.test(t)) return "date";
  if (/bool/.test(t)) return "boolean";
  if (/uuid/.test(t)) return "uuid";
  if (/json/.test(t)) return "json";
  if (/\[\]|array|anyarray/.test(t)) return "array";
  return "text"; // varchar, text, char, etc.
}

/**
 * Return the CSS color for a given type category.
 */
function getTypeBadgeColor(category) {
  switch (category) {
    case "numeric": return "#16a34a"; // green
    case "date": return "#2563eb";    // blue
    case "boolean": return "#ea580c"; // orange
    case "uuid": return "#9333ea";    // purple
    case "json": return "#ca8a04";    // amber
    case "array": return "#0891b2";   // cyan
    default: return "#6b7280";        // gray for text/default
  }
}

/** Escape HTML special chars to prevent XSS in docHTML. */
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Build a rich HTML tooltip for a column completion item.
 * Shows type badge (color-coded), nullable status, FK reference, and description.
 *
 * @param {Object} column - The raw column object from the schema
 * @returns {string|undefined} HTML string for docHTML, or undefined if nothing to show
 */
function buildColumnDocHTML(column) {
  if (!column || typeof column === "string") return undefined;

  const type = get(column, "type", "");
  const description = get(column, "description", "");
  const fk = get(column, "fk");
  const nullable = get(column, "nullable");

  // Only show tooltip if we have something useful to display
  if (!type && !description && !fk && nullable === undefined) return undefined;

  const category = getTypeCategory(type);
  const color = getTypeBadgeColor(category);

  let html = '<div class="jrnybi-col-doc">';

  // Row 1: Type badge + nullable
  if (type || nullable !== undefined) {
    html += '<div class="jrnybi-col-doc-badges">';
    if (type) {
      html += '<span class="jrnybi-type-badge" style="background:' + color + ';">' + escapeHtml(type) + "</span>";
    }
    if (nullable !== undefined) {
      if (nullable) {
        html += '<span class="jrnybi-nullable-badge jrnybi-nullable">NULLABLE</span>';
      } else {
        html += '<span class="jrnybi-nullable-badge jrnybi-notnull">NOT NULL</span>';
      }
    }
    html += "</div>";
  }

  // Row 2: FK reference
  if (fk) {
    const fkTarget = (fk.schema ? escapeHtml(fk.schema) + "." : "") +
      escapeHtml(fk.table) + "." + escapeHtml(fk.column);
    html += '<div class="jrnybi-col-doc-fk">FK &rarr; ' + fkTarget + "</div>";
  }

  // Row 3: Description
  if (description) {
    html += '<div class="jrnybi-col-doc-desc">' + escapeHtml(description) + "</div>";
  }

  html += "</div>";
  return html;
}

/**
 * Build a rich HTML tooltip for a table completion item.
 */
function buildTableDocHTML(table) {
  if (!table) return undefined;
  const description = get(table, "description", "");
  const colCount = (table.columns || []).length;

  let html = '<div class="jrnybi-col-doc">';
  html += '<div class="jrnybi-col-doc-badges">';
  html += '<span class="jrnybi-type-badge" style="background:#475569;">Table</span>';
  if (colCount > 0) {
    html += '<span class="jrnybi-nullable-badge jrnybi-nullable">' + colCount + " columns</span>";
  }
  html += "</div>";
  if (description) {
    html += '<div class="jrnybi-col-doc-desc">' + escapeHtml(description) + "</div>";
  }
  html += "</div>";
  return html;
}

/** Lookup map: column name → raw column object (for docHTML generation). */
const columnMetaLookup = {};

function buildTableColumnKeywords(table) {
  const keywords = [];
  table.columns.forEach(column => {
    const columnName = get(column, "name");
    const qualifiedName = `${table.name}.${columnName}`;
    keywords.push({
      name: qualifiedName,
      value: qualifiedName,
      score: 100,
      meta: capitalize(get(column, "type", "Column")),
      docHTML: buildColumnDocHTML(column),
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
      docHTML: buildTableDocHTML(table),
    });
    tableColumnKeywords[table.name] = buildTableColumnKeywords(table);
    table.columns.forEach(c => {
      const columnName = get(c, "name", c);
      // Store full column metadata for lookup by unqualified column names
      if (typeof c === "object") {
        columnMetaLookup[columnName] = c;
      }
      columnKeywords[columnName] = {
        type: capitalize(get(c, "type", "Column")),
        docHTML: buildColumnDocHTML(c),
      };
    });
  });

  return {
    table: tableKeywords,
    column: map(columnKeywords, (v, k) => ({
      name: k,
      value: k,
      score: 50,
      meta: v.type,
      docHTML: v.docHTML,
    })),
    tableColumn: tableColumnKeywords,
  };
}

const schemaCompleterKeywords = {};
/** Raw schema data per editor (needed for context-aware lookups). */
const schemaRawData = {};
/** Cached FK relationship graph per editor. */
const fkGraphData = {};

export function updateSchemaCompleter(editorKey, schema = null) {
  schemaCompleterKeywords[editorKey] = isNil(schema) ? null : buildKeywordsFromSchema(schema);
  schemaRawData[editorKey] = isNil(schema) ? null : schema;
  fkGraphData[editorKey] = isNil(schema) ? null : buildFKGraph(schema);
}

// ---- FK relationship graph ---------------------------------------------------

/**
 * Build a foreign-key relationship graph from the enriched schema data.
 * For each table, returns all tables that have FK relationships (both directions:
 * tables that reference it, and tables it references).
 *
 * @param {Array} schema - The raw schema array from the backend (with FK-enriched columns)
 * @returns {Object} graph keyed by full table name, value is array of relationship edges
 */
function buildFKGraph(schema) {
  if (!schema) return {};

  // First pass: collect all FK relationships grouped by source→target table pair
  // This naturally handles composite FKs (multiple columns in the same constraint)
  const pairMap = {}; // key: "sourceTable||targetTable"

  schema.forEach(table => {
    (table.columns || []).forEach(col => {
      const fk = get(col, "fk");
      if (!fk) return;

      const targetTable = fk.schema ? `${fk.schema}.${fk.table}` : fk.table;
      const pairKey = `${table.name}||${targetTable}`;

      if (!pairMap[pairKey]) {
        pairMap[pairKey] = { sourceTable: table.name, targetTable, pairs: [] };
      }
      pairMap[pairKey].pairs.push({
        sourceCol: get(col, "name"), // FK column in source table
        targetCol: fk.column,        // referenced column in target table
      });
    });
  });

  // Second pass: build bidirectional adjacency list
  const graph = {};

  Object.values(pairMap).forEach(g => {
    const metaLabel = g.pairs
      .map(p => `${shortTableName(g.sourceTable)}.${p.sourceCol} → ${shortTableName(g.targetTable)}.${p.targetCol}`)
      .join(", ");

    // Resolve display columns for both ends of the relationship
    const targetEntry = schema.find(t => t.name === g.targetTable);
    const targetDisplayCol = targetEntry ? resolveDisplayColumn(targetEntry) : null;
    const sourceEntry = schema.find(t => t.name === g.sourceTable);
    const sourceDisplayCol = sourceEntry ? resolveDisplayColumn(sourceEntry) : null;

    // Outgoing edge: sourceTable has FK pointing to targetTable
    if (!graph[g.sourceTable]) graph[g.sourceTable] = [];
    graph[g.sourceTable].push({
      relatedTable: g.targetTable,
      // When the existing query table IS the source, these map to:
      //   existingAlias.thisCol = newAlias.otherCol
      joinPairs: g.pairs.map(p => ({ thisCol: p.sourceCol, otherCol: p.targetCol })),
      metaLabel,
      displayColumn: targetDisplayCol,
    });

    // Incoming edge: targetTable is referenced by sourceTable
    if (!graph[g.targetTable]) graph[g.targetTable] = [];
    graph[g.targetTable].push({
      relatedTable: g.sourceTable,
      // When the existing query table IS the target, these map to:
      //   existingAlias.thisCol = newAlias.otherCol
      joinPairs: g.pairs.map(p => ({ thisCol: p.targetCol, otherCol: p.sourceCol })),
      metaLabel,
      displayColumn: sourceDisplayCol,
    });
  });

  return graph;
}

/** Get the short display name for a table (without schema prefix). */
function shortTableName(fullName) {
  if (!fullName) return fullName;
  const dot = fullName.lastIndexOf(".");
  return dot >= 0 ? fullName.substring(dot + 1) : fullName;
}

/**
 * Generate a short alias for a table name, avoiding conflicts with existing aliases.
 */
function generateAlias(tableName, existingAliases) {
  const sn = shortTableName(tableName);
  const parts = sn.split("_");
  const taken = new Set((existingAliases || []).map(a => (a || "").toLowerCase()));

  // Try initials of underscore-separated parts (e.g. "sales_orders" → "so")
  if (parts.length > 1) {
    const initials = parts.map(p => (p[0] || "")).join("");
    if (initials && !taken.has(initials.toLowerCase())) return initials;
  }

  // Try first letter
  if (sn[0] && !taken.has(sn[0].toLowerCase())) return sn[0];

  // Try increasing prefixes
  for (let len = 2; len <= Math.min(sn.length, 5); len++) {
    const cand = sn.substring(0, len);
    if (!taken.has(cand.toLowerCase())) return cand;
  }

  // Append number as last resort
  let num = 2;
  while (taken.has(`${sn[0]}${num}`.toLowerCase())) num++;
  return `${sn[0]}${num}`;
}

/**
 * Find the full schema table name matching a table reference from SQL context.
 * Handles schema-qualified names (sales.orders) and unqualified names (orders).
 */
function findSchemaTableName(ref, rawSchema) {
  if (!rawSchema || !ref) return null;

  const possibleNames = [];
  if (ref.schema && ref.name) possibleNames.push(`${ref.schema}.${ref.name}`);
  possibleNames.push(ref.name);

  const matched = rawSchema.find(schemaItem => {
    for (const pn of possibleNames) {
      if (schemaItem.name === pn) return true;
      if (schemaItem.name.endsWith(`.${pn}`)) return true;
    }
    return false;
  });

  return matched ? matched.name : null;
}

/**
 * Build FK-aware JOIN table suggestions. For each table already in the query,
 * look up FK relationships and generate completions with auto-generated ON clauses.
 *
 * @param {Object} ctx           - SQL context from parseSQLContext()
 * @param {Array}  rawSchema     - Raw schema data
 * @param {Object} fkGraph       - FK relationship graph from buildFKGraph()
 * @param {boolean} includeOnClause - Whether to generate ON clause (true for JOINs, false for FROM)
 * @returns {Array|null} FK-based suggestions, or null if none found
 */
function buildJoinSuggestions(ctx, rawSchema, fkGraph, includeOnClause) {
  if (!rawSchema || !fkGraph || !ctx.tables || ctx.tables.length === 0) {
    return null;
  }

  const suggestions = [];
  const suggestedTables = new Set();

  ctx.tables.forEach(existingRef => {
    const existingFullName = findSchemaTableName(existingRef, rawSchema);
    if (!existingFullName) return;

    const edges = fkGraph[existingFullName];
    if (!edges) return;

    const existingAliases = ctx.tables.map(t => t.alias || t.name);
    const existingQualifier = existingRef.alias || existingRef.name;

    edges.forEach(edge => {
      if (suggestedTables.has(edge.relatedTable)) return;

      // Don't suggest tables already in the query
      const alreadyInQuery = ctx.tables.some(t => {
        const fn = findSchemaTableName(t, rawSchema);
        return fn === edge.relatedTable;
      });
      if (alreadyInQuery) return;

      suggestedTables.add(edge.relatedTable);

      if (includeOnClause) {
        // Generate alias and full JOIN clause with ON condition
        const newAlias = generateAlias(edge.relatedTable, existingAliases);

        // Build ON clause — supports composite FKs with AND
        const onParts = edge.joinPairs.map(
          p => `${existingQualifier}.${p.thisCol} = ${newAlias}.${p.otherCol}`
        );
        const onClause = onParts.join(" AND ");

        suggestions.push({
          name: edge.relatedTable,
          value: `${edge.relatedTable} ${newAlias} ON ${onClause}`,
          score: 250, // higher than regular tables (100/200)
          meta: `FK: ${edge.metaLabel}`,
        });
      } else {
        // FROM clause: just prioritize the table, no ON clause
        suggestions.push({
          name: edge.relatedTable,
          value: edge.relatedTable,
          score: 250,
          meta: `FK: ${edge.metaLabel}`,
        });
      }
    });
  });

  return suggestions.length > 0 ? suggestions : null;
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
            docHTML: buildColumnDocHTML(c),
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
            docHTML: buildColumnDocHTML(c),
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
      docHTML: buildColumnDocHTML(c),
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

// ---- Context-aware SQL keyword completer ---------------------------------------

/**
 * Keyword priority map: for each SQL clause context, defines which keywords
 * should appear first (high score) vs secondary (lower score).
 *
 * Priority keywords: score 300 (above table/column suggestions at 200)
 * Secondary keywords: score 80 (below table/column suggestions)
 * Unlisted keywords: hidden for that context
 */
const KEYWORD_PRIORITY_MAP = {
  // Start of query or empty — suggest statement starters
  null: {
    priority: ["SELECT", "WITH", "INSERT", "UPDATE", "DELETE"],
    secondary: ["CREATE", "DROP", "ALTER", "EXPLAIN"],
  },

  // After SELECT — suggest FROM, column-related keywords
  SELECT: {
    priority: ["FROM", "DISTINCT", "CASE", "COALESCE", "CAST"],
    secondary: ["AS", "NULLIF", "GREATEST", "LEAST", "EXTRACT", "EXISTS", "NOT"],
  },

  // After FROM — suggest WHERE, JOINs, ordering, grouping
  FROM: {
    priority: ["WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL OUTER JOIN",
               "ORDER BY", "GROUP BY", "CROSS JOIN"],
    secondary: ["HAVING", "LIMIT", "OFFSET", "UNION", "INTERSECT", "EXCEPT",
                 "NATURAL JOIN", "LEFT OUTER JOIN", "RIGHT OUTER JOIN", "LATERAL", "AS"],
  },

  // After WHERE — suggest logical operators, comparison keywords
  WHERE: {
    priority: ["AND", "OR", "IN", "BETWEEN", "LIKE", "ILIKE", "IS", "NOT", "EXISTS", "ANY", "ALL"],
    secondary: ["CASE", "WHEN", "IS NULL", "IS NOT NULL", "NOT IN", "NOT EXISTS",
                 "NOT LIKE", "NOT BETWEEN", "ORDER BY", "GROUP BY", "LIMIT", "HAVING"],
  },

  // After ORDER BY — suggest ASC, DESC, NULLS handling
  "ORDER BY": {
    priority: ["ASC", "DESC", "NULLS FIRST", "NULLS LAST"],
    secondary: ["LIMIT", "OFFSET", "FETCH"],
  },

  // After GROUP BY — suggest HAVING, ORDER BY
  "GROUP BY": {
    priority: ["HAVING", "ORDER BY", "LIMIT"],
    secondary: ["UNION", "INTERSECT", "EXCEPT", "WINDOW"],
  },

  // After JOIN — suggest ON (after table name is entered)
  JOIN: {
    priority: ["ON"],
    secondary: ["AS"],
  },
  "LEFT JOIN": {
    priority: ["ON"],
    secondary: ["AS"],
  },
  "RIGHT JOIN": {
    priority: ["ON"],
    secondary: ["AS"],
  },
  "INNER JOIN": {
    priority: ["ON"],
    secondary: ["AS"],
  },
  "OUTER JOIN": {
    priority: ["ON"],
    secondary: ["AS"],
  },
  "CROSS JOIN": {
    priority: ["ON"],
    secondary: ["AS"],
  },
  "FULL JOIN": {
    priority: ["ON"],
    secondary: ["AS"],
  },
  "NATURAL JOIN": {
    priority: [],
    secondary: ["WHERE", "ORDER BY", "GROUP BY"],
  },
  "LEFT OUTER JOIN": {
    priority: ["ON"],
    secondary: ["AS"],
  },
  "RIGHT OUTER JOIN": {
    priority: ["ON"],
    secondary: ["AS"],
  },
  "FULL OUTER JOIN": {
    priority: ["ON"],
    secondary: ["AS"],
  },

  // After ON — suggest logical connectors, next clauses
  ON: {
    priority: ["AND", "OR", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN"],
    secondary: ["ORDER BY", "GROUP BY", "FULL OUTER JOIN", "CROSS JOIN"],
  },

  // After HAVING — suggest logical operators
  HAVING: {
    priority: ["AND", "OR", "IN", "BETWEEN", "LIKE", "NOT", "EXISTS"],
    secondary: ["ORDER BY", "LIMIT", "UNION"],
  },

  // After LIMIT — suggest OFFSET
  LIMIT: {
    priority: ["OFFSET"],
    secondary: ["UNION", "INTERSECT", "EXCEPT"],
  },

  // After OFFSET — suggest FETCH, LIMIT
  OFFSET: {
    priority: ["FETCH", "LIMIT"],
    secondary: ["UNION", "INTERSECT", "EXCEPT"],
  },

  // After SET (UPDATE ... SET) — suggest WHERE
  SET: {
    priority: ["WHERE"],
    secondary: ["AND", "FROM", "RETURNING"],
  },

  // After INSERT INTO — suggest VALUES, SELECT
  INTO: {
    priority: ["VALUES", "SELECT"],
    secondary: ["DEFAULT", "RETURNING"],
  },

  // After VALUES
  VALUES: {
    priority: ["RETURNING"],
    secondary: ["ON"],
  },

  // After UPDATE — suggest SET
  UPDATE: {
    priority: ["SET"],
    secondary: ["AS"],
  },

  // After DELETE — suggest FROM
  DELETE: {
    priority: ["FROM"],
    secondary: ["WHERE", "USING"],
  },

  // After WITH — suggest AS, SELECT
  WITH: {
    priority: ["AS", "SELECT"],
    secondary: ["RECURSIVE"],
  },

  // After UNION/INTERSECT/EXCEPT — suggest SELECT, ALL
  UNION: {
    priority: ["SELECT", "ALL"],
    secondary: [],
  },
  INTERSECT: {
    priority: ["SELECT", "ALL"],
    secondary: [],
  },
  EXCEPT: {
    priority: ["SELECT", "ALL"],
    secondary: [],
  },

  // After RETURNING — mostly end of statement
  RETURNING: {
    priority: [],
    secondary: ["AS"],
  },

  // After WINDOW — suggest AS
  WINDOW: {
    priority: ["AS"],
    secondary: ["ORDER BY", "PARTITION"],
  },
};

/**
 * Detect if the cursor is inside a CASE expression by scanning backwards
 * through the SQL text for unmatched CASE keywords.
 */
function isInsideCaseExpression(queryText, cursorOffset) {
  if (!queryText) return false;
  const before = queryText.substring(0, cursorOffset).toUpperCase();
  let caseDepth = 0;
  // Simple scan: count CASE vs END keywords
  const caseRe = /\b(CASE|END)\b/g;
  let m;
  while ((m = caseRe.exec(before)) !== null) {
    if (m[1] === "CASE") caseDepth++;
    else if (m[1] === "END") caseDepth--;
  }
  return caseDepth > 0;
}

/**
 * Detect the last significant token before the cursor (excluding whitespace).
 * This helps determine sub-context like "after ORDER BY col" → suggest ASC/DESC.
 */
function getLastToken(queryText, cursorOffset) {
  if (!queryText || cursorOffset <= 0) return "";
  const before = queryText.substring(0, cursorOffset).trimEnd();
  // Find the last whitespace-delimited token
  const lastSpaceIdx = before.lastIndexOf(" ");
  const lastNewlineIdx = before.lastIndexOf("\n");
  const lastSep = Math.max(lastSpaceIdx, lastNewlineIdx);
  if (lastSep < 0) return before.toUpperCase();
  return before.substring(lastSep + 1).toUpperCase();
}

/**
 * Context-aware SQL keyword completer that replaces Ace's built-in keyWordCompleter.
 *
 * Uses parseSQLContext() to determine which SQL clause the cursor is in,
 * then filters and scores keywords based on context relevance.
 */
const contextKeywordCompleter = {
  getCompletions: (editor, session, pos, prefix, callback) => {
    // Only complete if there's a prefix to match
    if (!prefix || prefix.length === 0) {
      callback(null, []);
      return;
    }

    const queryText = session.getValue();
    const cursorOffset = posToOffset(session, pos);

    let clause = null;
    try {
      const ctx = parseSQLContext(queryText, cursorOffset);
      clause = ctx.clause;
    } catch (e) {
      // Fall back to null clause (start-of-query suggestions)
    }

    // Check if we're inside a CASE expression — override suggestions
    const inCase = isInsideCaseExpression(queryText, cursorOffset);

    const completions = [];
    const prefixUpper = prefix.toUpperCase();

    if (inCase) {
      // Inside CASE: prioritize CASE-specific keywords
      const casePriority = ["WHEN", "THEN", "ELSE", "END"];
      const caseSecondary = ["AND", "OR", "IN", "BETWEEN", "LIKE", "ILIKE", "IS", "NOT",
                             "IS NULL", "IS NOT NULL", "NULL", "TRUE", "FALSE"];

      casePriority.forEach(kw => {
        if (kw.toUpperCase().startsWith(prefixUpper)) {
          completions.push({
            name: kw,
            value: kw,
            score: 300,
            meta: "keyword",
          });
        }
      });

      caseSecondary.forEach(kw => {
        if (kw.toUpperCase().startsWith(prefixUpper)) {
          completions.push({
            name: kw,
            value: kw,
            score: 80,
            meta: "keyword",
          });
        }
      });

      callback(null, completions);
      return;
    }

    // Look up the clause context in the priority map
    const contextConfig = KEYWORD_PRIORITY_MAP[clause] || KEYWORD_PRIORITY_MAP[null];

    if (contextConfig) {
      // Add priority keywords at high score
      contextConfig.priority.forEach(kw => {
        if (kw.toUpperCase().startsWith(prefixUpper)) {
          completions.push({
            name: kw,
            value: kw,
            score: 300,
            meta: "keyword",
          });
        }
      });

      // Add secondary keywords at lower score
      contextConfig.secondary.forEach(kw => {
        if (kw.toUpperCase().startsWith(prefixUpper)) {
          completions.push({
            name: kw,
            value: kw,
            score: 80,
            meta: "keyword",
          });
        }
      });
    }

    // For ORDER BY context: if the last token before cursor isn't a keyword,
    // the user likely just typed a column name — push ASC/DESC to top
    if (clause === "ORDER BY") {
      const lastTok = getLastToken(queryText, cursorOffset - prefix.length);
      if (lastTok && !KEYWORD_SET_FOR_COMPLETER.has(lastTok) && lastTok !== ",") {
        // User just typed a column name; ASC/DESC should already be priority
        // from the map above, but let's also suggest NULLS FIRST/LAST
      }
    }

    callback(null, completions);
  },
};

/**
 * Quick keyword set for checking if the last token is a keyword.
 * Used by the context-aware completer for sub-context detection.
 */
const KEYWORD_SET_FOR_COMPLETER = new Set([
  "SELECT", "FROM", "WHERE", "JOIN", "ON", "AND", "OR", "NOT", "IN", "EXISTS",
  "BETWEEN", "LIKE", "ILIKE", "IS", "NULL", "TRUE", "FALSE", "CASE", "WHEN",
  "THEN", "ELSE", "END", "AS", "ORDER", "BY", "GROUP", "HAVING", "LIMIT",
  "OFFSET", "UNION", "ALL", "INTERSECT", "EXCEPT", "INSERT", "INTO", "VALUES",
  "UPDATE", "SET", "DELETE", "ASC", "DESC", "NULLS", "FIRST", "LAST",
  "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "NATURAL", "DISTINCT",
  "WITH", "RETURNING", "WINDOW", "OVER", "PARTITION",
]);

// ---- Completer setup ----------------------------------------------------------

langTools.setCompleters([
  langTools.snippetCompleter,
  contextKeywordCompleter,
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

        // FROM / JOIN clauses: show table names with FK-aware prioritization
        if (TABLE_CLAUSES.has(ctx.clause)) {
          const fkGraph = fkGraphData[editor.id];
          const isJoinClause = ctx.clause && ctx.clause.toUpperCase().includes("JOIN");

          // When tables already exist in the query, offer FK-based suggestions
          if (ctx.tables.length > 0 && fkGraph) {
            const fkSuggestions = buildJoinSuggestions(
              ctx, rawSchema, fkGraph, isJoinClause
            );
            if (fkSuggestions) {
              // FK-related tables first (score 250), then all others (score 100)
              const otherTables = table.map(t => ({ ...t, score: 100 }));
              callback(null, fkSuggestions.concat(otherTables));
              return;
            }
          }

          // Regular table suggestions (no FK data or no existing tables yet)
          const boostedTables = table.map(t => ({ ...t, score: 200 }));
          callback(null, boostedTables);
          return;
        }

        // SELECT / WHERE / ON / ORDER BY / GROUP BY / HAVING: show columns from referenced tables
        if (COLUMN_CLAUSES.has(ctx.clause)) {
          const contextColumns = getColumnsForReferencedTables(ctx.tables, rawSchema, tableColumn);

          // Add type-aware function suggestions (aggregates, date fns, filters)
          const typeAware = buildTypeAwareSuggestions(ctx.clause, rawSchema, ctx.tables);

          if (contextColumns) {
            callback(null, contextColumns.concat(typeAware));
            return;
          }
          // No tables identified yet \u2014 fall back to all columns + type-aware
          callback(null, column.concat(typeAware));
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

/** Get raw schema data for an editor (used by FK resolution). */
export function getSchemaRawData(editorId) {
  return schemaRawData[editorId] || null;
}

/** Get FK graph data for an editor (used by FK resolution). */
export function getFKGraphData(editorId) {
  return fkGraphData[editorId] || null;
}

export { AceEditor, langTools, snippetsModule };
