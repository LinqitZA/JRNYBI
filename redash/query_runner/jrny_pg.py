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

        All SET LOCAL statements and the user query execute within an explicit
        BEGIN/COMMIT transaction block. This is required because psycopg2 async
        connections do not automatically wrap statements in a transaction, and
        SET LOCAL only takes effect inside a transaction block.

        The transaction scopes the session variables to this query only —
        they cannot leak to other connections or subsequent queries.

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
            # Start an explicit transaction block so SET LOCAL takes effect.
            # psycopg2 async connections don't auto-wrap in BEGIN/COMMIT.
            cursor.execute("BEGIN")
            _wait(connection)

            # Inject RLS SET LOCAL statements within the transaction
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

            # Commit the transaction to cleanly end the block
            cursor.execute("COMMIT")
            _wait(connection)
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
        SELECT table_schema,
               table_name,
               column_name,
               data_type
        FROM (
            SELECT s.nspname AS table_schema,
                   c.relname AS table_name,
                   a.attname AS column_name,
                   NULL::text AS data_type
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
        ) AS combined
        ORDER BY
            CASE WHEN table_schema = 'reporting' THEN 0 ELSE 1 END,
            table_schema,
            table_name,
            column_name
        """

        self._get_definitions(schema, query)

        return list(schema.values())

    def _get_foreign_keys(self):
        """
        Query foreign key relationships from information_schema, filtered to
        JRNY schemas.  Respects has_table_privilege and has_schema_privilege
        so that only accessible FK metadata is returned.

        Returns:
            dict: Mapping of (source_schema.source_table, source_column)
                  to {"schema": ref_schema, "table": ref_table, "column": ref_column}.
        """
        schema_list = ",".join("'{}'".format(s) for s in JRNY_SCHEMAS)

        query = """
        SELECT
            tc.table_schema   AS fk_schema,
            tc.table_name     AS fk_table,
            kcu.column_name   AS fk_column,
            ccu.table_schema  AS ref_schema,
            ccu.table_name    AS ref_table,
            ccu.column_name   AS ref_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name    = kcu.constraint_name
         AND tc.constraint_schema  = kcu.constraint_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name    = ccu.constraint_name
         AND tc.constraint_schema  = ccu.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema IN ({schemas})
          AND has_table_privilege(
                quote_ident(tc.table_schema) || '.' || quote_ident(tc.table_name),
                'select')
          AND has_schema_privilege(tc.table_schema, 'usage')
          AND has_table_privilege(
                quote_ident(ccu.table_schema) || '.' || quote_ident(ccu.table_name),
                'select')
          AND has_schema_privilege(ccu.table_schema, 'usage')
        """.format(schemas=schema_list)

        try:
            results, error = self.run_query(query, None)
            if error is not None:
                logger.warning("Failed to fetch foreign keys: %s", error)
                return {}
        except Exception:
            logger.warning("Exception fetching foreign keys", exc_info=True)
            return {}

        fk_map = {}
        if results and results.get("rows"):
            for row in results["rows"]:
                fk_schema = row.get("fk_schema", "")
                fk_table = row.get("fk_table", "")
                fk_column = row.get("fk_column", "")
                ref_schema = row.get("ref_schema", "")
                ref_table = row.get("ref_table", "")
                ref_column = row.get("ref_column", "")

                # Build the full table name matching build_schema() output
                full_name = "{}.{}".format(fk_schema, fk_table)
                fk_map[(full_name, fk_column)] = {
                    "schema": ref_schema,
                    "table": ref_table,
                    "column": ref_column,
                }

        return fk_map

    def _get_view_dependencies(self):
        """
        Query pg_depend + pg_rewrite + pg_class to map each view to its
        underlying base tables.

        Returns:
            dict: Mapping of "schema.view_name" -> ["schema.base_table", ...]
        """
        query = """
        SELECT DISTINCT
            vs.nspname  AS view_schema,
            vc.relname  AS view_name,
            ts.nspname  AS table_schema,
            tc.relname  AS table_name
        FROM pg_depend d
        JOIN pg_rewrite r    ON r.oid = d.objid
        JOIN pg_class vc     ON vc.oid = r.ev_class
        JOIN pg_namespace vs ON vs.oid = vc.relnamespace
        JOIN pg_class tc     ON tc.oid = d.refobjid
        JOIN pg_namespace ts ON ts.oid = tc.relnamespace
        WHERE d.classid  = 'pg_rewrite'::regclass
          AND d.deptype   = 'n'
          AND vc.relkind  IN ('v', 'm')
          AND tc.relkind  IN ('r', 'p', 'f')
          AND vc.oid      <> tc.oid
          AND vs.nspname  NOT IN ('pg_catalog', 'information_schema')
          AND ts.nspname  NOT IN ('pg_catalog', 'information_schema')
          AND has_schema_privilege(vs.nspname, 'usage')
          AND has_schema_privilege(ts.nspname, 'usage')
        ORDER BY view_schema, view_name, table_schema, table_name
        """

        try:
            results, error = self.run_query(query, None)
            if error is not None:
                logger.warning("Failed to fetch view dependencies: %s", error)
                return {}
        except Exception:
            logger.warning("Exception fetching view dependencies", exc_info=True)
            return {}

        view_deps = {}
        if results and results.get("rows"):
            for row in results["rows"]:
                view_key = "{}.{}".format(
                    row.get("view_schema", ""), row.get("view_name", "")
                )
                table_key = "{}.{}".format(
                    row.get("table_schema", ""), row.get("table_name", "")
                )
                if view_key not in view_deps:
                    view_deps[view_key] = []
                view_deps[view_key].append(table_key)

        logger.debug(
            "Found view dependencies for %d views", len(view_deps)
        )
        return view_deps

    def _get_comments(self):
        """
        Fetch table and column COMMENT ON annotations from pg_catalog.

        Uses obj_description() for table-level comments and
        col_description() for column-level comments, filtered to JRNY schemas.

        Returns:
            tuple: (table_comments, column_comments) where:
                - table_comments: dict mapping "schema.table" -> description string
                - column_comments: dict mapping ("schema.table", column_name) -> description string
        """
        schema_list = ",".join("'{}'".format(s) for s in JRNY_SCHEMAS)

        query = """
        SELECT
            c.table_schema,
            c.table_name,
            c.column_name,
            c.ordinal_position,
            obj_description(
                (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
                'pg_class'
            ) AS table_comment,
            col_description(
                (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
                c.ordinal_position
            ) AS column_comment
        FROM information_schema.columns c
        WHERE c.table_schema IN ({schemas})
          AND has_schema_privilege(c.table_schema, 'usage')
          AND has_table_privilege(
                quote_ident(c.table_schema) || '.' || quote_ident(c.table_name),
                'select'
              )
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
        """.format(schemas=schema_list)

        try:
            results, error = self.run_query(query, None)
            if error is not None:
                logger.warning("Failed to fetch comments: %s", error)
                return {}, {}
        except Exception:
            logger.warning("Exception fetching comments", exc_info=True)
            return {}, {}

        table_comments = {}
        column_comments = {}

        if results and results.get("rows"):
            for row in results["rows"]:
                schema_name = row.get("table_schema", "")
                table_name = row.get("table_name", "")
                full_name = "{}.{}".format(schema_name, table_name)
                col_name = row.get("column_name", "")

                tc = row.get("table_comment")
                if tc and full_name not in table_comments:
                    table_comments[full_name] = tc

                cc = row.get("column_comment")
                if cc:
                    column_comments[(full_name, col_name)] = cc

        logger.debug(
            "Fetched %d table comments and %d column comments",
            len(table_comments),
            len(column_comments),
        )
        return table_comments, column_comments

    def get_schema(self, get_stats=False):
        """
        Override to enrich the schema payload with foreign key relationship
        data, view dependency information, and COMMENT ON annotations.

        Each column that is a foreign key gets an additional 'fk'
        field: {"schema": str, "table": str, "column": str}.

        Each view entry gets a 'source_tables' field containing the list of
        base tables that the view selects from.

        Tables get a 'description' field from COMMENT ON TABLE.
        Columns get a 'description' field from COMMENT ON COLUMN.
        """
        from redash import settings

        schema_dict = {}
        self._get_tables(schema_dict)

        if settings.SCHEMA_RUN_TABLE_SIZE_CALCULATIONS and get_stats:
            self._get_tables_stats(schema_dict)

        # Fetch FK relationships and merge into the column data
        fk_map = self._get_foreign_keys()
        if fk_map:
            for table_name, table_info in schema_dict.items():
                for column in table_info.get("columns", []):
                    col_name = column.get("name") if isinstance(column, dict) else column
                    key = (table_name, col_name)
                    if key in fk_map:
                        if isinstance(column, dict):
                            column["fk"] = fk_map[key]
                        else:
                            # Column is a plain string — upgrade to dict
                            idx = table_info["columns"].index(column)
                            table_info["columns"][idx] = {
                                "name": column,
                                "fk": fk_map[key],
                            }
            logger.debug(
                "Enriched schema with %d foreign key relationships", len(fk_map)
            )

        # Fetch view dependencies and add source_tables to view entries
        view_deps = self._get_view_dependencies()
        if view_deps:
            for table_name, table_info in schema_dict.items():
                if table_name in view_deps:
                    table_info["source_tables"] = view_deps[table_name]

        # Fetch COMMENT ON annotations and merge into schema
        table_comments, column_comments = self._get_comments()
        if table_comments or column_comments:
            for table_name, table_info in schema_dict.items():
                # Add table-level description
                if table_name in table_comments:
                    table_info["description"] = table_comments[table_name]

                # Add column-level descriptions
                for column in table_info.get("columns", []):
                    col_name = column.get("name") if isinstance(column, dict) else column
                    key = (table_name, col_name)
                    if key in column_comments:
                        if isinstance(column, dict):
                            column["description"] = column_comments[key]
                        else:
                            # Column is a plain string — upgrade to dict
                            idx = table_info["columns"].index(column)
                            table_info["columns"][idx] = {
                                "name": column,
                                "description": column_comments[key],
                            }

        return list(schema_dict.values())


register(JRNYPostgreSQL)
