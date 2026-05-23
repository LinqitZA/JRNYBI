/**
 * FK Resolution Module — Descriptive field resolution for FK ID columns.
 *
 * When a user includes a foreign key column (e.g., customer_id) in their SELECT,
 * this module detects it and offers to replace/augment it with the human-readable
 * display column from the referenced table (e.g., customer_name), automatically
 * adding the required JOIN.
 */

import { get } from "lodash";
import { parseSQLContext } from "./sqlContext";

// ---- Static FK display column map (JRNY schema) --------------------------------

/**
 * Static map of JRNY schema tables to their best display column(s).
 * Checked FIRST in resolveDisplayColumn() — heuristics are the fallback
 * for tables not in this map (e.g., user-created or custom tables).
 *
 * Multi-column entries (e.g., ["code", "name"]) add each column as a
 * separate SELECT field when resolved.
 */
const FK_DISPLAY_MAP = {
  // === core ===
  "core.branches":        { columns: ["code", "name"] },
  "core.countries":       { columns: ["code", "name"] },
  "core.org_units":       { columns: ["code", "name"] },
  "core.permissions":     { columns: ["code", "name"] },
  "core.roles":           { columns: ["name"] },
  "core.users":           { columns: ["display_name"] },
  "core.webhook_events":  { columns: ["event_type"] },
  "core.webhook_subscriptions": { columns: ["description"] },

  // === crm ===
  "crm.buying_groups":    { columns: ["code", "name"] },
  "crm.customer_groups":  { columns: ["code", "name"] },
  "crm.customers":        { columns: ["code", "name"] },
  "crm.trading_partner_contacts": { columns: ["first_name", "last_name"] },
  "crm.vendor_banking_details": { columns: ["bank_name", "account_number"] },
  "crm.vendor_groups":    { columns: ["code", "name"] },
  "crm.vendors":          { columns: ["code", "name"] },

  // === cashbook ===
  "cashbook.bank_accounts": { columns: ["account_name"] },

  // === finance ===
  "finance.accounting_periods": { columns: ["code", "name"] },
  "finance.bank_accounts":     { columns: ["account_name"] },
  "finance.budget_allocations": { columns: ["description"] },
  "finance.credit_notes":      { columns: ["credit_note_number"] },
  "finance.custom_dimension_members": { columns: ["code", "name"] },
  "finance.customer_debit_notes": { columns: ["debit_note_number"] },
  "finance.dimension_asset_members": { columns: ["code", "name"] },
  "finance.dimension_function_members": { columns: ["code", "name"] },
  "finance.dimension_market_members": { columns: ["code", "name"] },
  "finance.dimension_project_members": { columns: ["code", "name"] },
  "finance.dimension_rules":   { columns: ["dimension_name"] },
  "finance.dimension_types":   { columns: ["code", "name"] },
  "finance.fiscal_years":      { columns: ["name"] },
  "finance.gl_accounts":       { columns: ["code", "name"] },
  "finance.invoices":          { columns: ["invoice_number"] },
  "finance.journal_batches":   { columns: ["batch_number"] },
  "finance.journal_templates": { columns: ["name"] },
  "finance.payment_terms":     { columns: ["code", "name"] },
  "finance.provisions":        { columns: ["description"] },
  "finance.tax_codes":         { columns: ["code", "name"] },

  // === inventory ===
  "inventory.bins":            { columns: ["code", "name"] },
  "inventory.bom_headers":     { columns: ["bom_number"] },
  "inventory.cartons":         { columns: ["barcode"] },
  "inventory.devices":         { columns: ["device_name"] },
  "inventory.grn_headers":     { columns: ["grn_number"] },
  "inventory.locations":       { columns: ["code", "name"] },
  "inventory.location_types":  { columns: ["code", "name"] },
  "inventory.lot_batches":     { columns: ["lot_number"] },
  "inventory.pack_stations":   { columns: ["name"] },
  "inventory.product_groups":  { columns: ["code", "name"] },
  "inventory.products":        { columns: ["code", "name"] },
  "inventory.serial_numbers":  { columns: ["serial_number"] },
  "inventory.shipping_stations": { columns: ["name"] },
  "inventory.stock_adjustments": { columns: ["adjustment_number"] },
  "inventory.stock_counts":    { columns: ["count_number"] },
  "inventory.stock_transfers": { columns: ["transfer_number"] },
  "inventory.uom_groups":      { columns: ["name"] },
  "inventory.warehouses":      { columns: ["code", "name"] },

  // === procurement ===
  "procurement.purchase_orders": { columns: ["po_number"] },
  "procurement.supplier_credit_notes": { columns: ["credit_note_number"] },
  "procurement.supplier_debit_notes": { columns: ["debit_note_number"] },
  "procurement.supplier_invoices": { columns: ["invoice_number"] },

  // === sales ===
  "sales.contracts":        { columns: ["contract_number"] },
  "sales.dispatch_notes":   { columns: ["dispatch_number"] },
  "sales.pick_instructions": { columns: ["pick_number"] },
  "sales.promotions":       { columns: ["name"] },
  "sales.quotations":       { columns: ["quotation_number"] },
  "sales.rma_headers":      { columns: ["rma_number"] },
  "sales.sales_orders":     { columns: ["order_number"] },
  "sales.wave_picks":       { columns: ["wave_number"] },

  // === config ===
  "config.barcode_types":    { columns: ["name"] },
  "config.product_types":    { columns: ["name"] },
  "config.uom_descriptions": { columns: ["description"] },

  // === assets ===
  "assets.asset_classes":    { columns: ["code", "name"] },
  "assets.assets":           { columns: ["asset_number", "description"] },

  // === line-item / child tables (FK targets in jrny_fks.csv) ===
  "finance.bank_statements":  { columns: ["statement_number"] },
  "finance.forex_revaluations": { columns: ["description"] },
  "finance.journal_lines":    { columns: ["description"] },
  "inventory.cost_layers":    { columns: ["layer_number"] },
  "inventory.grn_lines":      { columns: ["line_number"] },
  "inventory.qr_mapper_templates": { columns: ["name"] },
  "procurement.purchase_order_items": { columns: ["line_number"] },
  "procurement.supplier_invoice_lines": { columns: ["line_number"] },
  "procurement.supplier_product_pricing": { columns: ["description"] },
  "sales.contract_lines":     { columns: ["line_number"] },
  "sales.sales_order_lines":  { columns: ["line_number"] },
};

