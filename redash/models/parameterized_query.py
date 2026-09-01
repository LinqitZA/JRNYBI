import re
from functools import partial
from numbers import Number

import pystache
from dateutil.parser import parse
from funcy import distinct

from flask_login import current_user

from redash.utils import gen_query_hash, json_loads, mustache_render


def _pluck_name_and_value(default_column, row):
    row = {k.lower(): v for k, v in row.items()}
    name_column = "name" if "name" in row.keys() else default_column.lower()
    value_column = "value" if "value" in row.keys() else default_column.lower()

    return {"name": row[name_column], "value": str(row[value_column])}


def _current_user_id():
    """The id of the logged-in user, or None outside a request context."""
    try:
        return current_user.id
    except Exception:
        return None


def _rls_result_for_current_user(query):
    """Newest stored result produced by THIS user for this query.

    Query.latest_query_data_id is always NULL on an RLS data source:
    tasks/queries/execution.py salts the query hash with the user id so users
    never share RLS-filtered results, while Query.update_latest_result() matches
    on the unsalted hash, so the pointer is never set. Dropdown options were read
    from that pointer, so every `query`-type parameter rendered with no options
    and /api/queries/<id>/dropdown returned a 500.

    Populating the pointer is not an option — one global "latest result" cannot
    represent per-user output, and pointing it at any single user's result would
    serve their rows to everyone else. Matching the user's own salted hash is safe
    by construction: the hash embeds the user id, so this can only ever return
    rows that this user already produced.
    """
    from redash import models

    user_id = _current_user_id()
    if user_id is None:
        return None

    # Same salt as tasks/queries/execution.enqueue_query — keep them in step.
    salted = gen_query_hash("{}::user_id={}".format(query.query_text, user_id))
    return (
        models.QueryResult.query.filter(
            models.QueryResult.query_hash == salted,
            models.QueryResult.data_source_id == query.data_source_id,
        )
        .order_by(models.QueryResult.retrieved_at.desc())
        .first()
    )


def _load_result(query_id, org):
    from redash import models

    query = models.Query.get_by_id_and_org(query_id, org)

    if not query.data_source:
        raise QueryDetachedFromDataSourceError(query_id)

    if query.latest_query_data_id:
        return models.QueryResult.get_by_id_and_org(query.latest_query_data_id, org).data

    cached = _rls_result_for_current_user(query)
    if cached is not None:
        return cached.data

    # No result this user has produced yet — run it for them. Lookup queries
    # backing a dropdown are small, and run_query injects their RLS context, so
    # the options are correct for whoever is looking at the report.
    data, error = query.data_source.query_runner.run_query(query.query_text, current_user)
    if error:
        raise DropdownValuesError(
            "Could not load options for this parameter: {}".format(error)
        )
    # BaseQueryRunner.run_query returns serialised JSON, but a runner is free to
    # return the already-deserialised dict (jrny_pg does), so accept both.
    return json_loads(data) if isinstance(data, (str, bytes, bytearray)) else data


def dropdown_values(query_id, org):
    data = _load_result(query_id, org)
    first_column = data["columns"][0]["name"]
    pluck = partial(_pluck_name_and_value, first_column)
    return list(map(pluck, data["rows"]))


def join_parameter_list_values(parameters, schema):
    updated_parameters = {}
    for key, value in parameters.items():
        if isinstance(value, list):
            definition = next((definition for definition in schema if definition["name"] == key), {})
            multi_values_options = definition.get("multiValuesOptions", {})
            separator = str(multi_values_options.get("separator", ","))
            prefix = str(multi_values_options.get("prefix", ""))
            suffix = str(multi_values_options.get("suffix", ""))
            updated_parameters[key] = separator.join([prefix + v + suffix for v in value])
        else:
            updated_parameters[key] = value
    return updated_parameters


def _collect_key_names(nodes):
    keys = []
    for node in nodes._parse_tree:
        if isinstance(node, pystache.parser._EscapeNode):
            keys.append(node.key)
        elif isinstance(node, pystache.parser._SectionNode):
            keys.append(node.key)
            keys.extend(_collect_key_names(node.parsed))

    return distinct(keys)


def _collect_query_parameters(query):
    nodes = pystache.parse(query)
    keys = _collect_key_names(nodes)
    return keys


def _parameter_names(parameter_values):
    names = []
    for key, value in parameter_values.items():
        if isinstance(value, dict):
            for inner_key in value.keys():
                names.append("{}.{}".format(key, inner_key))
        else:
            names.append(key)

    return names


