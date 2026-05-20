/**
 * Smart Query Snippets & Templates Module
 *
 * Provides SQL pattern snippets, type-aware column completions,
 * SELECT * expansion, and JRNY-specific query templates.
 */

import { get } from "lodash";

// ---- SQL Pattern Snippets -------------------------------------------------------
// Registered with Ace's snippet completer via tabTrigger.
// Uses Ace snippet syntax: ${1:default} for tab-stop placeholders.

export const SQL_SNIPPETS = [
  // --- Aggregate patterns ---
  {
    name: "countby: COUNT with GROUP BY",
    tabTrigger: "countby",
    content:
      "SELECT ${1:column}, COUNT(*) AS count\nFROM ${2:table}\nGROUP BY ${1:column}\nORDER BY count DESC",
  },
  {
    name: "sumby: SUM with GROUP BY",
    tabTrigger: "sumby",
    content:
      "SELECT ${1:group_column}, SUM(${2:value_column}) AS total\nFROM ${3:table}\nGROUP BY ${1:group_column}\nORDER BY total DESC",
  },
  {
    name: "avgby: AVG with GROUP BY",
    tabTrigger: "avgby",
    content:
      "SELECT ${1:group_column}, AVG(${2:value_column}) AS average\nFROM ${3:table}\nGROUP BY ${1:group_column}\nORDER BY average DESC",
  },

  // --- Date patterns ---
  {
    name: "datetrunc: date_trunc aggregation",
    tabTrigger: "datetrunc",
    content:
      "SELECT date_trunc('${1:month}', ${2:date_column}) AS period, COUNT(*) AS count\nFROM ${3:table}\nGROUP BY period\nORDER BY period",
  },
  {
    name: "daterange: BETWEEN date range",
    tabTrigger: "daterange",
    content:
      "${1:date_column} BETWEEN '${2:2024-01-01}'::date AND '${3:2024-12-31}'::date",
  },

  // --- CASE WHEN ---
  {
    name: "casewhen: CASE WHEN template",
    tabTrigger: "casewhen",
    content:
      "CASE\n  WHEN ${1:condition} THEN ${2:result}\n  ELSE ${3:default}\nEND AS ${4:alias}",
  },

  // --- Window functions ---
  {
    name: "rownum: ROW_NUMBER window function",
    tabTrigger: "rownum",
    content:
      "ROW_NUMBER() OVER (PARTITION BY ${1:partition_col} ORDER BY ${2:order_col}) AS row_num",
  },
  {
    name: "lag: LAG window function",
    tabTrigger: "lag",
    content:
      "LAG(${1:column}, ${2:1}) OVER (ORDER BY ${3:order_col}) AS prev_value",
  },
  {
    name: "lead: LEAD window function",
    tabTrigger: "lead",
    content:
      "LEAD(${1:column}, ${2:1}) OVER (ORDER BY ${3:order_col}) AS next_value",
  },
  {
    name: "runningtotal: Running total",
    tabTrigger: "runningtotal",
    content:
      "SUM(${1:amount}) OVER (ORDER BY ${2:date_col}) AS running_total",
  },

  // --- Common SQL patterns ---
  {
    name: "cte: Common Table Expression (WITH)",
    tabTrigger: "cte",
    content:
      "WITH ${1:cte_name} AS (\n  SELECT ${2:columns}\n  FROM ${3:table}\n  WHERE ${4:condition}\n)\nSELECT *\nFROM ${1:cte_name}",
  },
  {
    name: "existsq: EXISTS subquery",
    tabTrigger: "existsq",
    content:
      "EXISTS (\n  SELECT 1\n  FROM ${1:table}\n  WHERE ${2:condition}\n)",
  },
  {
    name: "coalesce: COALESCE null handler",
    tabTrigger: "coalesce",
    content: "COALESCE(${1:column}, ${2:default_value})",
  },
  {
    name: "distinctcount: COUNT DISTINCT",
    tabTrigger: "distinctcount",
    content: "COUNT(DISTINCT ${1:column}) AS distinct_count",
  },
  {
    name: "paginateq: LIMIT OFFSET pagination",
    tabTrigger: "paginateq",
    content: "LIMIT ${1:25} OFFSET ${2:0}",
  },
];

