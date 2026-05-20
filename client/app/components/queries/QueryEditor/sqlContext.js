/**
 * SQL Context Parser for cursor-position-aware autocompletion.
 *
 * Provides a lightweight, forgiving tokenizer/parser that analyses SQL text
 * up to a given cursor position and returns:
 *   - clause   : the SQL clause the cursor is currently inside
 *   - tables   : all table references found so far (with optional schema + alias)
 *   - currentPrefix : the partial identifier the user is typing at the cursor
 *
 * Design goals:
 *   1. Work with *incomplete* SQL (the user is still typing).
 *   2. Never throw - return a best-effort result instead.
 *   3. Stay small - no heavyweight AST parser dependency.
 */

// ---- constants ----------------------------------------------------------------

/** Ordered list of clause keywords we recognise (longest match first). */
const CLAUSE_KEYWORDS = [
  "ORDER BY",
  "GROUP BY",
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "OUTER JOIN",
  "CROSS JOIN",
  "FULL JOIN",
  "NATURAL JOIN",
  "LEFT OUTER JOIN",
  "RIGHT OUTER JOIN",
  "FULL OUTER JOIN",
  "SELECT",
  "FROM",
  "JOIN",
  "WHERE",
  "ON",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "INSERT",
  "UPDATE",
  "SET",
  "DELETE",
  "VALUES",
  "INTO",
  "UNION",
  "INTERSECT",
  "EXCEPT",
  "WITH",
  "RETURNING",
  "WINDOW",
];

/** Set of clause names where table references typically appear. */
const TABLE_CLAUSES = new Set(["FROM", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
  "OUTER JOIN", "CROSS JOIN", "FULL JOIN", "NATURAL JOIN",
  "LEFT OUTER JOIN", "RIGHT OUTER JOIN", "FULL OUTER JOIN",
  "INTO", "UPDATE"]);

/** Characters that are part of an SQL identifier (including schema-qualified names). */
const IDENT_RE = /[a-zA-Z0-9_.]/;

// ---- helpers ------------------------------------------------------------------

/**
 * Strip single-line (--) and block comments, and string literals, replacing
 * them with spaces so positional offsets remain stable.
 */
function neutraliseCommentsAndStrings(sql) {
  const out = [];
  let i = 0;
  while (i < sql.length) {
    // single-line comment
    if (sql[i] === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") {
        out.push(" ");
        i++;
      }
      continue;
    }
    // block comment
    if (sql[i] === "/" && sql[i + 1] === "*") {
      out.push(" ");
      out.push(" ");
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        out.push(" ");
        i++;
      }
      if (i < sql.length) { out.push(" "); out.push(" "); i += 2; }
      continue;
    }
    // string literal (single-quote)
    if (sql[i] === "'") {
      out.push(" ");
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out.push(" ");
          out.push(" ");
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          out.push(" ");
          i++;
          break;
        }
        out.push(" ");
        i++;
      }
      continue;
    }
    out.push(sql[i]);
    i++;
  }
  return out.join("");
}

/**
 * Scan backwards from `pos` to extract the identifier prefix the user is
 * currently typing (e.g. "sales." or "sal" or "reporting.v_sa").
 */
function extractPrefix(sql, pos) {
  let end = pos;
  let start = pos;
  while (start > 0 && IDENT_RE.test(sql[start - 1])) {
    start--;
  }
  return sql.substring(start, end);
}

/**
 * Build a regex that matches any of the clause keywords at a word boundary.
 * Longer keywords tested first so "ORDER BY" matches before "ORDER".
 */
function buildClauseRegex() {
  const escaped = CLAUSE_KEYWORDS.map(k => k.replace(/\s+/g, "\\s+"));
  // \b ensures we don't match inside identifiers
  return new RegExp("\\b(" + escaped.join("|") + ")\\b", "gi");
}

const CLAUSE_RE = buildClauseRegex();

/**
 * Find every clause boundary (keyword + its position) in the SQL text.
 * Returns an array sorted by position: [{keyword, pos}, ...]
 */
function findClauseBoundaries(sql) {
  const boundaries = [];
  CLAUSE_RE.lastIndex = 0;
  let m;
  while ((m = CLAUSE_RE.exec(sql)) !== null) {
    boundaries.push({ keyword: m[1].toUpperCase().replace(/\s+/g, " "), pos: m.index });
  }
  // sort by position (regex may not return in order for overlapping matches)
  boundaries.sort((a, b) => a.pos - b.pos);
  return boundaries;
}

/**
 * Detect the depth of parentheses nesting at position `pos`.
 * Subqueries live inside parens; we want to scope to the *innermost* query.
 */
function findInnermostQueryStart(sql, pos) {
  let depth = 0;
  let innermostOpen = 0; // start of innermost paren-block
  for (let i = 0; i < pos; i++) {
    if (sql[i] === "(") {
      depth++;
      innermostOpen = i + 1;
    } else if (sql[i] === ")") {
      depth--;
      if (depth < 0) depth = 0;
      innermostOpen = i + 1;
    }
  }
  return depth > 0 ? innermostOpen : 0;
}