// ---- Display column heuristics -----------------------------------------------

/** Priority-ordered list of common display column names. */
const DISPLAY_COLUMN_NAMES = [
  "name",
  "title",
  "description",
  "label",
  "display_name",
  "code",
];

/** Column types that are unlikely to be useful display columns. */
const SKIP_TYPES = ["uuid", "timestamp", "timestamptz", "date", "boolean", "bytea", "jsonb", "json"];

/**
 * Determine the best "display column" for a table using heuristics.
 *
 * Priority:
 *   0. Static FK_DISPLAY_MAP lookup (JRNY schema — covers ~80 tables)
 *   1. Columns with is_display_column flag (from COMMENT '... | display_column' tag)
 *   2. Common display column names (name, title, description, label, etc.)
 *   3. First non-ID text/varchar column
 *   4. First non-ID, non-UUID, non-timestamp column (regardless of type)
 *   5. Last resort: first column that isn't 'id'
 *
 * @param {Object} table - A schema table entry with name and columns array
 * @returns {string|string[]|null} The display column name(s), or null if none found.
 *   Returns a single string for one column, an array for multiple columns.
 */
export function resolveDisplayColumn(table) {
  if (!table || !table.columns) return null;

  const columns = table.columns;
  const tableName = get(table, "name", "");

  // 0. Check static FK_DISPLAY_MAP first (authoritative for known JRNY tables)
  const mapped = FK_DISPLAY_MAP[tableName];
  if (mapped && mapped.columns) {
    // Verify the mapped columns actually exist in the table's schema
    const validCols = mapped.columns.filter(mc =>
      columns.some(c => get(c, "name", "").toLowerCase() === mc.toLowerCase())
    );
    if (validCols.length === 1) return validCols[0];
    if (validCols.length > 1) return validCols;
    // If none of the mapped columns exist, fall through to heuristics
  }

  // 1. Check for is_display_column flag (set by backend from '| display_column' comment tag)
  const tagged = columns.filter(c => get(c, "is_display_column", false));
  if (tagged.length === 1) return get(tagged[0], "name");
  if (tagged.length > 1) return tagged.map(c => get(c, "name"));

  // 2. Check common display column name patterns
  // First pass: exact matches only (e.g., "name" column beats "branch_contact_name")
  for (const pattern of DISPLAY_COLUMN_NAMES) {
    const exactMatch = columns.find(c => {
      const colName = get(c, "name", "").toLowerCase();
      return colName === pattern;
    });
    if (exactMatch) return get(exactMatch, "name");
  }

  // Second pass: suffix matches only (e.g., "customer_name" when no exact "name" exists)
  for (const pattern of DISPLAY_COLUMN_NAMES) {
    const suffixMatch = columns.find(c => {
      const colName = get(c, "name", "").toLowerCase();
      return colName.endsWith(`_${pattern}`);
    });
    if (suffixMatch) return get(suffixMatch, "name");
  }

  // 3. Fall back to first text/varchar column that's not an ID
  const textCol = columns.find(c => {
    const colName = get(c, "name", "").toLowerCase();
    const colType = get(c, "type", "").toLowerCase();
    return (
      colName !== "id" &&
      !colName.endsWith("_id") &&
      (colType.includes("text") ||
        colType.includes("varchar") ||
        colType.includes("character varying") ||
        colType.includes("character"))
    );
  });
  if (textCol) return get(textCol, "name");

  // 4. First non-ID, non-UUID, non-timestamp column (regardless of type info)
  const broadCol = columns.find(c => {
    const colName = get(c, "name", "").toLowerCase();
    const colType = get(c, "type", "").toLowerCase();
    if (colName === "id" || colName.endsWith("_id")) return false;
    // Skip columns whose type is clearly non-display
    if (colType && SKIP_TYPES.some(t => colType.includes(t))) return false;
    return true;
  });
  if (broadCol) return get(broadCol, "name");

  // 5. Last resort: first column that isn't 'id' — partial resolution is better than none
  const anyCol = columns.find(c => {
    const colName = get(c, "name", "").toLowerCase();
    return colName !== "id" && !colName.endsWith("_id");
  });
  if (anyCol) return get(anyCol, "name");

  return null;
}