def _is_number(string):
    if isinstance(string, Number):
        return True
    else:
        float(string)
        return True


def _is_regex_pattern(value, regex):
    try:
        if re.compile(regex).fullmatch(value):
            return True
        else:
            return False
    except re.error:
        return False


def _is_date(string):
    parse(string)
    return True


def _is_date_range(obj):
    return _is_date(obj["start"]) and _is_date(obj["end"])


def _is_unset_optional_filter(value):
    """An optional dropdown filter the user has not chosen a value for.

    The seeded JRNY reports are authored so that an empty value means "no
    filter":

        AND ('{{ category }}' = '' OR il.product_category = '{{ category }}')

    Redash has no native "any"/"all" option for `query` or `enum` parameters —
    a value must appear in the dropdown — so the empty default every one of
    those parameters ships with was rejected, and the report failed to load
    with "The following parameter values are incompatible with their
    definitions". On a dashboard that is fatal: each widget renders the error
    instead of data, with no way to intervene.

    Accepting the empty string restores the authored behaviour. It widens the
    accepted set by exactly one constant that carries no user input, so the
    injection guarantee of dropdown-restricted parameters is unchanged.
    """
    return value == ""


def _is_value_within_options(value, dropdown_options, allow_list=False):
    if isinstance(value, list):
        return allow_list and set(map(str, value)).issubset(set(dropdown_options))
    return str(value) in dropdown_options


class ParameterizedQuery:
    def __init__(self, template, schema=None, org=None):
        self.schema = schema or []
        self.org = org
        self.template = template
        self.query = template
        self.parameters = {}

    def apply(self, parameters):
        invalid_parameter_names = [key for (key, value) in parameters.items() if not self._valid(key, value)]
        if invalid_parameter_names:
            raise InvalidParameterError(invalid_parameter_names)
        else:
            self.parameters.update(parameters)
            self.query = mustache_render(self.template, join_parameter_list_values(parameters, self.schema))

        return self

    def _valid(self, name, value):
        if not self.schema:
            return True

        definition = next(
            (definition for definition in self.schema if definition["name"] == name),
            None,
        )

        if not definition:
            return False

        enum_options = definition.get("enumOptions")
        query_id = definition.get("queryId")
        regex = definition.get("regex")
        allow_multiple_values = isinstance(definition.get("multiValuesOptions"), dict)

        if isinstance(enum_options, str):
            enum_options = enum_options.split("\n")

        validators = {
            "text": lambda value: isinstance(value, str),
            "text-pattern": lambda value: _is_regex_pattern(value, regex),
            "number": _is_number,
            "enum": lambda value: _is_unset_optional_filter(value)
            or _is_value_within_options(value, enum_options, allow_multiple_values),
            "query": lambda value: _is_unset_optional_filter(value)
            or _is_value_within_options(
                value,
                [v["value"] for v in dropdown_values(query_id, self.org)],
                allow_multiple_values,
            ),
            "date": _is_date,
            "datetime-local": _is_date,
            "datetime-with-seconds": _is_date,
            "date-range": _is_date_range,
            "datetime-range": _is_date_range,
            "datetime-range-with-seconds": _is_date_range,
        }

        validate = validators.get(definition["type"], lambda x: False)

        try:
            # multiple error types can be raised here; but we want to convert
            # all except QueryDetached to InvalidParameterError in `apply`
            return validate(value)
        except QueryDetachedFromDataSourceError:
            raise
        except Exception:
            return False

    @property
    def is_safe(self):
        text_parameters = [param for param in self.schema if param["type"] == "text"]
        return not any(text_parameters)

    @property
    def missing_params(self):
        query_parameters = set(_collect_query_parameters(self.template))
        return set(query_parameters) - set(_parameter_names(self.parameters))

    @property
    def text(self):
        return self.query


class InvalidParameterError(Exception):
    def __init__(self, parameters):
        parameter_names = ", ".join(parameters)
        message = "The following parameter values are incompatible with their definitions: {}".format(parameter_names)
        super(InvalidParameterError, self).__init__(message)


class DropdownValuesError(Exception):
    """Raised when a `query`-type parameter's options cannot be loaded."""


class QueryDetachedFromDataSourceError(Exception):
    def __init__(self, query_id):
        self.query_id = query_id
        super(QueryDetachedFromDataSourceError, self).__init__(
            "This query is detached from any data source. Please select a different query."
        )