// ---- table extraction ---------------------------------------------------------

/**
 * Simple tokenizer: split on whitespace/commas but keep schema-qualified names
 * (e.g. "sales.orders") intact.  Also handles double-quoted identifiers.
 */
function tokenize(sql) {
  const tokens = [];
  let i = 0;
  while (i < sql.length) {
    // skip whitespace
    if (/\s/.test(sql[i])) { i++; continue; }
    // skip commas and semicolons as separators
    if (sql[i] === "," || sql[i] === ";") { i++; continue; }
    // skip parens
    if (sql[i] === "(" || sql[i] === ")") {
      tokens.push({ text: sql[i], pos: i });
      i++;
      continue;
    }
    // double-quoted identifier
    if (sql[i] === '"') {
      let start = i;
      i++; // skip opening quote
      while (i < sql.length && sql[i] !== '"') i++;
      if (i < sql.length) i++; // skip closing quote
      // could be "schema"."table", check for dot
      if (i < sql.length && sql[i] === ".") {
        i++; // skip dot
        if (i < sql.length && sql[i] === '"') {
          i++; // skip opening quote
          while (i < sql.length && sql[i] !== '"') i++;
          if (i < sql.length) i++; // skip closing quote
        } else {
          // unquoted part after dot
          while (i < sql.length && IDENT_RE.test(sql[i])) i++;
        }
      }
      tokens.push({ text: sql.substring(start, i), pos: start });
      continue;
    }
    // normal identifier / keyword / number
    if (IDENT_RE.test(sql[i])) {
      let start = i;
      while (i < sql.length && IDENT_RE.test(sql[i])) i++;
      tokens.push({ text: sql.substring(start, i), pos: start });
      continue;
    }
    // anything else (operators, etc.)
    tokens.push({ text: sql[i], pos: i });
    i++;
  }
  return tokens;
}

/**
 * Given the SQL (up to cursor) and clause boundaries, extract referenced tables
 * from FROM / JOIN clauses.
 *
 * Handles:
 *   - Simple:       FROM orders
 *   - Aliased:      FROM orders o
 *   - Schema:       FROM sales.orders o
 *   - AS keyword:   FROM sales.orders AS o
 *   - Multiple:     FROM orders o, customers c
 *   - JOINs:        JOIN products p ON ...
 */