// ---- JRNY-specific template queries ----

export const JRNY_TEMPLATES = [
  {
    name: "tmpl_sales_period: Sales by Period",
    tabTrigger: "tmpl_sales_period",
    content: [
      "SELECT",
      "  date_trunc('${1:month}', i.invoice_date) AS period,",
      "  COUNT(*) AS invoice_count,",
      "  SUM(i.total_amount) AS total_sales",
      "FROM finance.invoices i",
      "WHERE i.invoice_date >= NOW() - INTERVAL '${2:12 months}'",
      "GROUP BY period",
      "ORDER BY period",
    ].join("\n"),
  },
  {
    name: "tmpl_outstanding: Outstanding Purchase Orders",
    tabTrigger: "tmpl_outstanding",
    content: [
      "SELECT",
      "  po.order_number,",
      "  c.first_name || ' ' || c.last_name AS supplier,",
      "  po.order_date,",
      "  po.total_amount,",
      "  po.status",
      "FROM procurement.purchase_orders po",
      "LEFT JOIN core.contacts c ON po.supplier_id = c.id",
      "WHERE po.status NOT IN ('completed', 'cancelled')",
      "ORDER BY po.order_date DESC",
    ].join("\n"),
  },
  {
    name: "tmpl_inventory: Inventory Valuation",
    tabTrigger: "tmpl_inventory",
    content: [
      "SELECT",
      "  p.name AS product,",
      "  p.sku,",
      "  sl.quantity_on_hand,",
      "  sl.unit_cost,",
      "  sl.quantity_on_hand * sl.unit_cost AS total_value",
      "FROM inventory.stock_levels sl",
      "JOIN inventory.products p ON sl.product_id = p.id",
      "ORDER BY total_value DESC",
    ].join("\n"),
  },
  {
    name: "tmpl_customers: Customer Listing with Invoices",
    tabTrigger: "tmpl_customers",
    content: [
      "SELECT",
      "  c.first_name || ' ' || c.last_name AS customer,",
      "  c.email,",
      "  COUNT(i.id) AS invoice_count,",
      "  COALESCE(SUM(i.total_amount), 0) AS total_billed",
      "FROM core.contacts c",
      "LEFT JOIN finance.invoices i ON i.customer_id = c.id",
      "GROUP BY c.id, c.first_name, c.last_name, c.email",
      "ORDER BY total_billed DESC",
    ].join("\n"),
  },
  {
    name: "tmpl_cashflow: Cashbook Transactions Summary",
    tabTrigger: "tmpl_cashflow",
    content: [
      "SELECT",
      "  ba.account_name,",
      "  date_trunc('${1:month}', t.transaction_date) AS period,",
      "  SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS inflows,",
      "  SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) AS outflows,",
      "  SUM(t.amount) AS net",
      "FROM cashbook.transactions t",
      "JOIN cashbook.bank_accounts ba ON t.bank_account_id = ba.id",
      "GROUP BY ba.account_name, period",
      "ORDER BY ba.account_name, period",
    ].join("\n"),
  },
];

// ---- Type classification --------------------------------------------------------

/**
 * Classify a PostgreSQL data type into a category for smart suggestions.
 */
function getTypeCategory(type) {
  if (!type) return "unknown";
  const t = type.toLowerCase();
  if (/date|time|timestamp|interval/.test(t)) return "date";
  if (
    /int|numeric|decimal|float|double|real|serial|money|smallint|bigint/.test(t)
  )
    return "numeric";
  if (/text|varchar|character|char/.test(t)) return "text";
  if (/bool/.test(t)) return "boolean";
  return "other";
}

// ---- Type-aware completions -----------------------------------------------------

/**
 * Build type-aware function suggestions for columns based on their data type
 * and the current SQL clause.
 *
 * @param {string} clause       - Current SQL clause (SELECT, WHERE, etc.)
 * @param {Array}  rawSchema    - Raw schema data
 * @param {Array}  tables       - Referenced tables from SQL context
 * @returns {Array} Additional completion items
 */
