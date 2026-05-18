"""
JRNY Data Dictionary API Handler

Endpoint: GET /api/jrny/data-dictionary

Returns metadata about the JRNY ERP read-replica database schemas,
including tables, columns, data types, and COMMENT ON annotations.

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
              "comment": "Primary key"
            }
          ]
        }
      ]
    }
  ]
}

Schemas included: reporting, core, sales, finance, inventory, procurement, cashbook

Requires authentication (returns 401 for unauthenticated requests).
"""

import logging
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
                          'inventory', 'procurement', 'cashbook')
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
        ELSE 7
    END,
    c.table_name,
    c.ordinal_position
"""


def _build_nested_response(rows):
    """
    Transform flat query rows into nested schema -> tables -> columns hierarchy.

    Args:
        rows: List of dicts with keys: table_schema, table_name, table_type,
              table_comment, column_name, data_type, is_nullable, column_default,
              ordinal_position, column_comment

    Returns:
        dict with "schemas" key containing the nested hierarchy.
    """
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

        # Add column
        schemas[schema_name][table_name]["columns"].append(
            {
                "name": row["column_name"],
                "data_type": row["data_type"],
                "nullable": row.get("is_nullable", True),
                "default": row.get("column_default"),
                "comment": row.get("column_comment"),
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

        # Build nested response
        result = _build_nested_response(data["rows"])

        self.record_event(
            {"action": "view", "object_type": "data_dictionary"}
        )

        return result
