from collections import namedtuple
from unittest import TestCase

import pytest
from mock import patch

from redash.models.parameterized_query import (
    InvalidParameterError,
    ParameterizedQuery,
    QueryDetachedFromDataSourceError,
    dropdown_values,
)


class TestParameterizedQuery(TestCase):
    def test_returns_empty_list_for_regular_query(self):
        query = ParameterizedQuery("SELECT 1")
        self.assertEqual(set([]), query.missing_params)

    def test_finds_all_params_when_missing(self):
        query = ParameterizedQuery("SELECT {{param}} FROM {{table}}")
        self.assertEqual(set(["param", "table"]), query.missing_params)

    def test_finds_all_params(self):
        query = ParameterizedQuery("SELECT {{param}} FROM {{table}}").apply({"param": "value", "table": "value"})
        self.assertEqual(set([]), query.missing_params)

    def test_deduplicates_params(self):
        query = ParameterizedQuery("SELECT {{param}}, {{param}} FROM {{table}}").apply(
            {"param": "value", "table": "value"}
        )
        self.assertEqual(set([]), query.missing_params)

    def test_handles_nested_params(self):
        query = ParameterizedQuery(
            "SELECT {{param}}, {{param}} FROM {{table}} -- {{#test}} {{nested_param}} {{/test}}"
        ).apply({"param": "value", "table": "value"})
        self.assertEqual(set(["test", "nested_param"]), query.missing_params)

    def test_handles_objects(self):
        query = ParameterizedQuery(
            "SELECT * FROM USERS WHERE created_at between '{{ created_at.start }}' and '{{ created_at.end }}'"
        ).apply({"created_at": {"start": 1, "end": 2}})
        self.assertEqual(set([]), query.missing_params)

    def test_raises_on_parameters_not_in_schema(self):
        schema = [{"name": "bar", "type": "text"}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"qux": 7})

    def test_raises_on_invalid_text_parameters(self):
        schema = [{"name": "bar", "type": "text"}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": 7})

    @patch("redash.models.parameterized_query._is_number", side_effect=ArithmeticError)
    def test_raises_on_unexpected_validation_error(self, _):
        schema = [{"name": "bar", "type": "number"}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": 5})

    def test_validates_text_parameters(self):
        schema = [{"name": "bar", "type": "text"}]
        query = ParameterizedQuery("foo {{bar}}", schema)

        query.apply({"bar": "baz"})

        self.assertEqual("foo baz", query.text)

    def test_validates_text_pattern_parameters(self):
        schema = [{"name": "bar", "type": "text-pattern", "regex": "a+"}]
        query = ParameterizedQuery("foo {{bar}}", schema)

        query.apply({"bar": "a"})

        self.assertEqual("foo a", query.text)

    def test_raises_on_invalid_text_pattern_parameters(self):
        schema = schema = [{"name": "bar", "type": "text-pattern", "regex": "a+"}]
        query = ParameterizedQuery("foo {{bar}}", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": "b"})

    def test_raises_on_invalid_number_parameters(self):
        schema = [{"name": "bar", "type": "number"}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": "baz"})

    def test_validates_number_parameters(self):
        schema = [{"name": "bar", "type": "number"}]
        query = ParameterizedQuery("foo {{bar}}", schema)

        query.apply({"bar": 7})

        self.assertEqual("foo 7", query.text)

    def test_coerces_number_parameters(self):
        schema = [{"name": "bar", "type": "number"}]
        query = ParameterizedQuery("foo {{bar}}", schema)

        query.apply({"bar": "3.14"})

        self.assertEqual("foo 3.14", query.text)

    def test_raises_on_invalid_date_parameters(self):
        schema = [{"name": "bar", "type": "date"}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": "baz"})

    def test_raises_on_none_for_date_parameters(self):
        schema = [{"name": "bar", "type": "date"}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": None})

    def test_validates_date_parameters(self):
        schema = [{"name": "bar", "type": "date"}]
        query = ParameterizedQuery("foo {{bar}}", schema)

        query.apply({"bar": "2000-01-01 12:00:00"})

        self.assertEqual("foo 2000-01-01 12:00:00", query.text)

    def test_raises_on_invalid_enum_parameters(self):
        schema = [{"name": "bar", "type": "enum", "enumOptions": ["baz", "qux"]}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": 7})

    def test_raises_on_unlisted_enum_value_parameters(self):
        schema = [{"name": "bar", "type": "enum", "enumOptions": ["baz", "qux"]}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": "shlomo"})

    def test_raises_on_unlisted_enum_list_value_parameters(self):
        schema = [
            {
                "name": "bar",
                "type": "enum",
                "enumOptions": ["baz", "qux"],
                "multiValuesOptions": {"separator": ",", "prefix": "", "suffix": ""},
            }
        ]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": ["shlomo", "baz"]})

    def test_validates_enum_parameters(self):
        schema = [{"name": "bar", "type": "enum", "enumOptions": ["baz", "qux"]}]
        query = ParameterizedQuery("foo {{bar}}", schema)

        query.apply({"bar": "baz"})

        self.assertEqual("foo baz", query.text)

    def test_validates_enum_list_value_parameters(self):
        schema = [
            {
                "name": "bar",
                "type": "enum",
                "enumOptions": ["baz", "qux"],
                "multiValuesOptions": {"separator": ",", "prefix": "'", "suffix": "'"},
            }
        ]
        query = ParameterizedQuery("foo {{bar}}", schema)

        query.apply({"bar": ["qux", "baz"]})

        self.assertEqual("foo 'qux','baz'", query.text)

    @patch(
        "redash.models.parameterized_query.dropdown_values",
        return_value=[{"value": "1"}],
    )
    def test_validation_accepts_integer_values_for_dropdowns(self, _):
        schema = [{"name": "bar", "type": "query", "queryId": 1}]
        query = ParameterizedQuery("foo {{bar}}", schema)

        query.apply({"bar": 1})

        self.assertEqual("foo 1", query.text)

    @patch("redash.models.parameterized_query.dropdown_values")
    def test_raises_on_invalid_query_parameters(self, _):
        schema = [{"name": "bar", "type": "query", "queryId": 1}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": 7})

    @patch(
        "redash.models.parameterized_query.dropdown_values",
        return_value=[{"value": "baz"}],
    )
    def test_raises_on_unlisted_query_value_parameters(self, _):
        schema = [{"name": "bar", "type": "query", "queryId": 1}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": "shlomo"})

    @patch(
        "redash.models.parameterized_query.dropdown_values",
        return_value=[{"value": "baz"}],
    )
    def test_validates_query_parameters(self, _):
        schema = [{"name": "bar", "type": "query", "queryId": 1}]
        query = ParameterizedQuery("foo {{bar}}", schema)

        query.apply({"bar": "baz"})

        self.assertEqual("foo baz", query.text)

    def test_raises_on_invalid_date_range_parameters(self):
        schema = [{"name": "bar", "type": "date-range"}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": "baz"})

    def test_validates_date_range_parameters(self):
        schema = [{"name": "bar", "type": "date-range"}]
        query = ParameterizedQuery("foo {{bar.start}} {{bar.end}}", schema)

        query.apply({"bar": {"start": "2000-01-01 12:00:00", "end": "2000-12-31 12:00:00"}})

        self.assertEqual("foo 2000-01-01 12:00:00 2000-12-31 12:00:00", query.text)

    def test_raises_on_unexpected_param_types(self):
        schema = [{"name": "bar", "type": "burrito"}]
        query = ParameterizedQuery("foo", schema)

        with pytest.raises(InvalidParameterError):
            query.apply({"bar": "baz"})

    def test_is_not_safe_if_expecting_text_parameter(self):
        schema = [{"name": "bar", "type": "text"}]
        query = ParameterizedQuery("foo", schema)

        self.assertFalse(query.is_safe)

    def test_is_safe_if_not_expecting_text_parameter(self):
        schema = [{"name": "bar", "type": "number"}]
        query = ParameterizedQuery("foo", schema)

        self.assertTrue(query.is_safe)

    def test_is_safe_if_not_expecting_any_parameters(self):
        schema = []
        query = ParameterizedQuery("foo", schema)

        self.assertTrue(query.is_safe)

    @patch(
        "redash.models.parameterized_query._load_result",
        return_value={
            "columns": [{"name": "id"}, {"name": "Name"}, {"name": "Value"}],
            "rows": [{"id": 5, "Name": "John", "Value": "John Doe"}],
        },
    )
    def test_dropdown_values_prefers_name_and_value_columns(self, _):
        values = dropdown_values(1, None)
        self.assertEqual(values, [{"name": "John", "value": "John Doe"}])

    @patch(
        "redash.models.parameterized_query._load_result",
        return_value={
            "columns": [{"name": "id"}, {"name": "fish"}, {"name": "poultry"}],
            "rows": [{"fish": "Clown", "id": 5, "poultry": "Hen"}],
        },
    )
    def test_dropdown_values_compromises_for_first_column(self, _):
        values = dropdown_values(1, None)
        self.assertEqual(values, [{"name": 5, "value": "5"}])

    @patch(
        "redash.models.parameterized_query._load_result",
        return_value={
            "columns": [{"name": "ID"}, {"name": "fish"}, {"name": "poultry"}],
            "rows": [{"fish": "Clown", "ID": 5, "poultry": "Hen"}],
        },
    )
    def test_dropdown_supports_upper_cased_columns(self, _):
        values = dropdown_values(1, None)
        self.assertEqual(values, [{"name": 5, "value": "5"}])

    @patch(
        "redash.models.Query.get_by_id_and_org",
        return_value=namedtuple("Query", "data_source")(None),
    )
    def test_dropdown_values_raises_when_query_is_detached_from_data_source(self, _):
        with pytest.raises(QueryDetachedFromDataSourceError):
            dropdown_values(1, None)


def _rls_lookup_query(run_query_result):
    """A saved lookup query on a jrny_pg (RLS) data source whose runner returns `run_query_result`."""
    runner = namedtuple("Runner", "run_query")(run_query=__import__("mock").MagicMock(return_value=run_query_result))
    data_source = namedtuple("DataSource", "type query_runner")("jrny_pg", runner)
    query = namedtuple("Query", "id data_source query_text latest_query_data_id")(
        7, data_source, "SELECT name FROM reps", None
    )
    return query, runner


class TestDropdownValuesOnRLSDataSources(TestCase):
    """JRNYBI caches query results per user (the hash includes user_id), so a jrny_pg query's shared
    latest_query_data_id is never set. Dropdown values must come from running the lookup query as
    the viewing user, never from a shared result (CLAUDE.md security invariant 2)."""

    def test_runs_the_lookup_query_as_the_viewing_user(self):
        query, runner = _rls_lookup_query(
            ({"columns": [{"name": "Sales Person"}], "rows": [{"Sales Person": "Grant Catto"}]}, None)
        )
        user = object()
        with patch("redash.models.Query.get_by_id_and_org", return_value=query):
            values = dropdown_values(7, None, user=user)
        self.assertEqual(values, [{"name": "Grant Catto", "value": "Grant Catto"}])
        runner.run_query.assert_called_once_with("SELECT name FROM reps", user)

    def test_never_reads_a_shared_result(self):
        query, _ = _rls_lookup_query(({"columns": [{"name": "x"}], "rows": []}, None))
        with patch("redash.models.Query.get_by_id_and_org", return_value=query), patch(
            "redash.models.QueryResult.get_by_id_and_org"
        ) as shared:
            dropdown_values(7, None, user=object())
        shared.assert_not_called()

    def test_without_a_user_it_raises_a_handled_error_and_runs_nothing(self):
        query, runner = _rls_lookup_query(({"columns": [], "rows": []}, None))
        with patch("redash.models.Query.get_by_id_and_org", return_value=query):
            with pytest.raises(QueryDetachedFromDataSourceError) as e:
                dropdown_values(7, None)
        runner.run_query.assert_not_called()
        self.assertIn("viewing user", str(e.value))

    def test_a_failed_lookup_raises_a_handled_error(self):
        query, _ = _rls_lookup_query((None, "permission denied"))
        with patch("redash.models.Query.get_by_id_and_org", return_value=query):
            with pytest.raises(QueryDetachedFromDataSourceError) as e:
                dropdown_values(7, None, user=object())
        self.assertIn("permission denied", str(e.value))

    def test_other_data_sources_keep_the_shared_latest_result(self):
        runner = __import__("mock").MagicMock()
        data_source = namedtuple("DataSource", "type query_runner")("pg", runner)
        query = namedtuple("Query", "id data_source query_text latest_query_data_id")(7, data_source, "SELECT 1", 99)
        result = namedtuple("QueryResult", "data")({"columns": [{"name": "a"}], "rows": [{"a": 1}]})
        with patch("redash.models.Query.get_by_id_and_org", return_value=query), patch(
            "redash.models.QueryResult.get_by_id_and_org", return_value=result
        ):
            values = dropdown_values(7, None, user=object())
        self.assertEqual(values, [{"name": 1, "value": "1"}])
        runner.run_query.assert_not_called()

    def test_parameterized_query_validates_a_query_parameter_as_its_user(self):
        user = object()
        schema = [{"name": "rep", "type": "query", "queryId": 7}]
        query = ParameterizedQuery("SELECT {{rep}}", schema, user=user)
        with patch(
            "redash.models.parameterized_query.dropdown_values",
            return_value=[{"name": "Grant Catto", "value": "Grant Catto"}],
        ) as values:
            query.apply({"rep": "Grant Catto"})
        self.assertEqual(values.call_args.kwargs.get("user"), user)
        self.assertEqual(query.text, "SELECT Grant Catto")


class TestUnsetOptionalFilter(TestCase):
    """An empty value means "no filter": every seeded query/enum parameter defaults to "" and its SQL is
    written as ('{{ x }}' = '' OR col = '{{ x }}')."""

    def test_query_parameter_accepts_an_empty_value_without_loading_options(self):
        schema = [{"name": "category", "type": "query", "queryId": 7}]
        query = ParameterizedQuery("SELECT 1 WHERE ('{{category}}' = '' OR c = '{{category}}')", schema)
        with patch("redash.models.parameterized_query.dropdown_values") as values:
            query.apply({"category": ""})
        values.assert_not_called()
        self.assertEqual({"category": ""}, query.parameters)

    def test_enum_parameter_accepts_an_empty_value(self):
        schema = [{"name": "category", "type": "enum", "enumOptions": "Bearings\nAbrasives"}]
        query = ParameterizedQuery("SELECT 1 WHERE '{{category}}' = ''", schema)
        query.apply({"category": ""})
        self.assertEqual({"category": ""}, query.parameters)

    def test_a_value_outside_the_options_is_still_rejected(self):
        # "" is the only addition; anything else must still come from the options, which is what keeps
        # these parameters injection-safe.
        schema = [{"name": "category", "type": "enum", "enumOptions": "Bearings\nAbrasives"}]
        query = ParameterizedQuery("SELECT 1 WHERE '{{category}}' = ''", schema)
        with pytest.raises(InvalidParameterError):
            query.apply({"category": "'; DROP TABLE users; --"})