// ---- FK detection at cursor ---------------------------------------------------

/**
 * Convert Ace row/column position to a character offset.
 */
function posToOffset(session, pos) {
  let offset = 0;
  for (let row = 0; row < pos.row; row++) {
    offset += session.getLine(row).length + 1;
  }
  offset += pos.column;
  return offset;
}

/**
 * Find the full schema table name for a SQL table reference.
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
 * Generate a unique alias, avoiding conflicts.
 */
function generateAlias(tableName, existingAliases) {
  const shortName = tableName.includes(".")
    ? tableName.split(".").pop()
    : tableName;
  const parts = shortName.split("_");
  const taken = new Set(
    (existingAliases || []).map(a => (a || "").toLowerCase())
  );

  if (parts.length > 1) {
    const initials = parts.map(p => (p[0] || "")).join("");
    if (initials && !taken.has(initials.toLowerCase())) return initials;
  }
  if (shortName[0] && !taken.has(shortName[0].toLowerCase()))
    return shortName[0];
  for (let len = 2; len <= Math.min(shortName.length, 5); len++) {
    const cand = shortName.substring(0, len);
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  let num = 2;
  while (taken.has(`${shortName[0]}${num}`.toLowerCase())) num++;
  return `${shortName[0]}${num}`;
}

/**
 * Detect if the cursor is on an FK column in the query.
 *
 * @param {Object} editor    - Ace editor instance
 * @param {Array}  rawSchema - Raw schema array
 * @param {Object} fkGraph   - FK relationship graph (with displayColumn)
 * @returns {Object|null} FK info object, or null if not on an FK column
 */
export function detectFKAtCursor(editor, rawSchema, fkGraph) {
  if (!editor || !rawSchema || !fkGraph) return null;

  const session = editor.session;
  const pos = editor.getCursorPosition();
  const queryText = session.getValue();
  const cursorOffset = posToOffset(session, pos);

  try {
    // Parse the FULL query (not just up to cursor) to discover all tables in FROM clause.
    // The cursor position is only needed for getWordRange (line 156) which uses row/column directly.
    const ctx = parseSQLContext(queryText, queryText.length);
    if (!ctx.tables || ctx.tables.length === 0) return null;

    // Get the word under cursor
    const wordRange = session.getWordRange(pos.row, pos.column);
    let word = session.getTextRange(wordRange);
    if (!word) return null;

    // Check if cursor is on a dot-qualified reference (alias.column)
    const line = session.getLine(pos.row);
    let columnName = word;
    let tableAlias = null;
    let fullWord = word;

    // Look backward for a dot + qualifier
    const charBeforeWord = wordRange.start.column > 0
      ? line[wordRange.start.column - 1]
      : "";

    if (charBeforeWord === ".") {
      // Find the qualifier before the dot
      let qualStart = wordRange.start.column - 2;
      while (qualStart >= 0 && /[a-zA-Z0-9_]/.test(line[qualStart])) {
        qualStart--;
      }
      qualStart++;
      tableAlias = line.substring(qualStart, wordRange.start.column - 1);
      columnName = word;
      fullWord = `${tableAlias}.${word}`;
    }

    // Search through query tables for FK columns matching this word
    for (const tableRef of ctx.tables) {
      // If alias specified, match only that table
      if (tableAlias) {
        if (tableRef.alias !== tableAlias && tableRef.name !== tableAlias)
          continue;
      }

      const fullName = findSchemaTableName(tableRef, rawSchema);
      if (!fullName) continue;

      const edges = fkGraph[fullName];
      if (!edges) continue;

      for (const edge of edges) {
        const matchingPair = edge.joinPairs.find(
          p => p.thisCol === columnName
        );
        if (matchingPair) {
          return {
            edge,
            tableRef,
            columnName,
            fullWord,
            fullTableName: fullName,
            matchingPair,
            displayColumn: edge.displayColumn || null,
            relatedTable: edge.relatedTable,
            ctx,
            wordRange,
            queryText,
            rawSchema,
          };
        }
      }
    }
  } catch (e) {
    // Never throw
  }

  return null;
}

/**
 * Scan the SELECT clause for all FK columns and return their positions.
 * Used for adding inline markers/decorations.
 *
 * @param {Object} editor    - Ace editor instance
 * @param {Array}  rawSchema - Raw schema array
 * @param {Object} fkGraph   - FK relationship graph
 * @returns {Array} Array of {row, startCol, endCol, label, fkInfo} entries
 */
export function findFKColumnsInSelect(editor, rawSchema, fkGraph) {
  if (!editor || !rawSchema || !fkGraph) return [];

  const session = editor.session;
  const queryText = session.getValue();
  const markers = [];

  try {
    // Parse context at the end of query to get all tables
    const ctx = parseSQLContext(queryText, queryText.length);
    if (!ctx.tables || ctx.tables.length === 0) return [];

    // Build a map of FK columns from tables in the query
    const fkColumns = []; // [{tableRef, fullName, columnName, edge}]
    for (const tableRef of ctx.tables) {
      const fullName = findSchemaTableName(tableRef, rawSchema);
      if (!fullName) continue;
      const edges = fkGraph[fullName];
      if (!edges) continue;
      for (const edge of edges) {
        for (const pair of edge.joinPairs) {
          fkColumns.push({
            tableRef,
            fullName,
            columnName: pair.thisCol,
            alias: tableRef.alias || tableRef.name,
            edge,
          });
        }
      }
    }

    if (fkColumns.length === 0) return [];

    // Find SELECT clause boundaries
    const upperQuery = queryText.toUpperCase();
    const selectIdx = upperQuery.indexOf("SELECT");
    if (selectIdx < 0) return [];

    // Find end of SELECT clause (FROM keyword)
    const fromIdx = upperQuery.indexOf("\nFROM ", selectIdx);
    const fromIdx2 = upperQuery.indexOf(" FROM ", selectIdx);
    const selectEnd = Math.min(
      fromIdx >= 0 ? fromIdx : queryText.length,
      fromIdx2 >= 0 ? fromIdx2 : queryText.length
    );

    const selectText = queryText.substring(selectIdx, selectEnd);

    // Search for FK column references in the SELECT text.
    // Track matched positions to avoid duplicates: when a qualified match (e.g. o.customer_id)
    // exists, skip the unqualified match (customer_id) at the same position.
    const markedPositions = new Set(); // "row:col" keys

    for (const fk of fkColumns) {
      // Try qualified pattern first, then unqualified
      const patterns = [
        `${fk.alias}.${fk.columnName}`,
        fk.columnName,
      ];

      for (const pattern of patterns) {
        const regex = new RegExp(
          `\\b${pattern.replace(/\./g, "\\.")}\\b`,
          "gi"
        );
        let match;
        while ((match = regex.exec(selectText)) !== null) {
          const absPos = selectIdx + match.index;
          // Convert absolute position to row/col
          let row = 0;
          let col = 0;
          for (let i = 0; i < absPos; i++) {
            if (queryText[i] === "\n") {
              row++;
              col = 0;
            } else {
              col++;
            }
          }

          // Deduplicate: skip if a qualified match already covers this column at this position.
          // For unqualified patterns, check if a qualified match already exists that ends at the same endCol.
          const endCol = col + pattern.length;
          const posKey = `${row}:${endCol}:${fk.columnName}`;
          if (markedPositions.has(posKey)) {
            break; // Already have a (qualified) marker for this FK column at this position
          }
          markedPositions.add(posKey);

          const shortRelated = fk.edge.relatedTable.includes(".")
            ? fk.edge.relatedTable.split(".").pop()
            : fk.edge.relatedTable;

          const dc = fk.edge.displayColumn;
          let label;
          if (dc) {
            const dcList = Array.isArray(dc) ? dc : [dc];
            label = `Resolve → Show ${dcList.map(c => `${shortRelated}.${c}`).join(", ")}`;
          } else {
            label = `Resolve → JOIN ${shortRelated}`;
          }

          // columnStartCol: where the actual column name begins (after qualifier + dot)
          const dotIdx = pattern.indexOf(".");
          const columnStartCol = dotIdx >= 0 ? col + dotIdx + 1 : col;

          markers.push({
            row,
            startCol: col,
            endCol,
            columnStartCol,
            label,
            fkInfo: fk,
          });
          break; // Only mark first occurrence per pattern
        }
      }
    }
  } catch (e) {
    // Never throw
  }

  return markers;
}

// ---- Column qualification -------------------------------------------------------

/**
 * Build a map of column names to their owning table qualifiers.
 * For each table in the query, looks up its schema entry and records which
 * columns belong to it.
 *
 * @param {Array} tables    - Table refs from parseSQLContext
 * @param {Array} rawSchema - Raw schema data
 * @returns {Map<string, Array<{qualifier: string, tableName: string}>>}
 *   Map from lowercase column name to array of owning tables
 */
function buildColumnOwnerMap(tables, rawSchema) {
  const colMap = new Map(); // lowerColName -> [{qualifier, tableName}]

  for (const tableRef of tables) {
    const qualifier = tableRef.alias || tableRef.name;
    const fullName = findSchemaTableName(tableRef, rawSchema);
    if (!fullName) continue;

    const schemaItem = rawSchema.find(s => s.name === fullName);
    if (!schemaItem || !schemaItem.columns) continue;

    for (const col of schemaItem.columns) {
      const colName = get(col, "name", "");
      if (!colName) continue;
      const lower = colName.toLowerCase();
      if (!colMap.has(lower)) {
        colMap.set(lower, []);
      }
      colMap.get(lower).push({ qualifier, tableName: fullName });
    }
  }

  return colMap;
}

/**
 * Parse the SELECT clause into individual column expressions.
 * Handles commas inside parentheses (function calls) and AS aliases.
 *
 * @param {string} selectText - The text between SELECT and FROM
 * @returns {Array<{expr: string, start: number, end: number, alias: string|null}>}
 */
function parseSelectColumns(selectText) {
  const cols = [];
  let depth = 0;
  let start = 0;

  // Skip leading DISTINCT/ALL
  const trimmed = selectText.trimStart();
  const offset = selectText.length - trimmed.length;
  const upperTrimmed = trimmed.toUpperCase();
  let scanStart = offset;
  if (upperTrimmed.startsWith("DISTINCT ")) {
    scanStart = offset + 9;
  } else if (upperTrimmed.startsWith("ALL ")) {
    scanStart = offset + 4;
  }

  start = scanStart;

  for (let i = scanStart; i <= selectText.length; i++) {
    const ch = i < selectText.length ? selectText[i] : ","; // virtual comma at end
    if (ch === "(") { depth++; continue; }
    if (ch === ")") { depth--; continue; }
    if (ch === "," && depth === 0) {
      const expr = selectText.substring(start, i).trim();
      if (expr.length > 0) {
        cols.push({ expr, start, end: i });
      }
      start = i + 1;
    }
  }

  return cols;
}

/**
 * Extract the column reference from a SELECT expression.
 * Handles: "col", "t.col", "col AS alias", "t.col AS alias",
 * "FUNC(col)", "COALESCE(col, 'x') AS alias"
 *
 * Returns info about whether it's already qualified and the bare column name.
 */
function analyzeSelectExpr(expr) {
  const trimmed = expr.trim();

  // Check for AS alias - find the last " AS " (case-insensitive) that's not inside parens
  let aliasKeywordIdx = -1;
  let depth = 0;
  const upper = trimmed.toUpperCase();
  for (let i = 0; i < trimmed.length - 3; i++) {
    if (trimmed[i] === "(") { depth++; continue; }
    if (trimmed[i] === ")") { depth--; continue; }
    if (depth === 0 && upper.substring(i, i + 4) === " AS " && /\s/.test(trimmed[i])) {
      aliasKeywordIdx = i;
    }
  }

  let mainExpr = trimmed;
  let alias = null;
  if (aliasKeywordIdx >= 0) {
    mainExpr = trimmed.substring(0, aliasKeywordIdx).trim();
    alias = trimmed.substring(aliasKeywordIdx + 4).trim();
  }

  // Check if it's a simple column reference (possibly qualified)
  const simpleColRe = /^([a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)$/;
  const simpleMatch = mainExpr.match(simpleColRe);
  if (simpleMatch) {
    return {
      type: "simple",
      qualifier: simpleMatch[1] ? simpleMatch[1].slice(0, -1) : null, // remove trailing dot
      columnName: simpleMatch[2],
      mainExpr,
      alias,
      fullExpr: trimmed,
    };
  }

  // It's a complex expression (function call, CASE, arithmetic, etc.)
  // We'll try to qualify column references inside it
  return {
    type: "complex",
    qualifier: null,
    columnName: null,
    mainExpr,
    alias,
    fullExpr: trimmed,
  };
}

/**
 * Qualify column references inside a complex expression (function calls, etc.)
 * Only qualifies identifiers that match known column names and aren't SQL keywords.
 *
 * @param {string} expr - The expression text
 * @param {Map} colMap  - Column owner map from buildColumnOwnerMap
 * @param {string} baseQualifier - The base table's qualifier (alias or name)
 * @returns {string} The expression with qualified column references
 */
function qualifyExpressionColumns(expr, colMap, baseQualifier) {
  // Match word-boundary identifiers, but skip those that are already qualified (preceded by a dot)
  // or that are SQL keywords/functions
  return expr.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match, ident, offset) => {
    // Skip if preceded by a dot (already qualified like t.col)
    if (offset > 0 && expr[offset - 1] === ".") return match;
    // Skip if followed by a dot (it's a qualifier itself like t.col)
    if (offset + match.length < expr.length && expr[offset + match.length] === ".") return match;
    // Skip if followed by "(" (it's a function name)
    const afterMatch = expr.substring(offset + match.length).trimStart();
    if (afterMatch.startsWith("(")) return match;
    // Skip SQL keywords
    if (isKnownKeyword(ident)) return match;
    // Skip string/number literals
    if (/^\d/.test(ident)) return match;

    const lower = ident.toLowerCase();
    const owners = colMap.get(lower);
    if (!owners || owners.length === 0) return match;

    // If only one table has this column, use that table's qualifier
    if (owners.length === 1) {
      return `${owners[0].qualifier}.${ident}`;
    }

    // Ambiguous: prefer the base table
    const baseOwner = owners.find(o => o.qualifier === baseQualifier);
    if (baseOwner) {
      return `${baseOwner.qualifier}.${ident}`;
    }

    // Fall back to first owner
    return `${owners[0].qualifier}.${ident}`;
  });
}

