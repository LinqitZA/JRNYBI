import math
from datetime import datetime

import sqlparse
from flask import jsonify, request, url_for
from flask_login import login_required
from flask_restful import abort
from funcy import partial
from sqlalchemy.orm.exc import StaleDataError

from redash import models, settings
from redash.authentication.org_resolving import current_org
from redash.handlers.base import (
    BaseResource,
    filter_by_tags,
    get_object_or_404,
    org_scoped_rule,
    paginate,
    routes,
)
from redash.handlers.base import order_results as _order_results
from redash.handlers.query_results import run_query
from redash.models.parameterized_query import ParameterizedQuery
from redash.permissions import (
    can_modify,
    not_view_only,
    require_access,
    require_admin_or_owner,
    require_object_modify_permission,
    require_permission,
    view_only,
)
from redash.serializers import QuerySerializer
from redash.utils import collect_parameters_from_request

# Ordering map for relationships
order_map = {
    "name": "lowercase_name",
    "-name": "-lowercase_name",
    "created_at": "created_at",
    "-created_at": "-created_at",
    "schedule": "interval",
    "-schedule": "-interval",
    "runtime": "query_results-runtime",
    "-runtime": "-query_results-runtime",
    "executed_at": "query_results-retrieved_at",
    "-executed_at": "-query_results-retrieved_at",
    "created_by": "users-name",
    "-created_by": "-users-name",
    "starred_at": "favorites-created_at",
    "-starred_at": "-favorites-created_at",
}

order_results = partial(_order_results, default_order="-created_at", allowed_orders=order_map)


@routes.route(org_scoped_rule("/api/queries/format"), methods=["POST"])
@login_required
def format_sql_query(org_slug=None):
    """
    Formats an SQL query using the Python ``sqlparse`` formatter.

    :<json string query: The SQL text to format
    :>json string query: Formatted SQL text
    """
    arguments = request.get_json(force=True)
    query = arguments.get("query", "")

    return jsonify({"query": sqlparse.format(query, **settings.SQLPARSE_FORMAT_OPTIONS)})


class QuerySearchResource(BaseResource):
    @require_permission("view_query")
    def get(self):
        """
        Search query text, names, and descriptions.

        :qparam string q: Search term
        :qparam number include_drafts: Whether to include draft in results

        Responds with a list of :ref:`query <query-response-label>` objects.
        """
        term = request.args.get("q", "")
        if not term:
            return []

        include_drafts = request.args.get("include_drafts") is not None

        self.record_event({"action": "search", "object_type": "query", "term": term})

        # this redirects to the new query list API that is aware of search
        new_location = url_for(
            "queries",
            q=term,
            org_slug=current_org.slug,
            drafts="true" if include_drafts else "false",
        )
        return {}, 301, {"Location": new_location}


class QueryRecentResource(BaseResource):
    @require_permission("view_query")
    def get(self):
        """
        Retrieve up to 10 queries recently modified by the user.

        Responds with a list of :ref:`query <query-response-label>` objects.
        """

        results = models.Query.by_user(self.current_user).order_by(models.Query.updated_at.desc()).limit(10)
        return QuerySerializer(results, with_last_modified_by=False, with_user=False).serialize()


class BaseQueryListResource(BaseResource):
    def get_queries(self, search_term):
        if search_term:
            results = models.Query.search(
                search_term,
                self.current_user.group_ids,
                self.current_user.id,
                include_drafts=True,
                multi_byte_search=current_org.get_setting("multi_byte_search_enabled"),
            )
        else:
            results = models.Query.all_queries(self.current_user.group_ids, self.current_user.id, include_drafts=True)
        return filter_by_tags(results, models.Query.tags)

    @require_permission("view_query")
    def get(self):
        """
        Retrieve a list of queries.

        :qparam number page_size: Number of queries to return per page
        :qparam number page: Page number to retrieve
        :qparam number order: Name of column to order by
        :qparam number q: Full text search term

        Responds with an array of :ref:`query <query-response-label>` objects.
        """
        # See if we want to do full-text search or just regular queries
        search_term = request.args.get("q", "")

        queries = self.get_queries(search_term)

        results = filter_by_tags(queries, models.Query.tags)

        # order results according to passed order parameter,
        # special-casing search queries where the database
        # provides an order by search rank
        ordered_results = order_results(results, fallback=not bool(search_term))

        page = request.args.get("page", 1, type=int)
        page_size = request.args.get("page_size", 25, type=int)

        response = paginate(
            ordered_results,
            page=page,
            page_size=page_size,
            serializer=QuerySerializer,
            with_stats=True,
            with_last_modified_by=False,
        )

        if search_term:
            self.record_event({"action": "search", "object_type": "query", "term": search_term})
        else:
            self.record_event({"action": "list", "object_type": "query"})

        return response


