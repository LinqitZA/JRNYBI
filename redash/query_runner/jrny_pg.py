"""
JRNY PostgreSQL (RLS) Query Runner

A subclass of the PostgreSQL query runner that injects SET LOCAL session
variables before every user query to enforce Row-Level Security (RLS) on
the JRNY ERP read-replica.

Session variables injected:
  - app.current_org_id      (UUID from JWT org_id claim)
  - app.current_branch_id   (UUID from JWT branch_id claim)
  - app.current_entity_id   (UUID from JWT entity_id claim)
  - app.current_user_id     (UUID from JWT sub claim)
  - app.current_user_role   (alphanumeric from JWT role claim)

All SET LOCAL statements execute within psycopg2's implicit transaction,
scoping the session variables to the current query only.

UUID values are validated against a strict regex pattern.
Role values are validated as alphanumeric-only (with underscores).
"""

import logging
import re
import select

import psycopg2

from redash.query_runner import (
    InterruptException,
    JobTimeoutException,
    register,
)
from redash.query_runner.pg import PostgreSQL, _wait, _cleanup_ssl_certs, build_schema, types_map

logger = logging.getLogger(__name__)

# UUID validation pattern
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

# Role validation: alphanumeric + underscores only
ROLE_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")

# JRNY RLS session variables mapped to user.details keys and their type
RLS_VARIABLES = [
    ("app.current_org_id", "jrny_org_id", "uuid"),
    ("app.current_branch_id", "jrny_branch_id", "uuid"),
    ("app.current_entity_id", "jrny_entity_id", "uuid"),
    ("app.current_user_id", "jrny_user_id", "uuid"),
    ("app.current_user_role", "jrny_role", "role"),
]

# JRNY ERP schemas accessible via the read-replica
JRNY_SCHEMAS = [
    "reporting",
    "core",
    "sales",
    "finance",
    "inventory",
    "procurement",
    "cashbook",
]


def _safe_uuid(value):
    """Validate that a value is a proper UUID format to prevent SQL injection."""
    if not value or not UUID_PATTERN.match(str(value)):
        return False
    return True


def _safe_role(value):
    """Validate that a role value is alphanumeric only to prevent SQL injection."""
    if not value or not ROLE_PATTERN.match(str(value)):
        return False
    return True