/**
 * Check if a string is a known SQL keyword (should not be qualified).
 */
const QUALIFY_SKIP_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "JOIN", "ON", "AND", "OR", "NOT", "IN", "EXISTS",
  "BETWEEN", "LIKE", "ILIKE", "IS", "NULL", "TRUE", "FALSE", "CASE", "WHEN",
  "THEN", "ELSE", "END", "AS", "ORDER", "BY", "GROUP", "HAVING", "LIMIT",
  "OFFSET", "UNION", "ALL", "INTERSECT", "EXCEPT", "DISTINCT", "ASC", "DESC",
  "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "NATURAL",
  "CAST", "COALESCE", "GREATEST", "LEAST", "EXTRACT", "FILTER",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "UPPER", "LOWER", "TRIM",
  "CONCAT", "LENGTH", "SUBSTRING", "REPLACE", "ROUND", "CEIL", "FLOOR",
  "NOW", "CURRENT_DATE", "CURRENT_TIMESTAMP", "DATE_TRUNC", "DATE_PART",
  "TO_CHAR", "TO_DATE", "TO_NUMBER", "TO_TIMESTAMP",
  "NULLS", "FIRST", "LAST", "OVER", "PARTITION", "ROWS", "RANGE",
  "PRECEDING", "FOLLOWING", "UNBOUNDED", "CURRENT", "ROW",
  "BOOLEAN", "INTEGER", "TEXT", "VARCHAR", "NUMERIC", "DATE", "TIMESTAMP",
  "INTERVAL", "JSON", "JSONB", "UUID", "ARRAY",
]);