def require_access_to_dropdown_queries(user, query_def):
    parameters = query_def.get("options", {}).get("parameters", [])
    dropdown_query_ids = set([str(p["queryId"]) for p in parameters if p["type"] == "query"])

    if dropdown_query_ids:
        groups = models.Query.all_groups_for_query_ids(dropdown_query_ids)

        if len(groups) < len(dropdown_query_ids):
            abort(
                400,
                message="You are trying to associate a dropdown query that does not have a matching group. "
                "Please verify the dropdown query id you are trying to associate with this query.",
            )

        require_access(dict(groups), user, view_only)


class QueryListResource(BaseQueryListResource):
    @require_permission("create_query")
    def post(self):
        """
        Create a new query.

        :<json number data_source_id: The ID of the data source this query will run on
        :<json string query: Query text
        :<json string name:
        :<json string description:
        :<json string schedule: Schedule interval, in seconds, for repeated execution of this query
        :<json object options: Query options

        .. _query-response-label:

        :>json number id: Query ID
        :>json number latest_query_data_id: ID for latest output data from this query
        :>json string name:
        :>json string description:
        :>json string query: Query text
        :>json string query_hash: Hash of query text
        :>json string schedule: Schedule interval, in seconds, for repeated execution of this query
        :>json string api_key: Key for public access to this query's results.
        :>json boolean is_archived: Whether this query is displayed in indexes and search results or not.
        :>json boolean is_draft: Whether this query is a draft or not
        :>json string updated_at: Time of last modification, in ISO format
        :>json string created_at: Time of creation, in ISO format
        :>json number data_source_id: ID of the data source this query will run on
        :>json object options: Query options
        :>json number version: Revision version (for update conflict avoidance)
        :>json number user_id: ID of query creator
        :>json number last_modified_by_id: ID of user who last modified this query
        :>json string retrieved_at: Time when query results were last retrieved, in ISO format (may be null)
        :>json number runtime: Runtime of last query execution, in seconds (may be null)
        """
        query_def = request.get_json(force=True)
        data_source = models.DataSource.get_by_id_and_org(query_def.pop("data_source_id"), self.current_org)
        require_access(data_source, self.current_user, not_view_only)
        require_access_to_dropdown_queries(self.current_user, query_def)

        for field in [
            "id",
            "created_at",
            "api_key",
            "visualizations",
            "latest_query_data",
            "last_modified_by",
        ]:
            query_def.pop(field, None)

        query_def["query_text"] = query_def.pop("query")
        query_def["user"] = self.current_user
        query_def["data_source"] = data_source
        query_def["org"] = self.current_org
        query_def["is_draft"] = True
        query = models.Query.create(**query_def)
        models.db.session.add(query)
        models.db.session.commit()
        query.update_latest_result_by_query_hash()
        models.db.session.commit()

        self.record_event({"action": "create", "object_id": query.id, "object_type": "query"})

        return QuerySerializer(query, with_visualizations=True).serialize()


class QueryArchiveResource(BaseQueryListResource):
    def get_queries(self, search_term):
        if search_term:
            return models.Query.search(
                search_term,
                self.current_user.group_ids,
                self.current_user.id,
                include_drafts=False,
                include_archived=True,
                multi_byte_search=current_org.get_setting("multi_byte_search_enabled"),
            )
        else:
            return models.Query.all_queries(
                self.current_user.group_ids,
                self.current_user.id,
                include_drafts=False,
                include_archived=True,
            )


class MyQueriesResource(BaseResource):
    @require_permission("view_query")
    def get(self):
        """
        Retrieve a list of queries created by the current user.

        :qparam number page_size: Number of queries to return per page
        :qparam number page: Page number to retrieve
        :qparam number order: Name of column to order by
        :qparam number search: Full text search term

        Responds with an array of :ref:`query <query-response-label>` objects.
        """
        search_term = request.args.get("q", "")
        if search_term:
            results = models.Query.search_by_user(
                search_term,
                self.current_user,
                multi_byte_search=current_org.get_setting("multi_byte_search_enabled"),
            )
        else:
            results = models.Query.by_user(self.current_user)

        results = filter_by_tags(results, models.Query.tags)

        # order results according to passed order parameter,
        # special-casing search queries where the database
        # provides an order by search rank
        ordered_results = order_results(results, fallback=not bool(search_term))

        page = request.args.get("page", 1, type=int)
        page_size = request.args.get("page_size", 25, type=int)
        return paginate(
            ordered_results,
            page,
            page_size,
            QuerySerializer,
            with_stats=True,
            with_last_modified_by=False,
        )


