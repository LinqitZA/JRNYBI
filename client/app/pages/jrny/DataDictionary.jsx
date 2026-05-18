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

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
} from "@ant-design/icons";
import { axios } from "@/services/axios";
import routeWithUserSession from "@/components/ApplicationArea/routeWithUserSession";
import routes from "@/services/routes";

import "./DataDictionary.less";

// Schema node component (top level)
function SchemaNode({ schema, expandedSchemas, expandedTables, toggleSchema, toggleTable, searchTerm }) {
  const isExpanded = expandedSchemas[schema.name];

  return (
    <div className="dd-schema-node">
      <div className="dd-node-header dd-schema-header" onClick={() => toggleSchema(schema.name)}>
        <span className="dd-expand-icon">
          {isExpanded ? <DownOutlined /> : <RightOutlined />}
        </span>
        <DatabaseOutlined className="dd-node-icon dd-schema-icon" />
        <span className="dd-node-name dd-schema-name">{schema.name}</span>
        <span className="dd-node-count">{schema.tables.length} tables</span>
      </div>
      {isExpanded && (
        <div className="dd-children">
          {schema.tables.map((table) => (
            <TableNode
              key={`${schema.name}.${table.name}`}
              schema={schema}
              table={table}
              expandedTables={expandedTables}
              toggleTable={toggleTable}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Table node component (second level)
function TableNode({ schema, table, expandedTables, toggleTable, searchTerm }) {
  const tableKey = `${schema.name}.${table.name}`;
  const isExpanded = expandedTables[tableKey];

  const handleCopyQuery = useCallback(
    (e) => {
      e.stopPropagation();
      const query = `SELECT * FROM ${schema.name}.${table.name} LIMIT 100`;
      navigator.clipboard.writeText(query).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = query;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      });
    },
    [schema.name, table.name]
  );

  const handleNewQuery = useCallback(
    (e) => {
      e.stopPropagation();
      const query = `SELECT * FROM ${schema.name}.${table.name} LIMIT 100`;
      window.location.href = `/queries/new?query=${encodeURIComponent(query)}`;
    },
    [schema.name, table.name]
  );

  return (
    <div className="dd-table-node">
      <div className="dd-node-header dd-table-header" onClick={() => toggleTable(tableKey)}>
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
            <button className="dd-action-btn" onClick={handleCopyQuery}>
              <CopyOutlined /> Copy query
            </button>
          </Tooltip>
          <Tooltip title="Open in Query Editor">
            <button className="dd-action-btn" onClick={handleNewQuery}>
              <EditOutlined /> New Query
            </button>
          </Tooltip>
        </span>
      </div>
      {table.comment && (
        <div className="dd-table-comment">{table.comment}</div>
      )}
      {isExpanded && (
        <div className="dd-children">
          <div className="dd-columns-header">
            <span className="dd-col-name">Column</span>
            <span className="dd-col-type">Type</span>
            <span className="dd-col-nullable">Nullable</span>
            <span className="dd-col-default">Default</span>
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

  // Fetch data dictionary on mount
  useEffect(() => {
    axios
      .get("/api/jrny/data-dictionary")
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

      <div className="dd-tree">
        {filteredSchemas.length === 0 ? (
          <div className="dd-empty">
            {searchTerm ? (
              <p>No results matching "{searchTerm}"</p>
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
