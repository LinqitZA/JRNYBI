import datetime
import logging
import os
from contextlib import contextmanager
from unittest import TestCase

os.environ["REDASH_REDIS_URL"] = os.environ.get("REDASH_REDIS_URL", "redis://localhost:6379/0").replace("/0", "/5")
# Use different url for RQ to avoid DB being cleaned up:
os.environ["RQ_REDIS_URL"] = os.environ.get("REDASH_REDIS_URL", "redis://localhost:6379/0").replace("/5", "/6")

# Dummy values for oauth login
os.environ["REDASH_GOOGLE_CLIENT_ID"] = "dummy"
os.environ["REDASH_GOOGLE_CLIENT_SECRET"] = "dummy"
os.environ["REDASH_MULTI_ORG"] = "true"

# Make sure rate limit is enabled
os.environ["REDASH_RATELIMIT_ENABLED"] = "true"

os.environ["REDASH_ENFORCE_CSRF"] = "false"


def _refuse_to_run_against_a_live_database():
    """Guard: BaseTestCase truncates every table between tests.

    Upstream isolates Redis for tests (above) but says nothing about Postgres —
    it just assumes you pointed REDASH_DATABASE_URL somewhere disposable. Inside
    a deployed container that variable is already set to the LIVE application
    database, so running pytest there silently destroys every query, dashboard,
    widget and user. That happened here: 77 queries and 32 dashboards were wiped
    and had to be re-seeded.

    So require the target database to name itself as a test database. Set
    REDASH_ALLOW_DESTRUCTIVE_TESTS=true to override deliberately.
    """
    if os.environ.get("REDASH_ALLOW_DESTRUCTIVE_TESTS", "").lower() == "true":
        return

    url = os.environ.get("REDASH_DATABASE_URL", "")
    if not url:
        return

    dbname = url.rsplit("/", 1)[-1].split("?")[0]
    if "test" in dbname.lower():
        return

    raise RuntimeError(
        "Refusing to run tests against database '{}': the test suite truncates "
        "every table between tests and this does not look like a test database. "
        "Point REDASH_DATABASE_URL at one whose name contains 'test' (e.g. "
        "postgresql://jrnybi:...@jrnybi-postgres:5432/jrnybi_test), or set "
        "REDASH_ALLOW_DESTRUCTIVE_TESTS=true if you really mean it.".format(dbname)
    )


_refuse_to_run_against_a_live_database()

from redash import limiter, redis_connection  # noqa: E402
from redash.app import create_app  # noqa: E402
from redash.models import db  # noqa: E402
from redash.utils import json_dumps  # noqa: E402
from tests.factories import Factory, user_factory  # noqa: E402

logging.disable(logging.INFO)
logging.getLogger("metrics").setLevel(logging.ERROR)


def authenticate_request(c, user):
    with c.session_transaction() as sess:
        sess["_user_id"] = user.get_id()


@contextmanager
def authenticated_user(c, user=None):
    if not user:
        user = user_factory.create()
        db.session.commit()
    authenticate_request(c, user)

    yield user


class BaseTestCase(TestCase):
    def setUp(self):
        self.app = create_app()
        self.db = db
        self.app.config["TESTING"] = True
        limiter.enabled = False
        self.app_ctx = self.app.app_context()
        self.app_ctx.push()
        db.session.close()
        db.drop_all()
        db.create_all()
        self.factory = Factory()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.get_engine(self.app).dispose()
        self.app_ctx.pop()
        redis_connection.flushdb()

    def make_request(
        self,
        method,
        path,
        org=None,
        user=None,
        data=None,
        is_json=True,
        follow_redirects=False,
    ):
        if user is None:
            user = self.factory.user

        if org is None:
            org = self.factory.org

        if org is not False:
            path = "/{}{}".format(org.slug, path)

        if user:
            authenticate_request(self.client, user)

        method_fn = getattr(self.client, method.lower())
        headers = {}

        if data and is_json:
            data = json_dumps(data)

        if is_json:
            content_type = "application/json"
        else:
            content_type = None

        response = method_fn(
            path,
            data=data,
            headers=headers,
            content_type=content_type,
            follow_redirects=follow_redirects,
        )
        return response

    def get_request(self, path, org=None, headers=None, client=None):
        if org:
            path = "/{}{}".format(org.slug, path)

        if client is None:
            client = self.client
        return client.get(path, headers=headers)

    def post_request(self, path, data=None, org=None, headers=None):
        if org:
            path = "/{}{}".format(org.slug, path)

        return self.client.post(path, data=data, headers=headers)

    def assertResponseEqual(self, expected, actual):
        for k, v in expected.items():
            if isinstance(v, datetime.datetime) or isinstance(actual[k], datetime.datetime):
                continue

            if isinstance(v, list):
                continue

            if isinstance(v, dict):
                self.assertResponseEqual(v, actual[k])
                continue

            self.assertEqual(
                v,
                actual[k],
                "{} not equal (expected: {}, actual: {}).".format(k, v, actual[k]),
            )