class QueryResource(BaseResource):
    @require_permission("edit_query")
    def post(self, query_id):
        """
        Modify a query.

        :param query_id: ID of query to update
        :<json number data_source_id: The ID of the data source this query will run on
        :<json string query: Query text
        :<json string name:
        :<json string description:
        :<json string schedule: Schedule interval, in seconds, for repeated execution of this query
        :<json object options: Query options

        Responds with the updated :ref:`query <query-response-label>` object.
        """
        query = get_object_or_404(models.Query.get_by_id_and_org, query_id, self.current_org)
        query_def = request.get_json(force=True)

        require_object_modify_permission(query, self.current_user)
        require_access_to_dropdown_queries(self.current_user, query_def)

        for field in [
            "id",
            "created_at",
            "api_key",
            "visualizations",
            "latest_query_data",
            "user",
            "last_modified_by",
            "org",
        ]:
            query_def.pop(field, None)

        if "query" in query_def:
            query_def["query_text"] = query_def.pop("query")

        if "tags" in query_def:
            query_def["tags"] = [tag for tag in query_def["tags"] if tag]

        if "data_source_id" in query_def:
            data_source = models.DataSource.get_by_id_and_org(query_def["data_source_id"], self.current_org)
            require_access(data_source, self.current_user, not_view_only)

        query_def["last_modified_by"] = self.current_user
        query_def["changed_by"] = self.current_user
        # SQLAlchemy handles the case where a concurrent transaction beats us
        # to the update. But we still have to make sure that we're not starting
        # out behind.
        if "version" in query_def and query_def["version"] != query.version:
            abort(409)

        try:
            self.update_model(query, query_def)
            models.db.session.commit()
            query.update_latest_result_by_query_hash()
            models.db.session.commit()
        except StaleDataError:
            abort(409)

        return QuerySerializer(query, with_visualizations=True).serialize()

    @require_permission("view_query")
    def get(self, query_id):
        """
        Retrieve a query.

        :param query_id: ID of query to fetch

        Responds with the :ref:`query <query-response-label>` contents.
        """
        q = get_object_or_404(models.Query.get_by_id_and_org, query_id, self.current_org)
        require_access(q, self.current_user, view_only)

        result = QuerySerializer(q, with_visualizations=True).serialize()
        result["can_edit"] = can_modify(q, self.current_user)

        self.record_event({"action": "view", "object_id": query_id, "object_type": "query"})

        return result

    # TODO: move to resource of its own? (POST /queries/{id}/archive)
    def delete(self, query_id):
        """
        Archives a query.

        :param query_id: ID of query to archive
        """
        query = get_object_or_404(models.Query.get_by_id_and_org, query_id, self.current_org)
        require_admin_or_owner(query.user_id)
        query.archive(self.current_user)
        models.db.session.commit()


class QueryRegenerateApiKeyResource(BaseResource):
    @require_permission("edit_query")
    def post(self, query_id):
        query = get_object_or_404(models.Query.get_by_id_and_org, query_id, self.current_org)
        require_admin_or_owner(query.user_id)
        query.regenerate_api_key()
        models.db.session.commit()

        self.record_event(
            {
                "action": "regnerate_api_key",
                "object_id": query_id,
                "object_type": "query",
            }
        )

        result = QuerySerializer(query).serialize()
        return result


class QueryForkResource(BaseResource):
    @require_permission("edit_query")
    def post(self, query_id):
        """
        Creates a new query, copying the query text from an existing one.

        :param query_id: ID of query to fork

        Responds with created :ref:`query <query-response-label>` object.
        """
        query = get_object_or_404(models.Query.get_by_id_and_org, query_id, self.current_org)
        require_access(query.data_source, self.current_user, not_view_only)
        forked_query = query.fork(self.current_user)
        models.db.session.commit()

        self.record_event({"action": "fork", "object_id": query_id, "object_type": "query"})

        return QuerySerializer(forked_query, with_visualizations=True).serialize()


