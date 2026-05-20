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

/**
 * Determine the best "display column" for a table using heuristics.
 *
 * Priority:
 *   1. Columns with COMMENT containing 'display_column'
 *   2. Common display column names (name, title, description, label, etc.)
 *   3. First non-ID text/varchar column
 *
 * @param {Object} table - A schema table entry with columns array
 * @returns {string|null} The display column name, or null if none found
 */
export function resolveDisplayColumn(table) {
  if (!table || !table.columns) return null;

  const columns = table.columns;

  // 1. Check for COMMENT 'display_column' annotation
  const annotated = columns.find(c => {
    const desc = get(c, "description", "");
    return desc && desc.toLowerCase().includes("display_column");
  });
  if (annotated) return get(annotated, "name");

  // 2. Check common display column name patterns
  for (const pattern of DISPLAY_COLUMN_NAMES) {
    const match = columns.find(c => {
      const colName = get(c, "name", "").toLowerCase();
      return colName === pattern || colName.endsWith(`_${pattern}`);
    });
    if (match) return get(match, "name");
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
    const ctx = parseSQLContext(queryText, cursorOffset);
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
        if (matchingPair && edge.displayColumn) {
          return {
            edge,
            tableRef,
            columnName,
            fullWord,
            fullTableName: fullName,
            matchingPair,
            displayColumn: edge.displayColumn,
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
        if (!edge.displayColumn) continue;
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

    // Search for FK column references in the SELECT text
    for (const fk of fkColumns) {
      // Match both qualified (alias.column) and unqualified (column)
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

          const shortRelated = fk.edge.relatedTable.includes(".")
            ? fk.edge.relatedTable.split(".").pop()
            : fk.edge.relatedTable;

          markers.push({
            row,
            startCol: col,
            endCol: col + pattern.length,
            label: `Resolve → Show ${shortRelated}.${fk.edge.displayColumn}`,
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

  const displayRef = `${newAlias}.${edge.displayColumn}`;

  // Build the column name for the display (e.g., customer_name)
  const fkColShort = fkInfo.columnName.replace(/_id$/, "");
  const displayAlias = `${fkColShort}_${edge.displayColumn}`;

  let newQueryText = queryText;

  // 1. Add display column after the FK column in SELECT
  // Find the FK column reference near the cursor
  const searchStart = Math.max(0, queryText.indexOf(fullWord));
  const replaceIdx = queryText.indexOf(fullWord, searchStart);

  if (replaceIdx >= 0) {
    const afterFK = replaceIdx + fullWord.length;
    const insertText = `, ${displayRef} AS ${displayAlias}`;
    newQueryText =
      newQueryText.substring(0, afterFK) +
      insertText +
      newQueryText.substring(afterFK);
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
  }

  // Apply the change to the editor
  editor.setValue(newQueryText, -1);

  // Trigger onChange callback
  if (onChange) {
    onChange(newQueryText);
  }
}