export function buildTypeAwareSuggestions(clause, rawSchema, tables) {
  if (!rawSchema || !tables || tables.length === 0) return [];

  const suggestions = [];
  const upperClause = (clause || "").toUpperCase();

  // Gather column metadata from referenced tables
  const columnMeta = []; // [{name, type, qualifier}]
  tables.forEach(ref => {
    const matched = rawSchema.find(s => {
      if (s.name === ref.name) return true;
      if (ref.schema && s.name === `${ref.schema}.${ref.name}`) return true;
      if (s.name.endsWith(`.${ref.name}`)) return true;
      return false;
    });
    if (!matched) return;

    matched.columns.forEach(c => {
      const name = get(c, "name", c);
      const type = get(c, "type", "");
      const qualifier = ref.alias || ref.name;
      columnMeta.push({ name, type, qualifier });
    });
  });

  if (columnMeta.length === 0) return [];

  if (upperClause === "SELECT") {
    columnMeta.forEach(col => {
      const cat = getTypeCategory(col.type);
      const q = col.qualifier ? `${col.qualifier}.${col.name}` : col.name;

      if (cat === "numeric") {
        suggestions.push(
          {
            name: `SUM(${col.name})`,
            value: `SUM(${q})`,
            score: 160,
            meta: "Aggregate",
          },
          {
            name: `AVG(${col.name})`,
            value: `AVG(${q})`,
            score: 155,
            meta: "Aggregate",
          },
          {
            name: `MAX(${col.name})`,
            value: `MAX(${q})`,
            score: 150,
            meta: "Aggregate",
          },
          {
            name: `MIN(${col.name})`,
            value: `MIN(${q})`,
            score: 150,
            meta: "Aggregate",
          }
        );
      } else if (cat === "date") {
        suggestions.push(
          {
            name: `date_trunc('month', ${col.name})`,
            value: `date_trunc('month', ${q})`,
            score: 160,
            meta: "Date fn",
          },
          {
            name: `date_trunc('week', ${col.name})`,
            value: `date_trunc('week', ${q})`,
            score: 155,
            meta: "Date fn",
          },
          {
            name: `EXTRACT(year FROM ${col.name})`,
            value: `EXTRACT(year FROM ${q})`,
            score: 150,
            meta: "Date fn",
          }
        );
      } else if (cat === "text") {
        suggestions.push(
          {
            name: `COUNT(DISTINCT ${col.name})`,
            value: `COUNT(DISTINCT ${q})`,
            score: 155,
            meta: "Aggregate",
          },
          {
            name: `LOWER(${col.name})`,
            value: `LOWER(${q})`,
            score: 140,
            meta: "Text fn",
          }
        );
      }
    });
  } else if (upperClause === "WHERE") {
    columnMeta.forEach(col => {
      const cat = getTypeCategory(col.type);
      const q = col.qualifier ? `${col.qualifier}.${col.name}` : col.name;

      if (cat === "date") {
        suggestions.push(
          {
            name: `${col.name} recent 30 days`,
            value: `${q} >= NOW() - INTERVAL '30 days'`,
            score: 160,
            meta: "Date filter",
          },
          {
            name: `${col.name} this month`,
            value: `date_trunc('month', ${q}) = date_trunc('month', CURRENT_DATE)`,
            score: 155,
            meta: "Date filter",
          },
          {
            name: `${col.name} BETWEEN dates`,
            value: `${q} BETWEEN '2024-01-01'::date AND '2024-12-31'::date`,
            score: 150,
            meta: "Date filter",
          }
        );
      } else if (cat === "text") {
        suggestions.push(
          {
            name: `${col.name} ILIKE`,
            value: `${q} ILIKE '%%'`,
            score: 160,
            meta: "Text filter",
          },
          {
            name: `${col.name} IS NOT NULL`,
            value: `${q} IS NOT NULL`,
            score: 150,
            meta: "Null check",
          },
          {
            name: `LOWER(${col.name}) =`,
            value: `LOWER(${q}) = LOWER('')`,
            score: 145,
            meta: "Text filter",
          }
        );
      } else if (cat === "numeric") {
        suggestions.push(
          {
            name: `${col.name} > 0`,
            value: `${q} > 0`,
            score: 155,
            meta: "Numeric filter",
          },
          {
            name: `${col.name} BETWEEN`,
            value: `${q} BETWEEN 0 AND 100`,
            score: 150,
            meta: "Range filter",
          },
          {
            name: `${col.name} IS NOT NULL`,
            value: `${q} IS NOT NULL`,
            score: 145,
            meta: "Null check",
          }
        );
      } else if (cat === "boolean") {
        suggestions.push(
          {
            name: `${col.name} = true`,
            value: `${q} = true`,
            score: 160,
            meta: "Bool filter",
          },
          {
            name: `${col.name} = false`,
            value: `${q} = false`,
            score: 155,
            meta: "Bool filter",
          }
        );
      }
    });
  }

  return suggestions;
}