function isKnownKeyword(word) {
  return QUALIFY_SKIP_KEYWORDS.has(word.toUpperCase());
}

/**
 * Qualify unqualified column names in the SELECT clause with their table prefix.
 * This prevents ambiguity when JOINs are added.
 *
 * @param {string}  queryText  - The full SQL query text
 * @param {Array}   rawSchema  - Raw schema data
 * @returns {string} The query text with qualified column names, or original if no changes
 */
export function qualifySelectColumns(queryText, rawSchema) {
  if (!queryText || !rawSchema) return queryText;

  try {
    // Parse context to get tables
    const ctx = parseSQLContext(queryText, queryText.length);
    if (!ctx.tables || ctx.tables.length === 0) return queryText;

    // Build column ownership map
    const colMap = buildColumnOwnerMap(ctx.tables, rawSchema);
    if (colMap.size === 0) return queryText;

    // Find SELECT clause boundaries
    const upperQuery = queryText.toUpperCase();
    const selectIdx = upperQuery.indexOf("SELECT");
    if (selectIdx < 0) return queryText;

    // Skip past SELECT keyword
    const afterSelect = selectIdx + 6; // "SELECT".length

    // Find end of SELECT clause (FROM keyword at depth 0)
    let fromIdx = -1;
    let depth = 0;
    for (let i = afterSelect; i < queryText.length - 3; i++) {
      if (queryText[i] === "(") { depth++; continue; }
      if (queryText[i] === ")") { depth--; continue; }
      if (depth === 0 && upperQuery.substring(i, i + 4) === "FROM") {
        // Verify word boundaries
        const before = i > 0 ? queryText[i - 1] : " ";
        const after = i + 4 < queryText.length ? queryText[i + 4] : " ";
        if (!/[a-zA-Z0-9_]/.test(before) && !/[a-zA-Z0-9_]/.test(after)) {
          fromIdx = i;
          break;
        }
      }
    }

    if (fromIdx < 0) return queryText;

    const selectText = queryText.substring(afterSelect, fromIdx);

    // Determine the base table qualifier (first table in FROM clause)
    const baseTable = ctx.tables[0];
    const baseQualifier = baseTable ? (baseTable.alias || baseTable.name) : null;
    if (!baseQualifier) return queryText;

    // Parse SELECT columns
    const columns = parseSelectColumns(selectText);
    if (columns.length === 0) return queryText;

    // Process columns right-to-left to preserve offsets
    let result = queryText;
    for (let ci = columns.length - 1; ci >= 0; ci--) {
      const col = columns[ci];
      const info = analyzeSelectExpr(col.expr);

      if (info.type === "simple") {
        // Skip if already qualified
        if (info.qualifier) continue;

        // Skip * (SELECT *)
        if (info.columnName === "*") continue;

        // Look up which table owns this column
        const lower = info.columnName.toLowerCase();
        const owners = colMap.get(lower);
        if (!owners || owners.length === 0) continue; // Unknown column, leave as-is

        let qualifier;
        if (owners.length === 1) {
          qualifier = owners[0].qualifier;
        } else {
          // Ambiguous: use base table
          const baseOwner = owners.find(o => o.qualifier === baseQualifier);
          qualifier = baseOwner ? baseOwner.qualifier : owners[0].qualifier;
        }

        // Build new expression
        const qualifiedExpr = info.alias
          ? `${qualifier}.${info.columnName} AS ${info.alias}`
          : `${qualifier}.${info.columnName}`;

        // Replace in the SELECT text portion
        const absStart = afterSelect + col.start;
        const absEnd = afterSelect + col.end;
        const originalChunk = result.substring(absStart, absEnd);

        // Find the expression within the chunk (accounting for whitespace)
        const exprIdx = originalChunk.indexOf(col.expr);
        if (exprIdx >= 0) {
          const replaceStart = absStart + exprIdx;
          const replaceEnd = replaceStart + col.expr.length;
          result =
            result.substring(0, replaceStart) +
            qualifiedExpr +
            result.substring(replaceEnd);
        }
      } else if (info.type === "complex") {
        // Try to qualify column references inside the expression
        const qualifiedMain = qualifyExpressionColumns(info.mainExpr, colMap, baseQualifier);
        if (qualifiedMain !== info.mainExpr) {
          const newExpr = info.alias
            ? `${qualifiedMain} AS ${info.alias}`
            : qualifiedMain;

          const absStart = afterSelect + col.start;
          const absEnd = afterSelect + col.end;
          const originalChunk = result.substring(absStart, absEnd);

          const exprIdx = originalChunk.indexOf(col.expr);
          if (exprIdx >= 0) {
            const replaceStart = absStart + exprIdx;
            const replaceEnd = replaceStart + col.expr.length;
            result =
              result.substring(0, replaceStart) +
              newExpr +
              result.substring(replaceEnd);
          }
        }
      }
    }

    return result;
  } catch (e) {
    // Never break the editor
    return queryText;
  }
}

