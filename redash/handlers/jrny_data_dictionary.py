"""
JRNY Data Dictionary API Handler

Endpoint: GET /api/jrny/data-dictionary

Returns metadata about the JRNY ERP read-replica database schemas,
including tables, columns, data types, COMMENT ON annotations, and
foreign key relationships.

Response structure:
{
  "schemas": [
    {
      "name": "reporting",
      "tables": [
        {
          "name": "v_sales_orders",
          "type": "view",
          "comment": "Denormalized sales order view",
          "columns": [
            {
              "name": "id",
              "data_type": "uuid",
              "nullable": false,
              "default": null,
              "comment": "Primary key",
              "fk": null
            },
            {
              "name": "customer_id",
              "data_type": "uuid",
              "nullable": true,
              "default": null,
              "comment": "Customer foreign key",
              "fk": {"schema": "core", "table": "contacts", "column": "id"}
            }
          ]
        }
      ]
    }
  ]
}

Schemas included: reporting, core, sales, finance, inventory, procurement, cashbook, crm

Requires authentication (returns 401 for unauthenticated requests).
"""

import logging
import re
from collections import OrderedDict

from redash import models
from redash.handlers.base import BaseResource

logger = logging.getLogger(__name__)

# The SQL query to retrieve full schema metadata from the read-replica.
# Uses information_schema for columns and pg_catalog for COMMENT ON annotations.
# Filters to JRNY schemas only and checks privileges.
DATA_DICTIONARY_QUERY = """
SELECT
    c.table_schema,
    c.table_name,
    CASE t.table_type
        WHEN 'BASE TABLE' THEN 'table'
        WHEN 'VIEW' THEN 'view'
        ELSE lower(t.table_type)
    END AS table_type,
    obj_description(
        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
        'pg_class'
    ) AS table_comment,
    c.column_name,
    c.data_type,
    CASE c.is_nullable WHEN 'YES' THEN true ELSE false END AS is_nullable,
    c.column_default,
    c.ordinal_position,
    col_description(
        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
        c.ordinal_position
    ) AS column_comment
FROM information_schema.columns c
JOIN information_schema.tables t
    ON c.table_schema = t.table_schema
    AND c.table_name = t.table_name
WHERE c.table_schema IN ('reporting', 'core', 'sales', 'finance',
                          'inventory', 'procurement', 'cashbook', 'crm')
  AND has_schema_privilege(c.table_schema, 'usage')
  AND has_table_privilege(
        quote_ident(c.table_schema) || '.' || quote_ident(c.table_name),
        'select'
      )
ORDER BY
    CASE c.table_schema
        WHEN 'reporting' THEN 0
        WHEN 'core' THEN 1
        WHEN 'sales' THEN 2
        WHEN 'finance' THEN 3
        WHEN 'inventory' THEN 4
        WHEN 'procurement' THEN 5
        WHEN 'cashbook' THEN 6
        WHEN 'crm' THEN 7
        ELSE 8
    END,
    c.table_name,
    c.ordinal_position
"""


def _build_nested_response(rows, fk_map=None):
    """
    Transform flat query rows into nested schema -> tables -> columns hierarchy.

    Args:
        rows: List of dicts with keys: table_schema, table_name, table_type,
              table_comment, column_name, data_type, is_nullable, column_default,
              ordinal_position, column_comment
        fk_map: Optional dict mapping (full_table_name, column_name) ->
                {"schema": str, "table": str, "column": str} for FK relationships.

    Returns:
        dict with "schemas" key containing the nested hierarchy.
    """
    if fk_map is None:
        fk_map = {}

    # Regex to strip fk:schema.table.column annotations from comment text
    fk_comment_re = re.compile(r"\s*fk:\w+\.\w+\.\w+\s*")
    # Regex to strip ' | display_column' tag from comment text
    display_col_re = re.compile(r"\s*\|\s*display_column\b\s*")

    schemas = OrderedDict()

    for row in rows:
        schema_name = row["table_schema"]
        table_name = row["table_name"]

        # Ensure schema entry exists
        if schema_name not in schemas:
            schemas[schema_name] = OrderedDict()

        # Ensure table entry exists
        if table_name not in schemas[schema_name]:
            schemas[schema_name][table_name] = {
                "name": table_name,
                "type": row.get("table_type", "table"),
                "comment": row.get("table_comment"),
                "columns": [],
            }

        # Look up FK relationship for this column
        full_table_name = "{}.{}".format(schema_name, table_name)
        col_name = row["column_name"]
        fk_info = fk_map.get((full_table_name, col_name))

        # Clean the fk: and display_column annotations from the display comment
        comment = row.get("column_comment")
        if comment:
            comment = fk_comment_re.sub("", comment)
            comment = display_col_re.sub("", comment).strip() or None

        # Add column
        schemas[schema_name][table_name]["columns"].append(
            {
                "name": col_name,
                "data_type": row["data_type"],
                "nullable": row.get("is_nullable", True),
                "default": row.get("column_default"),
                "comment": comment,
                "fk": fk_info,
            }
        )

    # Convert to list format
    result = []
    for schema_name, tables in schemas.items():
        result.append(
            {
                "name": schema_name,
                "tables": list(tables.values()),
            }
        )

    return {"schemas": result}