// ---- SELECT * expansion ---------------------------------------------------------

/**
 * Expand SELECT * to the full column list for a given table.
 *
 * @param {Object} editor    - Ace editor instance
 * @param {Array}  rawSchema - Raw schema data
 * @returns {boolean} true if expansion was applied
 */
export function expandSelectStar(editor, rawSchema) {
  if (!editor || !rawSchema) return false;

  const session = editor.session;
  const queryText = session.getValue();

  // Match SELECT * FROM <table>
  const match = queryText.match(
    /\bSELECT\s+(\*)\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_.]*)/i
  );
  if (!match) return false;

  const starIndex = queryText.indexOf(match[1], match.index);
  const tableName = match[2];

  // Find the table in schema
  const matchedTable = rawSchema.find(s => {
    if (s.name === tableName) return true;
    if (s.name.endsWith(`.${tableName}`)) return true;
    return false;
  });

  if (!matchedTable || !matchedTable.columns || matchedTable.columns.length === 0)
    return false;

  // Build column list
  const colNames = matchedTable.columns.map(c => get(c, "name", c));
  const expanded = colNames.join(",\n  ");

  // Replace * with expanded column list
  // Convert starIndex to row/col
  let row = 0;
  let col = 0;
  for (let i = 0; i < starIndex; i++) {
    if (queryText[i] === "\n") {
      row++;
      col = 0;
    } else {
      col++;
    }
  }

  const Range = ace.acequire("ace/range").Range;
  const range = new Range(row, col, row, col + 1); // * is 1 char
  session.replace(range, expanded);

  return true;
}

// ---- SELECT * position detection for inline hints --------------------------------

/**
 * Find all SELECT * FROM <table> patterns in the query and return their positions.
 * Used by the editor to add inline markers and hints for discoverability.
 *
 * @param {string} queryText - The full query text from the editor
 * @param {Array}  rawSchema - Raw schema data for resolving table names
 * @returns {Array} Array of { row, col, tableName, columnCount, fullTableName }
 */
export function findSelectStarPositions(queryText, rawSchema) {
  if (!queryText || !rawSchema) return [];

  const results = [];
  const regex = /\bSELECT\s+(\*)\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi;
  let m;

  while ((m = regex.exec(queryText)) !== null) {
    // Find the position of * within this match
    const selectKeyword = m[0];
    const starOffset = selectKeyword.search(/\*/);
    const starIndex = m.index + starOffset;

    const tableName = m[2];

    // Resolve table in schema
    const matchedTable = rawSchema.find(s => {
      if (s.name === tableName) return true;
      if (s.name.endsWith(`.${tableName}`)) return true;
      return false;
    });

    const columnCount =
      matchedTable && matchedTable.columns ? matchedTable.columns.length : 0;
    const fullTableName = matchedTable ? matchedTable.name : tableName;

    // Convert absolute offset to row/col
    let row = 0;
    let col = 0;
    for (let i = 0; i < starIndex; i++) {
      if (queryText[i] === "\n") {
        row++;
        col = 0;
      } else {
        col++;
      }
    }

    results.push({ row, col, tableName, fullTableName, columnCount });
  }

  return results;
}

// ---- Helpers needed by expandSelectStar -----------------------------------------
import ace from "ace-builds";