class QueryRefreshResource(BaseResource):
    def post(self, query_id):
        """
        Execute a query, updating the query object with the results.

        :param query_id: ID of query to execute

        Responds with query task details.
        """
        # TODO: this should actually check for permissions, but because currently you can only
        # get here either with a user API key or a query one, we can just check whether it's
        # an api key (meaning this is a query API key, which only grants read access).
        if self.current_user.is_api_user():
            abort(403, message="Please use a user API key.")

        query = get_object_or_404(models.Query.get_by_id_and_org, query_id, self.current_org)
        require_access(query, self.current_user, not_view_only)

        parameter_values = collect_parameters_from_request(request.args)
        parameterized_query = ParameterizedQuery(query.query_text, org=self.current_org)
        should_apply_auto_limit = query.options.get("apply_auto_limit", False)
        return run_query(parameterized_query, parameter_values, query.data_source, query.id, should_apply_auto_limit)


class QueryTagsResource(BaseResource):
    def get(self):
        """
        Returns all query tags including those for drafts.
        """
        tags = models.Query.all_tags(self.current_user, include_drafts=True)
        return {"tags": [{"name": name, "count": count} for name, count in tags]}


class QueryFavoriteListResource(BaseResource):
    def get(self):
        search_term = request.args.get("q")

        if search_term:
            base_query = models.Query.search(
                search_term,
                self.current_user.group_ids,
                include_drafts=True,
                limit=None,
                multi_byte_search=current_org.get_setting("multi_byte_search_enabled"),
            )
            favorites = models.Query.favorites(self.current_user, base_query=base_query)
        else:
            favorites = models.Query.favorites(self.current_user)

        favorites = filter_by_tags(favorites, models.Query.tags)

        # order results according to passed order parameter,
        # special-casing search queries where the database
        # provides an order by search rank
        ordered_favorites = order_results(favorites, fallback=not bool(search_term))

        page = request.args.get("page", 1, type=int)
        page_size = request.args.get("page_size", 25, type=int)
        response = paginate(
            ordered_favorites,
            page,
            page_size,
            QuerySerializer,
            with_stats=True,
            with_last_modified_by=False,
        )

        self.record_event(
            {
                "action": "load_favorites",
                "object_type": "query",
                "params": {
                    "q": search_term,
                    "tags": request.args.getlist("tags"),
                    "page": page,
                },
            }
        )

        return response


def _coerce_float(value):
    """Best-effort conversion of arbitrary cell value to float, or None."""
    if value is None:
        return None
    if isinstance(value, bool):
        # bool is a subclass of int; reject it as not a numeric measurement
        return None
    if isinstance(value, (int, float)):
        try:
            f = float(value)
        except (TypeError, ValueError):
            return None
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    if isinstance(value, str):
        try:
            f = float(value)
        except (TypeError, ValueError):
            return None
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    return None


def _autodetect_columns(columns, rows):
    """Pick a sensible x (time/category) and y (numeric) column from a query result."""
    if not columns or not rows:
        return None, None

    time_types = {"date", "datetime", "datetime-no-second", "time"}
    numeric_types = {"integer", "float", "number"}

    x_col = None
    y_col = None
    for c in columns:
        name = c.get("name")
        ftype = (c.get("friendly_type") or c.get("type") or "").lower()
        if x_col is None and ftype in time_types:
            x_col = name
        elif y_col is None and ftype in numeric_types:
            y_col = name

    # Fallback heuristic: scan first row values
    if x_col is None or y_col is None:
        sample = rows[0] if rows else {}
        for c in columns:
            name = c.get("name")
            if x_col is None:
                v = sample.get(name)
                if isinstance(v, str) and len(v) >= 8 and ("-" in v or "/" in v or ":" in v):
                    x_col = name
            if y_col is None and _coerce_float(sample.get(name)) is not None:
                # Don't pick the same column as both x and y
                if name != x_col:
                    y_col = name

    return x_col, y_col


def _sort_key_for_x(x_value):
    """Best-effort comparable key for x values (datetime parsed if possible)."""
    if x_value is None:
        return (1, "")
    if isinstance(x_value, (int, float)):
        return (0, float(x_value))
    if isinstance(x_value, str):
        # Try common ISO datetime / date prefixes
        for fmt in (
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
            "%Y/%m/%d %H:%M:%S",
            "%Y/%m/%d",
        ):
            try:
                # Strip trailing fractional seconds / timezone if present
                trimmed = x_value[:19] if "T" in x_value or " " in x_value else x_value[:10]
                return (0, datetime.strptime(trimmed, fmt).timestamp())
            except (ValueError, TypeError):
                continue
        return (0, x_value)
    return (1, str(x_value))


