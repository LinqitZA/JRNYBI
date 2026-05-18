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

TODO: Implement handler (this is a placeholder for project structure)
"""

import logging

logger = logging.getLogger(__name__)

# TODO: Implement JRNYDataDictionaryResource
# - Query pg_catalog for schema/table/column metadata
# - Include COMMENT ON annotations via obj_description()
# - Structure as nested hierarchy: schema -> tables -> columns
# - Register route in handlers/api.py
# - Require authentication via @require_login decorator