/**
 * Apply FK resolution: add the display column and JOIN to the query.
 *
 * @param {Object} editor  - Ace editor instance
 * @param {Object} fkInfo  - FK info object from detectFKAtCursor()
 * @param {Function} onChange - Callback to notify the parent of the change
 */
export function applyFKResolution(editor, fkInfo, onChange) {
  if (!editor || !fkInfo) return;

  const { edge, tableRef, fullWord, ctx, queryText } = fkInfo;

  const existingAliases = ctx.tables.map(t => t.alias || t.name);
  const existingQualifier = tableRef.alias || tableRef.name;

  // Check if the referenced table is already joined
  const joinedRef = ctx.tables.find(t => {
    const fn = findSchemaTableName(t, fkInfo.rawSchema || []);
    return fn === edge.relatedTable;
  });

  let newAlias;
  if (joinedRef) {
    newAlias = joinedRef.alias || joinedRef.name;
  } else {
    newAlias = generateAlias(edge.relatedTable, existingAliases);
  }

  let newQueryText = queryText;

  // 1. Add display column(s) after the FK column in SELECT (only if displayColumn is available)
  if (edge.displayColumn) {
    // Normalize to array for uniform handling (supports multi-column display)
    const displayCols = Array.isArray(edge.displayColumn)
      ? edge.displayColumn
      : [edge.displayColumn];

    const fkColShort = fkInfo.columnName.replace(/_id$/, "");

    // Build display references and aliases for each display column
    const displayEntries = displayCols.map(dc => ({
      ref: `${newAlias}.${dc}`,
      alias: `${fkColShort}_${dc}`,
    }));

    // Find the FK column reference near the cursor
    const searchStart = Math.max(0, queryText.indexOf(fullWord));
    const replaceIdx = queryText.indexOf(fullWord, searchStart);

    if (replaceIdx >= 0) {
      const afterFK = replaceIdx + fullWord.length;

      // Detect whether the SELECT clause is multi-line by checking if a newline
      // exists between SELECT and the FK column position.
      const textBeforeFK = newQueryText.substring(0, replaceIdx);
      const lastNewline = textBeforeFK.lastIndexOf("\n");
      const isMultiLine = lastNewline >= 0 && lastNewline > textBeforeFK.toUpperCase().lastIndexOf("SELECT");

      if (isMultiLine) {
        // Multi-line SELECT: detect the indentation of the FK column's line
        const lineStart = lastNewline + 1;
        const lineContent = textBeforeFK.substring(lineStart);
        const indentMatch = lineContent.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : "  ";

        // Check if there's a trailing comma immediately after the FK column word
        const afterFKText = newQueryText.substring(afterFK);
        const commaMatch = afterFKText.match(/^(\s*),/);

        if (commaMatch) {
          // Trailing comma style (e.g., "  customer_id,\n  status")
          // Insert display column(s) on new lines AFTER the existing comma
          const commaEnd = afterFK + commaMatch[0].length;
          const insertText = displayEntries
            .map(e => `\n${indent}${e.ref} AS ${e.alias},`)
            .join("");
          newQueryText =
            newQueryText.substring(0, commaEnd) +
            insertText +
            newQueryText.substring(commaEnd);
        } else {
          // No trailing comma (last column before FROM): add comma + new lines
          const insertText = displayEntries
            .map((e, i) => {
              const isLast = i === displayEntries.length - 1;
              return isLast
                ? `\n${indent}${e.ref} AS ${e.alias}`
                : `\n${indent}${e.ref} AS ${e.alias},`;
            })
            .join("");
          newQueryText =
            newQueryText.substring(0, afterFK) +
            `,${insertText}` +
            newQueryText.substring(afterFK);
        }
      } else {
        // Single-line SELECT: insert with comma + space (no newline)
        const insertText = displayEntries.map(e => `${e.ref} AS ${e.alias}`).join(", ");
        newQueryText =
          newQueryText.substring(0, afterFK) +
          `, ${insertText}` +
          newQueryText.substring(afterFK);
      }
    }
  }

  // 2. Add JOIN if not already present
  if (!joinedRef) {
    const onParts = edge.joinPairs.map(
      p => `${existingQualifier}.${p.thisCol} = ${newAlias}.${p.otherCol}`
    );
    const onClause = onParts.join(" AND ");
    const joinClause = `\nLEFT JOIN ${edge.relatedTable} ${newAlias} ON ${onClause}`;

    // Find insertion point: before WHERE, GROUP BY, ORDER BY, etc.
    const insertKeywords = [
      "WHERE",
      "GROUP\\s+BY",
      "ORDER\\s+BY",
      "HAVING",
      "LIMIT",
      "OFFSET",
      "UNION",
      "INTERSECT",
      "EXCEPT",
    ];

    let insertPos = newQueryText.length;
    for (const kw of insertKeywords) {
      const regex = new RegExp(`\\b${kw}\\b`, "gi");
      const match = regex.exec(newQueryText);
      if (match && match.index < insertPos) {
        insertPos = match.index;
      }
    }

    // Insert before the found keyword (or at end of query)
    newQueryText =
      newQueryText.substring(0, insertPos) +
      joinClause +
      (insertPos < newQueryText.length ? "\n" : "") +
      newQueryText.substring(insertPos);

    // 3. Auto-qualify unqualified SELECT columns to prevent ambiguity from the new JOIN
    const rawSchema = fkInfo.rawSchema || [];
    if (rawSchema.length > 0) {
      newQueryText = qualifySelectColumns(newQueryText, rawSchema);
    }
  }

  // Apply the change to the editor
  editor.setValue(newQueryText, -1);

  // Trigger onChange callback
  if (onChange) {
    onChange(newQueryText);
  }
}
