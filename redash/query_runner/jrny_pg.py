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
from redash.query_runner.pg import PostgreSQL, _wait, _cleanup_ssl_certs, build_schema, full_table_name, types_map

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
    "crm",
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

    def _get_definitions_enriched(self, schema, query):
        """
        Like _get_definitions from base PostgreSQL, but also handles
        is_nullable column data to enrich the schema for autocomplete.
        """
        results, error = self.run_query(query, None)
        if error is not None:
            self._handle_run_query_error(error)

        # Custom build_schema that includes nullable info
        table_names = set(
            full_table_name(r["table_schema"], r["table_name"])
            for r in results["rows"]
        )
        for row in results["rows"]:
            if row["table_schema"] != "public":
                table_name = full_table_name(
                    row["table_schema"], row["table_name"]
                )
            else:
                if row["table_name"] in table_names:
                    table_name = full_table_name(
                        row["table_schema"], row["table_name"]
                    )
                else:
                    table_name = row["table_name"]

            if table_name not in schema:
                schema[table_name] = {"name": table_name, "columns": []}

            col_dict = {"name": row["column_name"]}
            if row.get("data_type") is not None:
                col_dict["type"] = row["data_type"]
            if row.get("is_nullable") is not None:
                col_dict["nullable"] = row["is_nullable"] == "YES"
            schema[table_name]["columns"].append(col_dict)

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
               data_type,
               is_nullable
        FROM (
            SELECT s.nspname AS table_schema,
                   c.relname AS table_name,
                   a.attname AS column_name,
                   NULL::text AS data_type,
                   CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable
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
                   data_type,
                   is_nullable
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

        self._get_definitions_enriched(schema, query)

        return list(schema.values())

    def _get_foreign_keys(self):
        """
        Query foreign key relationships from pg_catalog, filtered to
        JRNY schemas.  Uses pg_constraint with unnest(conkey, confkey)
        WITH ORDINALITY to correctly pair FK/referenced columns
        positionally (handles composite FKs without Cartesian products).

        Unlike information_schema.constraint_column_usage, pg_constraint
        does not require table ownership — only has_table_privilege SELECT
        access, which the jrnybi_reader role already has.

        Returns:
            dict: Mapping of (source_schema.source_table, source_column)
                  to {"schema": ref_schema, "table": ref_table, "column": ref_column}.
        """
        schema_list = ",".join("'{}'".format(s) for s in JRNY_SCHEMAS)

        query = """
        SELECT
            n_fk.nspname    AS fk_schema,
            c_fk.relname    AS fk_table,
            a_fk.attname    AS fk_column,
            n_ref.nspname   AS ref_schema,
            c_ref.relname   AS ref_table,
            a_ref.attname   AS ref_column
        FROM pg_constraint con
        JOIN pg_class c_fk      ON con.conrelid = c_fk.oid
        JOIN pg_namespace n_fk   ON c_fk.relnamespace = n_fk.oid
        JOIN pg_class c_ref     ON con.confrelid = c_ref.oid
        JOIN pg_namespace n_ref  ON c_ref.relnamespace = n_ref.oid
        CROSS JOIN LATERAL unnest(con.conkey, con.confkey)
            WITH ORDINALITY AS cols(fk_attnum, ref_attnum, ord)
        JOIN pg_attribute a_fk
          ON a_fk.attrelid = con.conrelid  AND a_fk.attnum = cols.fk_attnum
        JOIN pg_attribute a_ref
          ON a_ref.attrelid = con.confrelid AND a_ref.attnum = cols.ref_attnum
        WHERE con.contype = 'f'
          AND n_fk.nspname IN ({schemas})
          AND has_table_privilege(c_fk.oid, 'select')
          AND has_schema_privilege(n_fk.oid, 'usage')
          AND has_table_privilege(c_ref.oid, 'select')
          AND has_schema_privilege(n_ref.oid, 'usage')
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

    def _get_view_column_origins(self, view_deps):
        """
        Infer which base table column each view column originates from by
        combining pg_depend (which base table columns a view depends on)
        with name matching.

        PostgreSQL's pg_depend records column-level dependencies from a
        view's rewrite rule to base table columns, but does not record
        which *view* column each dependency maps to.  We bridge this gap
        by matching view column names to the dependent base column names
        -- a view column named "customer_id" that depends on a base table
        column also named "customer_id" is inferred as originating from it.
        This handles the common case (same-name pass-through columns) and
        also catches renamed columns via the COMMENT ON fallback.

        Args:
            view_deps: dict from _get_view_dependencies() mapping
                       "schema.view" -> ["schema.base_table", ...]

        Returns:
            dict: Mapping of ("schema.view_name", "view_col_name")
                  to [{"base_schema": str, "base_table": str, "base_column": str}].
        """
        if not view_deps:
            return {}

        schema_list = ",".join("'{}'".format(s) for s in JRNY_SCHEMAS)

        # Get all columns from base tables that are referenced by views
        query = """
        SELECT
            vs.nspname        AS view_schema,
            vc.relname        AS view_name,
            ts.nspname        AS base_schema,
            tc.relname        AS base_table,
            ta.attname        AS base_column
        FROM pg_depend d
        JOIN pg_rewrite rw     ON rw.oid = d.objid
        JOIN pg_class vc       ON vc.oid = rw.ev_class
        JOIN pg_namespace vs   ON vs.oid = vc.relnamespace
        JOIN pg_class tc       ON tc.oid = d.refobjid
        JOIN pg_namespace ts   ON ts.oid = tc.relnamespace
        JOIN pg_attribute ta   ON ta.attrelid = tc.oid
                              AND ta.attnum = d.refobjsubid
        WHERE d.classid    = 'pg_rewrite'::regclass
          AND d.deptype    = 'n'
          AND d.refobjsubid > 0
          AND vc.relkind   IN ('v', 'm')
          AND tc.relkind   IN ('r', 'p', 'f')
          AND vc.oid       <> tc.oid
          AND ta.attnum    > 0
          AND NOT ta.attisdropped
          AND vs.nspname   IN ({schemas})
          AND ts.nspname   NOT IN ('pg_catalog', 'information_schema')
          AND has_schema_privilege(vs.nspname, 'usage')
          AND has_schema_privilege(ts.nspname, 'usage')
        ORDER BY view_schema, view_name, base_schema, base_table
        """.format(schemas=schema_list)

        try:
            results, error = self.run_query(query, None)
            if error is not None:
                logger.warning("Failed to fetch view column deps: %s", error)
                return {}
        except Exception:
            logger.warning("Exception fetching view column deps", exc_info=True)
            return {}

        # Build map: view_full_name -> set of (base_full_name, base_column) pairs
        view_base_cols = {}
        if results and results.get("rows"):
            for row in results["rows"]:
                view_key = "{}.{}".format(
                    row.get("view_schema", ""), row.get("view_name", "")
                )
                base_col_entry = {
                    "base_schema": row.get("base_schema", ""),
                    "base_table": row.get("base_table", ""),
                    "base_column": row.get("base_column", ""),
                }
                if view_key not in view_base_cols:
                    view_base_cols[view_key] = []
                view_base_cols[view_key].append(base_col_entry)

        logger.debug(
            "Found base column dependencies for %d views", len(view_base_cols)
        )
        return view_base_cols

    def _infer_view_fk_from_origins(self, fk_map, view_base_cols, schema_dict):
        """
        Cross-reference view columns with base-table FK map using name
        matching.  For each view, look at the base columns the view depends
        on.  If a base column has an FK and the view has a column with the
        *same name*, infer that the view column inherits the FK.

        Args:
            fk_map: dict from _get_foreign_keys()
            view_base_cols: dict from _get_view_column_origins()
            schema_dict: the full schema dict (view_name -> {columns: [...]})

        Returns:
            dict: Additional FK entries for view columns.
        """
        inferred = {}

        for view_name, base_col_list in view_base_cols.items():
            # Get the view's own columns
            view_info = schema_dict.get(view_name)
            if not view_info:
                continue
            view_col_names = set()
            for col in view_info.get("columns", []):
                cn = col.get("name") if isinstance(col, dict) else col
                view_col_names.add(cn)

            for entry in base_col_list:
                base_full = "{}.{}".format(
                    entry["base_schema"], entry["base_table"]
                )
                base_col = entry["base_column"]

                # Check if this base column has an FK
                base_key = (base_full, base_col)
                if base_key not in fk_map:
                    continue

                # Check if the view has a column with the same name
                if base_col in view_col_names:
                    view_key = (view_name, base_col)
                    if view_key not in fk_map and view_key not in inferred:
                        inferred[view_key] = fk_map[base_key]

        logger.debug(
            "Inferred %d FK relationships for view columns", len(inferred)
        )
        return inferred

    def _parse_fk_comments(self, column_comments):
        """
        Parse COMMENT ON COLUMN annotations with the convention:
            'fk:schema.table.column'

        This provides a manual fallback for views whose columns can't be
        automatically traced to base FK columns (e.g. computed columns,
        renamed columns via expression-based views).

        Args:
            column_comments: dict mapping ("schema.table", col_name) -> description

        Returns:
            dict: FK entries from comments, in the same format as fk_map:
                  ("full_table_name", col_name) -> {"schema", "table", "column"}.
        """
        fk_re = re.compile(r"fk:(\w+)\.(\w+)\.(\w+)")
        comment_fks = {}

        for (table_name, col_name), comment in column_comments.items():
            if not comment:
                continue
            m = fk_re.search(comment)
            if m:
                comment_fks[(table_name, col_name)] = {
                    "schema": m.group(1),
                    "table": m.group(2),
                    "column": m.group(3),
                }

        if comment_fks:
            logger.debug(
                "Parsed %d FK annotations from column comments", len(comment_fks)
            )
        return comment_fks

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

        # Fetch FK relationships from base tables
        fk_map = self._get_foreign_keys()

        # Fetch view dependencies (reused for both FK inference and source_tables)
        view_deps = self._get_view_dependencies()

        # Infer FK relationships for view columns by tracing origins
        view_column_origins = self._get_view_column_origins(view_deps)
        inferred_fks = self._infer_view_fk_from_origins(fk_map, view_column_origins, schema_dict)

        # Fetch COMMENT ON annotations (needed for both descriptions and FK comments)
        table_comments, column_comments = self._get_comments()

        # Parse fk:schema.table.column comment annotations as fallback
        comment_fks = self._parse_fk_comments(column_comments)

        # Merge all FK maps: base FKs + inferred view FKs + comment FKs
        # Comment FKs have lowest priority (only fill gaps)
        merged_fk_map = {}
        merged_fk_map.update(comment_fks)
        merged_fk_map.update(inferred_fks)
        merged_fk_map.update(fk_map)  # Direct FKs have highest priority

        if merged_fk_map:
            for table_name, table_info in schema_dict.items():
                for column in table_info.get("columns", []):
                    col_name = column.get("name") if isinstance(column, dict) else column
                    key = (table_name, col_name)
                    if key in merged_fk_map:
                        if isinstance(column, dict):
                            column["fk"] = merged_fk_map[key]
                        else:
                            # Column is a plain string — upgrade to dict
                            idx = table_info["columns"].index(column)
                            table_info["columns"][idx] = {
                                "name": column,
                                "fk": merged_fk_map[key],
                            }
            logger.debug(
                "Enriched schema with %d total FK relationships "
                "(base: %d, inferred: %d, comments: %d)",
                len(merged_fk_map),
                len(fk_map),
                len(inferred_fks),
                len(comment_fks),
            )

        # Add source_tables to view entries (view_deps already fetched above)
        if view_deps:
            for table_name, table_info in schema_dict.items():
                if table_name in view_deps:
                    table_info["source_tables"] = view_deps[table_name]

        # Merge COMMENT ON annotations into schema (already fetched above)
        if table_comments or column_comments:
            for table_name, table_info in schema_dict.items():
                # Add table-level description
                if table_name in table_comments:
                    table_info["description"] = table_comments[table_name]

                # Add column-level descriptions (strip fk: prefix from display)
                for column in table_info.get("columns", []):
                    col_name = column.get("name") if isinstance(column, dict) else column
                    key = (table_name, col_name)
                    if key in column_comments:
                        desc = column_comments[key]
                        # Strip the fk:... annotation from the user-visible description
                        desc_clean = re.sub(r"\s*fk:\w+\.\w+\.\w+\s*", "", desc).strip()
                        if desc_clean:
                            if isinstance(column, dict):
                                column["description"] = desc_clean
                            else:
                                # Column is a plain string — upgrade to dict
                                idx = table_info["columns"].index(column)
                                table_info["columns"][idx] = {
                                    "name": column,
                                    "description": desc_clean,
                                }

        return list(schema_dict.values())


register(JRNYPostgreSQL)
