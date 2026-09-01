"""
JrnyPg RLS claim handling.

The runner injects SET LOCAL app.current_* variables from the user's JRNY JWT
claims before every query. A missing claim used to log a warning and `continue`,
which left the variable unset — and eight of the thirty-two reporting views
filter on it:

    WHERE c.entity_id = current_setting('app.current_entity_id', true)::uuid

current_setting with missing_ok=true returns NULL when unset, and
`entity_id = NULL` is NULL rather than true, so EVERY row is filtered out. The
query succeeds and returns zero rows, so a dashboard renders blank with no error
anywhere — in the logs, in the UI, or in the query result.

Measured on the dev replica: reporting.v_general_ledger returns 6,559 rows with
app.current_entity_id set and 0 without it.

app.current_entity_id is therefore mandatory. The other claims are not: a user
legitimately has no branch (jrny_branch_id is already absent from the seeded
admin's details) and the views tolerate a null branch by design.
"""

import unittest

from redash.query_runner.jrny_pg import JRNYPostgreSQL


class TestJrnyPgRlsStatements(unittest.TestCase):
    ENTITY = "dbc6821a-2905-546c-987f-73b7db77de3a"
    USER = "9e1b0ec9-5e97-4d49-b532-35c32b17a4fc"

    def setUp(self):
        self.runner = JRNYPostgreSQL({})

    def full_details(self):
        return {
            "jrny_org_id": self.ENTITY,
            "jrny_branch_id": self.ENTITY,
            "jrny_entity_id": self.ENTITY,
            "jrny_user_id": self.USER,
            "jrny_role": "admin",
        }

    def test_builds_a_set_local_for_every_claim(self):
        statements = self.runner._build_rls_statements(self.full_details())

        self.assertEqual(5, len(statements))
        self.assertIn(
            "SET LOCAL app.current_entity_id = '{}'".format(self.ENTITY), statements
        )

    def test_missing_entity_claim_raises_rather_than_returning_no_rows(self):
        details = self.full_details()
        del details["jrny_entity_id"]

        # Previously this returned four statements and the query then ran with
        # app.current_entity_id unset, silently yielding an empty result.
        with self.assertRaises(ValueError) as ctx:
            self.runner._build_rls_statements(details)

        self.assertIn("jrny_entity_id", str(ctx.exception))

    def test_null_entity_claim_is_treated_as_missing(self):
        details = self.full_details()
        details["jrny_entity_id"] = None

        with self.assertRaises(ValueError):
            self.runner._build_rls_statements(details)

    def test_optional_claims_may_be_absent(self):
        # A user with no branch is legitimate, and the views tolerate it.
        details = self.full_details()
        del details["jrny_branch_id"]

        statements = self.runner._build_rls_statements(details)

        self.assertEqual(4, len(statements))
        self.assertTrue(
            any("app.current_entity_id" in s for s in statements),
            "the mandatory entity claim must still be set",
        )

    def test_still_rejects_a_malformed_entity_uuid(self):
        details = self.full_details()
        details["jrny_entity_id"] = "not-a-uuid'; DROP TABLE users; --"

        with self.assertRaises(ValueError):
            self.runner._build_rls_statements(details)