class JRNYPostgreSQL(PostgreSQL):
    """
    JRNY PostgreSQL (RLS) query runner.

    Extends the base PostgreSQL query runner to inject SET LOCAL session
    variables before every query execution. These session variables are
    evaluated by PostgreSQL Row-Level Security (RLS) policies on the JRNY
    ERP read-replica to enforce data isolation per organization, branch,
    entity, and user.

    RLS variables injected (all within the same implicit transaction):
      - app.current_org_id      (UUID, validated)
      - app.current_branch_id   (UUID, validated)
      - app.current_entity_id   (UUID, validated)
      - app.current_user_id     (UUID, validated)
      - app.current_user_role   (alphanumeric, validated)

    The values are sourced from the executing user's ``details`` JSONB field,
    which is populated during JWT authentication from JRNY ERP claims.
    """

    noop_query = "SELECT 1"

    @classmethod
    def type(cls):
        return "jrny_pg"

    @classmethod
    def name(cls):
        return "JRNY PostgreSQL (RLS)"

    @classmethod
    def configuration_schema(cls):
        schema = {
            "type": "object",
            "properties": {
                "user": {"type": "string"},
                "password": {"type": "string"},
                "host": {"type": "string", "default": "127.0.0.1"},
                "port": {"type": "number", "default": 5432},
                "dbname": {"type": "string", "title": "Database Name"},
                "dsn": {
                    "type": "string",
                    "default": "application_name=jrnybi",
                    "title": "Parameters",
                },
                "search_path": {
                    "type": "string",
                    "title": "Search Path (schemas)",
                    "default": ",".join(JRNY_SCHEMAS),
                },
                "sslmode": {
                    "type": "string",
                    "title": "SSL Mode",
                    "default": "prefer",
                    "extendedEnum": [
                        {"value": "disable", "name": "Disable"},
                        {"value": "allow", "name": "Allow"},
                        {"value": "prefer", "name": "Prefer"},
                        {"value": "require", "name": "Require"},
                        {"value": "verify-ca", "name": "Verify CA"},
                        {"value": "verify-full", "name": "Verify Full"},
                    ],
                },
                "sslrootcertFile": {"type": "string", "title": "SSL Root Certificate"},
                "sslcertFile": {"type": "string", "title": "SSL Client Certificate"},
                "sslkeyFile": {"type": "string", "title": "SSL Client Key"},
            },
            "order": ["host", "port", "user", "password", "dbname", "search_path"],
            "required": ["dbname"],
            "secret": ["password", "sslrootcertFile", "sslcertFile", "sslkeyFile"],
            "extra_options": [
                "search_path",
                "sslmode",
                "sslrootcertFile",
                "sslcertFile",
                "sslkeyFile",
            ],
        }
        return schema

    def _get_current_user_details(self, user):
        """
        Extract JRNY claims from the user object's details JSONB field.

        Args:
            user: A User or ApiUser model instance (from QueryExecutor).

        Returns:
            dict or None: The user's details dict, or None if unavailable.
        """
        if user is None:
            return None

        details = getattr(user, "details", None)
        if not details:
            return None

        # Ensure it's a dict (could be a MutableDict proxy)
        if hasattr(details, "to_dict"):
            return details.to_dict()
        if isinstance(details, dict):
            return details

        return None

    def _build_rls_statements(self, details):
        """
        Build validated SET LOCAL statements from user details for RLS enforcement.

        Args:
            details: dict with JRNY claim keys (jrny_org_id, jrny_branch_id, etc.)

        Returns:
            list[str]: SET LOCAL SQL statements ready for execution.

        Raises:
            ValueError: If a claim value fails validation (potential injection).
        """
        statements = []

        for var_name, detail_key, var_type in RLS_VARIABLES:
            value = details.get(detail_key)
            if value is None:
                logger.warning(
                    "Missing JRNY claim '%s' for RLS variable '%s'",
                    detail_key,
                    var_name,
                )
                continue

            value_str = str(value)

            # Validate based on expected type
            if var_type == "uuid":
                if not _safe_uuid(value_str):
                    logger.error(
                        "Invalid UUID format for RLS variable '%s': %s",
                        var_name,
                        value_str,
                    )
                    raise ValueError(
                        f"Invalid UUID format for {var_name}. "
                        "Query execution blocked for security."
                    )
            elif var_type == "role":
                if not _safe_role(value_str):
                    logger.error(
                        "Invalid role format for RLS variable '%s': %s",
                        var_name,
                        value_str,
                    )
                    raise ValueError(
                        f"Invalid role format for {var_name}. "
                        "Query execution blocked for security."
                    )

            # Value is validated; safe to interpolate into SET LOCAL
            statements.append("SET LOCAL {} = '{}'".format(var_name, value_str))

        return statements

    def run_query(self, query, user):
        """
        Execute a query with SET LOCAL RLS context variables injected.

        All SET LOCAL statements and the user query execute within psycopg2's
        implicit transaction (autocommit=False by default), ensuring the
        session variables are scoped to this query only and cannot leak to
        other connections.

        Args:
            query: The SQL query string to execute.
            user: The User model instance (contains JRNY details in .details).

        Returns:
            tuple: (data_dict, error_string) where data_dict has columns/rows.
        """
        connection = self._get_connection()
        _wait(connection, timeout=10)

        cursor = connection.cursor()

        try:
            # Inject RLS SET LOCAL statements within the implicit transaction
            details = self._get_current_user_details(user)
            if details:
                rls_statements = self._build_rls_statements(details)
                for stmt in rls_statements:
                    cursor.execute(stmt)
                    _wait(connection)
                logger.debug(
                    "Injected %d RLS SET LOCAL statements for query",
                    len(rls_statements),
                )
            else:
                logger.warning(
                    "No JRNY user details available for RLS context. "
                    "Query will execute without RLS session variables."
                )

            # Set search_path if configured
            search_path = self.configuration.get("search_path")
            if search_path:
                cursor.execute("SET LOCAL search_path = {}".format(search_path))
                _wait(connection)

            # Execute the actual user query
            cursor.execute(query)
            _wait(connection)

            if cursor.description is not None:
                columns = self.fetch_columns(
                    [(i[0], types_map.get(i[1], None)) for i in cursor.description]
                )
                rows = [
                    dict(zip((column["name"] for column in columns), row))
                    for row in cursor
                ]
                data = {"columns": columns, "rows": rows}
                error = None
            else:
                error = "Query completed but it returned no data."
                data = None
        except ValueError as e:
            # RLS validation failure (invalid UUID or role format in JWT claims)
            error = str(e)
            data = None
        except (select.error, OSError):
            error = "Query interrupted. Please retry."
            data = None
        except psycopg2.DatabaseError as e:
            error = str(e)
            data = None
        except (KeyboardInterrupt, InterruptException, JobTimeoutException):
            connection.cancel()
            raise
        finally:
            connection.close()
            _cleanup_ssl_certs(self.ssl_config)

        return data, error

    def _get_tables(self, schema):
        """
        Get schema metadata, prioritizing the 'reporting' schema views at the
        top of the autocomplete list.

        Includes tables/views from all configured JRNY schemas:
        reporting, core, sales, finance, inventory, procurement, cashbook.
        """
        query = """
        SELECT s.nspname AS table_schema,
               c.relname AS table_name,
               a.attname AS column_name,
               NULL AS data_type
        FROM pg_class c
        JOIN pg_namespace s
        ON c.relnamespace = s.oid
        AND s.nspname NOT IN ('pg_catalog', 'information_schema')
        JOIN pg_attribute a
        ON a.attrelid = c.oid
        AND a.attnum > 0
        AND NOT a.attisdropped
        WHERE c.relkind = 'm'
        AND has_table_privilege(quote_ident(s.nspname) || '.' || quote_ident(c.relname), 'select')
        AND has_schema_privilege(s.nspname, 'usage')

        UNION

        SELECT table_schema,
               table_name,
               column_name,
               data_type
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND has_table_privilege(quote_ident(table_schema) || '.' || quote_ident(table_name), 'select')
        AND has_schema_privilege(table_schema, 'usage')

        ORDER BY
            CASE WHEN table_schema = 'reporting' THEN 0 ELSE 1 END,
            table_schema,
            table_name,
            column_name
        """

        self._get_definitions(schema, query)

        return list(schema.values())


register(JRNYPostgreSQL)
