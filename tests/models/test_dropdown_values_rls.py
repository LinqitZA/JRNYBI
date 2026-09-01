"""
Dropdown values on an RLS data source.

`query`-type parameters render their options from dropdown_values(), which read
them out of Query.latest_query_data_id. For a jrny_pg data source that column is
ALWAYS NULL: redash/tasks/queries/execution.py deliberately salts the query hash
with the user id so users never share RLS-filtered results, while
Query.update_latest_result() matches on the UNSALTED hash, so the pointer is
never set.

The result was GET /api/queries/<id>/dropdown returning 500 for every query-type
parameter — 24 of them across the seeded reports — so every category / status /
warehouse selector rendered with no options at all.

The pointer cannot simply be populated: a single global "latest result" is
incompatible with per-user RLS output, and pointing it at one user's result would
serve that user's rows to everyone else.

So the result is resolved by the CURRENT USER's salted hash instead, which is
safe by construction — the hash embeds the user id, so a lookup can only ever
return rows that user already produced.
"""

from unittest import mock

from redash.models.parameterized_query import (
    InvalidParameterError,
    ParameterizedQuery,
    _load_result,
)
from redash.utils import gen_query_hash
from tests import BaseTestCase


class TestLoadResultForRlsDataSource(BaseTestCase):
    def test_uses_the_pointer_when_one_is_set(self):
        query = self.factory.create_query()
        result = self.factory.create_query_result(data={"columns": [], "rows": []})
        query.latest_query_data_id = result.id
        self.db.session.commit()

        self.assertEqual(result.data, _load_result(query.id, self.factory.org))

    def test_falls_back_to_the_current_users_salted_result(self):
        # What a jrny_pg query looks like: no pointer, but a result stored under
        # the user-salted hash by a previous execution.
        query = self.factory.create_query()
        query.latest_query_data_id = None
        self.db.session.commit()

        salted = gen_query_hash(query.query_text + "::user_id=" + str(self.factory.user.id))
        result = self.factory.create_query_result(
            data={"columns": [{"name": "category"}], "rows": [{"category": "Bearings"}]},
            query_hash=salted,
            data_source=query.data_source,
        )

        with mock.patch("redash.models.parameterized_query.current_user", self.factory.user):
            loaded = _load_result(query.id, self.factory.org)

        # Previously this raised, because get_by_id_and_org(None, org) has no row.
        self.assertEqual(result.data, loaded)

    def test_does_not_return_another_users_result(self):
        # The whole point of the salt: a result produced under a different user's
        # RLS context must never populate this user's dropdown.
        query = self.factory.create_query()
        query.latest_query_data_id = None
        self.db.session.commit()

        other = self.factory.create_user()
        other_salted = gen_query_hash(query.query_text + "::user_id=" + str(other.id))
        self.factory.create_query_result(
            data={"columns": [{"name": "category"}], "rows": [{"category": "Someone else's"}]},
            query_hash=other_salted,
            data_source=query.data_source,
        )

        # data_source.query_runner is a property that builds a fresh runner, so
        # the stub has to replace the property itself.
        runner = mock.Mock()
        runner.run_query.return_value = ('{"columns": [], "rows": []}', None)

        with mock.patch("redash.models.parameterized_query.current_user", self.factory.user):
            with mock.patch(
                "redash.models.DataSource.query_runner",
                new_callable=mock.PropertyMock,
                return_value=runner,
            ):
                loaded = _load_result(query.id, self.factory.org)

        # No cached result for THIS user, so it must execute rather than silently
        # serving the other user's rows.
        self.assertTrue(runner.run_query.called)
        self.assertEqual([], loaded["rows"])

    def test_accepts_a_runner_that_returns_an_already_parsed_dict(self):
        # jrny_pg returns the dict rather than serialised JSON, which used to
        # blow up in json_loads with "the JSON object must be str, bytes or
        # bytearray, not dict" — a 500 on every dropdown.
        query = self.factory.create_query()
        query.latest_query_data_id = None
        self.db.session.commit()

        runner = mock.Mock()
        runner.run_query.return_value = (
            {"columns": [{"name": "category"}], "rows": [{"category": "Bearings"}]},
            None,
        )

        with mock.patch("redash.models.parameterized_query.current_user", self.factory.user):
            with mock.patch(
                "redash.models.DataSource.query_runner",
                new_callable=mock.PropertyMock,
                return_value=runner,
            ):
                loaded = _load_result(query.id, self.factory.org)

        self.assertEqual([{"category": "Bearings"}], loaded["rows"])


class TestUnsetOptionalFilter(BaseTestCase):
    """Empty value = "no filter", the convention every seeded report is written for."""

    def _schema(self, ptype, **extra):
        definition = {"name": "category", "type": ptype}
        definition.update(extra)
        return [definition]

    def test_query_parameter_accepts_an_empty_value(self):
        # Every one of the 24 seeded query-type parameters ships value "", and
        # this used to raise InvalidParameterError on load.
        query = ParameterizedQuery(
            "SELECT 1 WHERE ('{{category}}' = '' OR c = '{{category}}')",
            self._schema("query", queryId=1),
        )

        query.apply({"category": ""})

        self.assertEqual({"category": ""}, query.parameters)

    def test_enum_parameter_accepts_an_empty_value(self):
        query = ParameterizedQuery(
            "SELECT 1 WHERE '{{category}}' = ''",
            self._schema("enum", enumOptions="Bearings\nAbrasives"),
        )

        query.apply({"category": ""})

        self.assertEqual({"category": ""}, query.parameters)

    def test_a_value_outside_the_options_is_still_rejected(self):
        # The empty string is the only addition — anything else must still come
        # from the dropdown, which is what keeps these parameters injection-safe.
        query = ParameterizedQuery(
            "SELECT 1 WHERE '{{category}}' = ''",
            self._schema("enum", enumOptions="Bearings\nAbrasives"),
        )

        with self.assertRaises(InvalidParameterError):
            query.apply({"category": "'; DROP TABLE users; --"})