function extractTables(sql, boundaries) {
  const tables = [];
  const seen = new Set();

  for (let bi = 0; bi < boundaries.length; bi++) {
    const b = boundaries[bi];
    if (!TABLE_CLAUSES.has(b.keyword)) continue;

    // Determine end of this clause: next clause boundary start
    const clauseEnd = bi + 1 < boundaries.length ? boundaries[bi + 1].pos : sql.length;
    const clauseKeywordLen = b.keyword.length;
    const clauseText = sql.substring(b.pos + clauseKeywordLen, clauseEnd);
    const tokens = tokenize(clauseText);

    let i = 0;
    while (i < tokens.length) {
      const tok = tokens[i];
      // Skip sub-select / parens
      if (tok.text === "(") {
        let depth = 1;
        i++;
        while (i < tokens.length && depth > 0) {
          if (tokens[i].text === "(") depth++;
          if (tokens[i].text === ")") depth--;
          i++;
        }
        // After parens there might be an alias
        if (i < tokens.length && isIdentifier(tokens[i].text) && !isKeyword(tokens[i].text)) {
          i++; // skip alias of subquery — we don't track subquery aliases
        }
        continue;
      }

      // Must look like an identifier (table name or schema.table)
      if (!isIdentifier(tok.text)) {
        i++;
        continue;
      }

      // If it looks like a keyword (ON, WHERE, etc.), stop this clause scan
      if (isKeyword(tok.text)) {
        break;
      }

      // We have a table reference
      const tableRef = parseTableName(tok.text);
      i++;

      // Check for alias
      if (i < tokens.length) {
        const next = tokens[i];
        if (next.text.toUpperCase() === "AS" && i + 1 < tokens.length) {
          tableRef.alias = tokens[i + 1].text;
          i += 2;
        } else if (isIdentifier(next.text) && !isKeyword(next.text) && next.text !== ",") {
          tableRef.alias = next.text;
          i++;
        }
      }

      const key = `${tableRef.schema || ""}.${tableRef.name}.${tableRef.alias || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        tables.push(tableRef);
      }
    }
  }

  return tables;
}

function parseTableName(text) {
  // Remove surrounding double-quotes if present, handle "schema"."table"
  const clean = text.replace(/"/g, "");
  const dotIdx = clean.indexOf(".");
  if (dotIdx >= 0) {
    return {
      schema: clean.substring(0, dotIdx),
      name: clean.substring(dotIdx + 1),
      alias: null,
    };
  }
  return { schema: null, name: clean, alias: null };
}

function isIdentifier(text) {
  return /^[a-zA-Z_"][a-zA-Z0-9_."]*$/.test(text);
}

/** Quick check if a token is a SQL keyword that shouldn't be treated as a table name. */
const KEYWORD_SET = new Set([
  "SELECT", "FROM", "WHERE", "JOIN", "ON", "AND", "OR", "NOT", "IN", "EXISTS",
  "BETWEEN", "LIKE", "ILIKE", "IS", "NULL", "TRUE", "FALSE", "CASE", "WHEN",
  "THEN", "ELSE", "END", "AS", "ORDER", "BY", "GROUP", "HAVING", "LIMIT",
  "OFFSET", "UNION", "ALL", "INTERSECT", "EXCEPT", "INSERT", "INTO", "VALUES",
  "UPDATE", "SET", "DELETE", "CREATE", "ALTER", "DROP", "TABLE", "INDEX",
  "VIEW", "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "NATURAL",
  "DISTINCT", "ASC", "DESC", "NULLS", "FIRST", "LAST", "RETURNING",
  "WITH", "RECURSIVE", "LATERAL", "WINDOW", "OVER", "PARTITION", "ROWS",
  "RANGE", "PRECEDING", "FOLLOWING", "UNBOUNDED", "CURRENT", "ROW",
  "FETCH", "NEXT", "ONLY", "FOR", "USING", "CAST", "COALESCE", "GREATEST",
  "LEAST", "EXTRACT", "FILTER",
]);

function isKeyword(text) {
  return KEYWORD_SET.has(text.toUpperCase());
}

// ---- completing type detection -----------------------------------------------

/**
 * Determine what the user is likely completing based on the current clause
 * and the prefix they've typed so far.
 *
 * Returns: "table" | "column" | "keyword" | "schema" | "alias_column"
 */
function detectCompletingType(clause, prefix, tables) {
  // If prefix contains a dot, they're qualifying something
  if (prefix.includes(".")) {
    const parts = prefix.split(".");
    // Check if the part before the dot is an alias or table name
    const qualifier = parts[0];
    const isAlias = tables.some(
      t => t.alias === qualifier || t.name === qualifier
    );
    if (isAlias) return "alias_column";
    // Could be schema.table
    return "table";
  }

  switch (clause) {
    case "SELECT":
    case "WHERE":
    case "ON":
    case "HAVING":
    case "ORDER BY":
    case "GROUP BY":
      return "column";
    case "FROM":
    case "JOIN":
    case "LEFT JOIN":
    case "RIGHT JOIN":
    case "INNER JOIN":
    case "OUTER JOIN":
    case "CROSS JOIN":
    case "FULL JOIN":
    case "NATURAL JOIN":
    case "LEFT OUTER JOIN":
    case "RIGHT OUTER JOIN":
    case "FULL OUTER JOIN":
    case "INTO":
    case "UPDATE":
      return "table";
    default:
      return "keyword";
  }
}

// ---- main entry point ---------------------------------------------------------

/**
 * Analyse SQL text up to the cursor position and return context information
 * useful for autocompletion.
 *
 * @param {string} queryText   - The full query text in the editor.
 * @param {number} cursorPosition - Character offset of the cursor (0-based).
 * @returns {{
 *   clause: string|null,
 *   tables: Array<{schema: string|null, name: string, alias: string|null}>,
 *   currentPrefix: string,
 *   completing: string
 * }}
 */
export function parseSQLContext(queryText, cursorPosition) {
  // Defensive: handle edge cases
  if (!queryText || cursorPosition <= 0) {
    return { clause: null, tables: [], currentPrefix: "", completing: "keyword" };
  }

  const pos = Math.min(cursorPosition, queryText.length);

  // Strip comments and strings to avoid false clause detection
  const cleaned = neutraliseCommentsAndStrings(queryText);

  // Scope to innermost subquery
  const queryStart = findInnermostQueryStart(cleaned, pos);
  const scoped = cleaned.substring(queryStart, pos);

  // Find clause boundaries within the scoped text
  const boundaries = findClauseBoundaries(scoped);

  // Determine which clause the cursor is in (last boundary before end)
  let clause = null;
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (boundaries[i].pos < scoped.length) {
      clause = boundaries[i].keyword;
      break;
    }
  }

  // Also find boundaries in the full cleaned text up to cursor for table extraction
  // (tables might be referenced before a subquery)
  const fullBefore = cleaned.substring(0, pos);
  const fullBoundaries = queryStart === 0 ? boundaries : findClauseBoundaries(fullBefore);

  // Extract tables from the appropriate scope
  const tables = extractTables(
    queryStart === 0 ? scoped : fullBefore,
    queryStart === 0 ? boundaries : fullBoundaries
  );

  // Extract the prefix the user is currently typing
  const currentPrefix = extractPrefix(cleaned, pos);

  // Determine what they're completing
  const completing = detectCompletingType(clause, currentPrefix, tables);

  return { clause, tables, currentPrefix, completing };
}

export default parseSQLContext;