def _compute_anomalies(rows, x_col, y_col, window, threshold):
    """
    Rolling-window z-score anomaly detection.

    For each point i, compute the mean and standard deviation of the previous
    `window` y-values (excluding the point itself, so the point can't dominate
    its own band). Flag points whose |z| >= threshold.

    Returns a dict: { points, bounds, summary }
      - points: list of {index, x, y, z, mean, stddev, direction}
      - bounds: list of {x, upper, lower, mean}
      - summary: {count, threshold, window, x_col, y_col, total_points}
    """
    # Build (x, y, original_index) for points where y is numeric
    series = []
    for i, row in enumerate(rows):
        y = _coerce_float(row.get(y_col))
        if y is None:
            continue
        x = row.get(x_col)
        series.append((x, y, i))

    # Sort by x to make rolling window meaningful in time order
    series.sort(key=lambda t: _sort_key_for_x(t[0]))

    bounds = []
    anomalies = []
    for i, (x, y, original_index) in enumerate(series):
        window_start = max(0, i - window)
        window_vals = [series[j][1] for j in range(window_start, i)]
        n = len(window_vals)
        if n < 3:
            # Not enough history for meaningful statistics
            bounds.append({"x": x, "upper": None, "lower": None, "mean": None})
            continue
        mean = sum(window_vals) / n
        var = sum((v - mean) ** 2 for v in window_vals) / n
        stddev = math.sqrt(var)

        upper = mean + threshold * stddev
        lower = mean - threshold * stddev
        bounds.append({"x": x, "upper": upper, "lower": lower, "mean": mean})

        if stddev > 0:
            z = (y - mean) / stddev
        else:
            z = 0.0 if y == mean else float("inf") if y > mean else float("-inf")

        if abs(z) >= threshold and math.isfinite(z):
            direction = "above" if z > 0 else "below"
            anomalies.append(
                {
                    "index": original_index,
                    "x": x,
                    "y": y,
                    "z": round(z, 2),
                    "mean": mean,
                    "stddev": stddev,
                    "direction": direction,
                }
            )

    return {
        "points": anomalies,
        "bounds": bounds,
        "summary": {
            "count": len(anomalies),
            "threshold": threshold,
            "window": window,
            "x_column": x_col,
            "y_column": y_col,
            "total_points": len(series),
        },
    }


class QueryAnomaliesResource(BaseResource):
    """
    Detect anomalies in a time series for a query's latest cached result.

    Computes a rolling-window z-score for the chosen y column ordered by the
    chosen x column. Returns flagged points + expected upper/lower bounds per x.

    Query parameters:
      x: x-axis column name (autodetected if omitted - first datetime column)
      y: y-axis column name (autodetected if omitted - first numeric column)
      window: rolling window size (default 30)
      threshold: z-score magnitude that flags a point (default 2.0)
    """

    @require_permission("view_query")
    def get(self, query_id):
        query = get_object_or_404(models.Query.get_by_id_and_org, query_id, self.current_org)
        require_access(query, self.current_user, view_only)

        if not query.latest_query_data or not query.latest_query_data.data:
            return {
                "error": "no_data",
                "message": "Query has no cached results. Execute the query first.",
            }, 400

        data = query.latest_query_data.data
        columns = data.get("columns") or []
        rows = data.get("rows") or []

        x_col = request.args.get("x")
        y_col = request.args.get("y")
        if not x_col or not y_col:
            auto_x, auto_y = _autodetect_columns(columns, rows)
            x_col = x_col or auto_x
            y_col = y_col or auto_y

        if not x_col or not y_col:
            return {
                "error": "cannot_detect_columns",
                "message": "Could not auto-detect x (time) and y (numeric) columns. Pass ?x=<col>&y=<col>.",
            }, 400

        try:
            window = int(request.args.get("window", 30))
        except (TypeError, ValueError):
            window = 30
        try:
            threshold = float(request.args.get("threshold", 2.0))
        except (TypeError, ValueError):
            threshold = 2.0

        window = max(3, min(window, 1000))
        threshold = max(0.5, min(threshold, 10.0))

        result = _compute_anomalies(rows, x_col, y_col, window, threshold)

        self.record_event(
            {
                "action": "compute_anomalies",
                "object_id": query.id,
                "object_type": "query",
            }
        )

        return result
