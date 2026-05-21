/**
 * JRNYBI Data Dictionary Page
 *
 * Displays an interactive schema browser for the JRNY ERP read-replica database.
 * Features:
 * - Collapsible tree view: Schema -> Table/View -> Columns
 * - Search/filter across all levels
 * - Column details: type, nullable, default, comment
 * - "Copy query" button: copies SELECT * FROM schema.table LIMIT 100
 * - "New Query" link: opens query editor with table pre-filled
 *
 * API: GET /api/jrny/data-dictionary
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Input from "antd/lib/input";
import Tooltip from "antd/lib/tooltip";
import Spin from "antd/lib/spin";
import {
  DatabaseOutlined,
  TableOutlined,
  RightOutlined,
  DownOutlined,
  FileTextOutlined,
  CopyOutlined,
  EditOutlined,
  SearchOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { axios } from "@/services/axios";
import notification from "@/services/notification";
import navigateTo from "@/components/ApplicationArea/navigateTo";
import routeWithUserSession from "@/components/ApplicationArea/routeWithUserSession";
import routes from "@/services/routes";

import "./DataDictionary.less";

// Schema node component (top level)
function SchemaNode({ schema, expandedSchemas, expandedTables, toggleSchema, toggleTable, searchTerm, focusedNodeId, nodeRefs }) {
  const isExpanded = expandedSchemas[schema.name];
  const nodeId = `schema:${schema.name}`;
  const isFocused = focusedNodeId === nodeId;

  return (
    <div className="dd-schema-node" role="treeitem" aria-expanded={isExpanded} aria-label={`${schema.name} schema, ${schema.tables.length} tables`}>
      <div
        className={`dd-node-header dd-schema-header${isFocused ? " dd-focused" : ""}`}
        onClick={() => toggleSchema(schema.name)}
        ref={(el) => { if (nodeRefs) nodeRefs.current[nodeId] = el; }}
        tabIndex={isFocused ? 0 : -1}
        data-node-id={nodeId}
      >
        <span className="dd-expand-icon">
          {isExpanded ? <DownOutlined /> : <RightOutlined />}
        </span>
        <DatabaseOutlined className="dd-node-icon dd-schema-icon" />
        <span className="dd-node-name dd-schema-name">{schema.name}</span>
        <span className="dd-node-count">{schema.tables.length} tables</span>
      </div>
      {isExpanded && (
        <div className="dd-children" role="group">
          {schema.tables.map((table) => (
            <TableNode
              key={`${schema.name}.${table.name}`}
              schema={schema}
              table={table}
              expandedTables={expandedTables}
              toggleTable={toggleTable}
              searchTerm={searchTerm}
              focusedNodeId={focusedNodeId}
              nodeRefs={nodeRefs}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Table node component (second level)
function TableNode({ schema, table, expandedTables, toggleTable, searchTerm, focusedNodeId, nodeRefs }) {
  const tableKey = `${schema.name}.${table.name}`;
  const isExpanded = expandedTables[tableKey];
  const nodeId = `table:${tableKey}`;
  const isFocused = focusedNodeId === nodeId;

  const handleCopyQuery = useCallback(
    (e) => {
      e.stopPropagation();
      const query = `SELECT * FROM ${schema.name}.${table.name} LIMIT 100`;
      const showSuccess = () => {
        notification.success(`Copied query for ${schema.name}.${table.name} to clipboard`);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(query).then(showSuccess).catch(() => {
          // Fallback for older browsers or non-HTTPS contexts
          const textArea = document.createElement("textarea");
          textArea.value = query;
          textArea.style.position = "fixed";
          textArea.style.opacity = "0";
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          showSuccess();
        });
      } else {
        // Fallback for browsers without clipboard API
        const textArea = document.createElement("textarea");
        textArea.value = query;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        showSuccess();
      }
    },
    [schema.name, table.name]
  );

  const handleNewQuery = useCallback(
    (e) => {
      e.stopPropagation();
      const query = `SELECT * FROM ${schema.name}.${table.name} LIMIT 100`;
      navigateTo(`queries/new?query=${encodeURIComponent(query)}`);
    },
    [schema.name, table.name]
  );

  return (
    <div className="dd-table-node" role="treeitem" aria-expanded={isExpanded} aria-label={`${table.name} ${table.type}, ${table.columns.length} columns`}>
      <div
        className={`dd-node-header dd-table-header${isFocused ? " dd-focused" : ""}`}
        onClick={() => toggleTable(tableKey)}
        ref={(el) => { if (nodeRefs) nodeRefs.current[nodeId] = el; }}
        tabIndex={isFocused ? 0 : -1}
        data-node-id={nodeId}
      >
        <span className="dd-expand-icon">
          {isExpanded ? <DownOutlined /> : <RightOutlined />}
        </span>
        {table.type === "view" ? (
          <FileTextOutlined className="dd-node-icon dd-table-icon" />
        ) : (
          <TableOutlined className="dd-node-icon dd-table-icon" />
        )}
        <span className="dd-node-name dd-table-name">{table.name}</span>
        <span className="dd-table-type">{table.type}</span>
        <span className="dd-node-count">{table.columns.length} cols</span>
        <span className="dd-table-actions">
          <Tooltip title={`Copy: SELECT * FROM ${schema.name}.${table.name} LIMIT 100`}>
            <button className="dd-action-btn" onClick={handleCopyQuery} tabIndex={-1}>
              <CopyOutlined /> Copy query
            </button>
          </Tooltip>
          <Tooltip title="Open in Query Editor">
            <button className="dd-action-btn" onClick={handleNewQuery} tabIndex={-1}>
              <EditOutlined /> New Query
            </button>
          </Tooltip>
        </span>
      </div>
      {table.comment && (
        <div className="dd-table-comment">{table.comment}</div>
      )}
      {isExpanded && (
        <div className="dd-children" role="group">
          <div className="dd-columns-header" role="presentation">
            <span className="dd-col-name">Column</span>
            <span className="dd-col-type">Type</span>
            <span className="dd-col-nullable">Nullable</span>
            <span className="dd-col-default">Default</span>
            <span className="dd-col-fk">FK</span>
            <span className="dd-col-comment">Description</span>
          </div>
          {table.columns.map((col) => (
            <ColumnRow key={`${tableKey}.${col.name}`} column={col} searchTerm={searchTerm} />
          ))}
        </div>
      )}
    </div>
  );
}

// Column row component (leaf level)
function ColumnRow({ column, searchTerm }) {
  const isHighlighted =
    searchTerm && column.name.toLowerCase().includes(searchTerm.toLowerCase());

  const fk = column.fk;
  const fkDisplay = fk ? `${fk.schema}.${fk.table}.${fk.column}` : null;

  return (
    <div className={`dd-column-row ${isHighlighted ? "dd-highlighted" : ""}`}>
      <span className="dd-col-name">{column.name}</span>
      <span className="dd-col-type">
        <code>{column.data_type}</code>
      </span>
      <span className="dd-col-nullable">{column.nullable ? "YES" : "NO"}</span>
      <span className="dd-col-default">
        {column.default ? <code>{column.default}</code> : <span className="dd-null">-</span>}
      </span>
      <span className="dd-col-fk">
        {fk ? (
          <Tooltip title={`References ${fkDisplay}`}>
            <span className="dd-fk-badge">
              <LinkOutlined className="dd-fk-icon" />
              <span className="dd-fk-ref">{fk.schema}.{fk.table}.{fk.column}</span>
            </span>
          </Tooltip>
        ) : (
          <span className="dd-null">-</span>
        )}
      </span>
      <span className="dd-col-comment">{column.comment || ""}</span>
    </div>
  );
}

function DataDictionary() {
  const [schemas, setSchemas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSchemas, setExpandedSchemas] = useState({});
  const [expandedTables, setExpandedTables] = useState({});
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const nodeRefs = useRef({});

  // Fetch data dictionary on mount
  useEffect(() => {
    axios
      .get("api/jrny/data-dictionary")
      .then((data) => {
        setSchemas(data.schemas || []);
        // Auto-expand the first schema
        if (data.schemas && data.schemas.length > 0) {
          setExpandedSchemas({ [data.schemas[0].name]: true });
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load data dictionary");
        setLoading(false);
      });
  }, []);

  const toggleSchema = useCallback((schemaName) => {
    setExpandedSchemas((prev) => ({
      ...prev,
      [schemaName]: !prev[schemaName],
    }));
  }, []);

  const toggleTable = useCallback((tableKey) => {
    setExpandedTables((prev) => ({
      ...prev,
      [tableKey]: !prev[tableKey],
    }));
  }, []);

  // Filter schemas/tables/columns based on search term
  const filteredSchemas = useMemo(() => {
    if (!searchTerm) return schemas;

    const term = searchTerm.toLowerCase();
    return schemas
      .map((schema) => {
        // Check if schema name matches
        const schemaMatches = schema.name.toLowerCase().includes(term);

        const filteredTables = schema.tables
          .map((table) => {
            // Check if table name matches
            const tableMatches = table.name.toLowerCase().includes(term);
            // Check if any column matches
            const filteredColumns = table.columns.filter(
              (col) =>
                col.name.toLowerCase().includes(term) ||
                (col.comment && col.comment.toLowerCase().includes(term))
            );

            if (tableMatches || filteredColumns.length > 0) {
              return {
                ...table,
                columns: tableMatches ? table.columns : filteredColumns.length > 0 ? table.columns : [],
              };
            }
            return null;
          })
          .filter(Boolean);

        if (schemaMatches || filteredTables.length > 0) {
          return {
            ...schema,
            tables: schemaMatches ? schema.tables : filteredTables,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [schemas, searchTerm]);

  // Auto-expand all matching schemas when searching
  useEffect(() => {
    if (searchTerm) {
      const expanded = {};
      const expandedTbls = {};
      filteredSchemas.forEach((schema) => {
        expanded[schema.name] = true;
        schema.tables.forEach((table) => {
          const term = searchTerm.toLowerCase();
          const columnMatch = table.columns.some(
            (col) =>
              col.name.toLowerCase().includes(term) ||
              (col.comment && col.comment.toLowerCase().includes(term))
          );
          if (columnMatch) {
            expandedTbls[`${schema.name}.${table.name}`] = true;
          }
        });
      });
      setExpandedSchemas(expanded);
      setExpandedTables(expandedTbls);
    }
  }, [searchTerm, filteredSchemas]);

  // Compute flat list of visible node IDs for keyboard navigation
  const visibleNodeIds = useMemo(() => {
    const ids = [];
    filteredSchemas.forEach((schema) => {
      ids.push(`schema:${schema.name}`);
      if (expandedSchemas[schema.name]) {
        schema.tables.forEach((table) => {
          ids.push(`table:${schema.name}.${table.name}`);
        });
      }
    });
    return ids;
  }, [filteredSchemas, expandedSchemas]);

  // Keyboard navigation handler for the tree
  const handleTreeKeyDown = useCallback(
    (e) => {
      const currentIndex = visibleNodeIds.indexOf(focusedNodeId);
      let nextId = null;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          if (currentIndex < visibleNodeIds.length - 1) {
            nextId = visibleNodeIds[currentIndex + 1];
          } else if (currentIndex === -1 && visibleNodeIds.length > 0) {
            nextId = visibleNodeIds[0];
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          if (currentIndex > 0) {
            nextId = visibleNodeIds[currentIndex - 1];
          }
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (focusedNodeId && focusedNodeId.startsWith("schema:")) {
            const schemaName = focusedNodeId.substring(7);
            if (!expandedSchemas[schemaName]) {
              toggleSchema(schemaName);
            } else if (currentIndex < visibleNodeIds.length - 1) {
              // Already expanded, move to first child
              nextId = visibleNodeIds[currentIndex + 1];
            }
          } else if (focusedNodeId && focusedNodeId.startsWith("table:")) {
            const tableKey = focusedNodeId.substring(6);
            if (!expandedTables[tableKey]) {
              toggleTable(tableKey);
            }
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (focusedNodeId && focusedNodeId.startsWith("table:")) {
            const tableKey = focusedNodeId.substring(6);
            if (expandedTables[tableKey]) {
              toggleTable(tableKey);
            } else {
              // Move to parent schema
              const schemaName = tableKey.split(".")[0];
              nextId = `schema:${schemaName}`;
            }
          } else if (focusedNodeId && focusedNodeId.startsWith("schema:")) {
            const schemaName = focusedNodeId.substring(7);
            if (expandedSchemas[schemaName]) {
              toggleSchema(schemaName);
            }
          }
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          if (focusedNodeId && focusedNodeId.startsWith("schema:")) {
            toggleSchema(focusedNodeId.substring(7));
          } else if (focusedNodeId && focusedNodeId.startsWith("table:")) {
            toggleTable(focusedNodeId.substring(6));
          }
          break;
        }
        case "Home": {
          e.preventDefault();
          if (visibleNodeIds.length > 0) {
            nextId = visibleNodeIds[0];
          }
          break;
        }
        case "End": {
          e.preventDefault();
          if (visibleNodeIds.length > 0) {
            nextId = visibleNodeIds[visibleNodeIds.length - 1];
          }
          break;
        }
        default:
          return; // Don't prevent default for other keys
      }

      if (nextId) {
        setFocusedNodeId(nextId);
        if (nodeRefs.current[nextId]) {
          nodeRefs.current[nextId].focus();
        }
      }
    },
    [focusedNodeId, visibleNodeIds, expandedSchemas, expandedTables, toggleSchema, toggleTable]
  );

  // Handle focus entering the tree (Tab into it)
  const handleTreeFocus = useCallback(
    (e) => {
      // Only handle focus on the tree container itself, not bubbled focus from children
      if (e.target === e.currentTarget && visibleNodeIds.length > 0) {
        const firstId = focusedNodeId && visibleNodeIds.includes(focusedNodeId) ? focusedNodeId : visibleNodeIds[0];
        setFocusedNodeId(firstId);
        if (nodeRefs.current[firstId]) {
          nodeRefs.current[firstId].focus();
        }
      }
    },
    [focusedNodeId, visibleNodeIds]
  );

  if (loading) {
    return (
      <div className="jrny-data-dictionary container p-t-15">
        <div className="dd-loading">
          <Spin size="large" />
          <p>Loading data dictionary...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="jrny-data-dictionary container p-t-15">
        <h2>Data Dictionary</h2>
        <div className="dd-error">
          <p>Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="jrny-data-dictionary container p-t-15">
      <div className="dd-header">
        <h2>Data Dictionary</h2>
        <p className="dd-subtitle">
          Browse schemas, tables, and columns from the JRNY ERP database.
        </p>
      </div>

      <div className="dd-search-bar">
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search schemas, tables, or columns..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          allowClear
          size="large"
        />
      </div>

      <div className="dd-stats">
        <span>{filteredSchemas.length} schemas</span>
        <span className="dd-stats-sep">|</span>
        <span>
          {filteredSchemas.reduce((acc, s) => acc + s.tables.length, 0)} tables
        </span>
        <span className="dd-stats-sep">|</span>
        <span>
          {filteredSchemas.reduce(
            (acc, s) => acc + s.tables.reduce((a, t) => a + t.columns.length, 0),
            0
          )}{" "}
          columns
        </span>
      </div>

      <div
        className="dd-tree"
        role="tree"
        aria-label="Data Dictionary schema browser"
        tabIndex={visibleNodeIds.length > 0 ? 0 : -1}
        onKeyDown={handleTreeKeyDown}
        onFocus={handleTreeFocus}
      >
        {filteredSchemas.length === 0 ? (
          <div className="dd-empty">
            {searchTerm ? (
              <p>No results matching &ldquo;{searchTerm}&rdquo;</p>
            ) : (
              <p>No schemas found. The data source may not be connected.</p>
            )}
          </div>
        ) : (
          filteredSchemas.map((schema) => (
            <SchemaNode
              key={schema.name}
              schema={schema}
              expandedSchemas={expandedSchemas}
              expandedTables={expandedTables}
              toggleSchema={toggleSchema}
              toggleTable={toggleTable}
              searchTerm={searchTerm}
              focusedNodeId={focusedNodeId}
              nodeRefs={nodeRefs}
            />
          ))
        )}
      </div>
    </div>
  );
}

routes.register(
  "JRNY.DataDictionary",
  routeWithUserSession({
    path: "/jrny/data-dictionary",
    title: "Data Dictionary",
    render: (pageProps) => <DataDictionary {...pageProps} />,
  })
);

export default DataDictionary;