class JRNYDataDictionaryResource(BaseResource):
    """
    GET /api/jrny/data-dictionary

    Returns schema metadata from the JRNY read-replica data source.
    Requires authentication (BaseResource applies @login_required).
    """

    def get(self):
        # Find the JRNY data source (type = jrny_pg)
        data_source = (
            models.DataSource.query
            .filter(
                models.DataSource.type == "jrny_pg",
                models.DataSource.org_id == self.current_org.id,
            )
            .first()
        )

        if data_source is None:
            return {
                "error": "No JRNY data source configured. "
                         "Please contact your administrator."
            }, 404

        # Get the query runner and execute the metadata query
        query_runner = data_source.query_runner

        try:
            data, error = query_runner.run_query(DATA_DICTIONARY_QUERY, self.current_user)
        except Exception as e:
            logger.exception("Error fetching data dictionary from JRNY data source")
            return {
                "error": "Failed to retrieve schema metadata: {}".format(str(e))
            }, 500

        if error:
            logger.error("Data dictionary query error: %s", error)
            return {
                "error": "Failed to retrieve schema metadata: {}".format(error)
            }, 500

        if not data or not data.get("rows"):
            # No data returned — could be connection issue or empty schemas
            return {"schemas": []}

        # Fetch FK data by reusing the query runner's FK methods.
        # This provides three sources of FK relationships:
        #   1. Direct FKs from pg_constraint (_get_foreign_keys)
        #   2. Inferred view FKs from base table column tracing
        #   3. Comment-annotated FKs (fk:schema.table.column)
        fk_map = self._build_fk_map(query_runner, data["rows"])

        # Build nested response with FK enrichment
        result = _build_nested_response(data["rows"], fk_map=fk_map)

        self.record_event(
            {"action": "view", "object_type": "data_dictionary"}
        )

        return result

    def _build_fk_map(self, query_runner, rows):
        """
        Build a merged FK map using the query runner's FK-related methods.

        Combines three FK sources (same logic as JRNYPostgreSQL.get_schema()):
          1. Direct FKs from pg_constraint
          2. Inferred view FKs from base table column origin tracing
          3. Comment-annotated FKs (fk:schema.table.column in COMMENT ON)

        Args:
            query_runner: JRNYPostgreSQL instance with FK query methods.
            rows: Data dictionary query result rows (used to build schema_dict
                  for view FK inference).

        Returns:
            dict: Merged FK map: (full_table_name, col_name) ->
                  {"schema": str, "table": str, "column": str}
        """
        try:
            # 1. Direct FKs from pg_constraint
            fk_map = query_runner._get_foreign_keys()

            # 2. Inferred view FKs (requires view deps and column origins)
            view_deps = query_runner._get_view_dependencies()

            if view_deps:
                # Build a minimal schema_dict from the data dictionary rows
                # for _infer_view_fk_from_origins (needs table -> columns mapping)
                schema_dict = {}
                for row in rows:
                    full_name = "{}.{}".format(
                        row["table_schema"], row["table_name"]
                    )
                    if full_name not in schema_dict:
                        schema_dict[full_name] = {
                            "name": full_name,
                            "columns": [],
                        }
                    schema_dict[full_name]["columns"].append(
                        {"name": row["column_name"]}
                    )

                view_column_origins = query_runner._get_view_column_origins(
                    view_deps
                )
                inferred_fks = query_runner._infer_view_fk_from_origins(
                    fk_map, view_column_origins, schema_dict
                )
            else:
                inferred_fks = {}

            # 3. Comment-annotated FKs
            _, column_comments = query_runner._get_comments()
            comment_fks = query_runner._parse_fk_comments(column_comments)

            # Merge all FK maps (same priority as get_schema):
            # comment FKs < inferred FKs < direct FKs
            merged = {}
            merged.update(comment_fks)
            merged.update(inferred_fks)
            merged.update(fk_map)

            logger.debug(
                "Data dictionary FK map: %d total "
                "(direct: %d, inferred: %d, comments: %d)",
                len(merged),
                len(fk_map),
                len(inferred_fks),
                len(comment_fks),
            )
            return merged

        except Exception:
            logger.warning(
                "Failed to fetch FK data for data dictionary",
                exc_info=True,
            )
            return {}
