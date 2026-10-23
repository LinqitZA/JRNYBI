from tests import BaseTestCase

URL = "/api/jrny/report-categories"


class ReportCategoryTestCase(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.factory.create_admin()

    def put_all(self, cats):
        return self.make_request("put", URL, data=cats, user=self.admin)

    def stored(self):
        return self.make_request("get", URL, user=self.admin).json["categories"]


class TestNestedCategories(ReportCategoryTestCase):
    def test_bulk_put_keeps_parents(self):
        rv = self.put_all(
            [
                {"id": "aon-migrated", "name": "Migrated from SYSPRO"},
                {"id": "aon-orders", "name": "Orders", "parent": "aon-migrated"},
                {"id": "archive", "name": "Archive", "parent": None},
            ]
        )
        self.assertEqual(rv.status_code, 200)
        parents = {c["id"]: c["parent"] for c in self.stored()}
        self.assertEqual(parents, {"aon-migrated": None, "aon-orders": "aon-migrated", "archive": None})

    def test_bulk_put_rejects_unknown_parent_and_cycles(self):
        rv = self.put_all([{"id": "a", "name": "A", "parent": "nope"}])
        self.assertEqual(rv.status_code, 400)
        self.assertIn("unknown parent", rv.json["error"])

        rv = self.put_all([{"id": "a", "name": "A", "parent": "b"}, {"id": "b", "name": "B", "parent": "a"}])
        self.assertEqual(rv.status_code, 400)
        self.assertIn("cycle", rv.json["error"])

    def test_post_requires_an_existing_parent(self):
        self.put_all([{"id": "root", "name": "Root"}])
        rv = self.make_request("post", URL, data={"name": "Child", "parent": "missing"}, user=self.admin)
        self.assertEqual(rv.status_code, 400)

        rv = self.make_request("post", URL, data={"name": "Child", "parent": "root"}, user=self.admin)
        self.assertEqual(rv.status_code, 201)
        self.assertEqual(rv.json["category"]["id"], "child")
        self.assertEqual(rv.json["category"]["parent"], "root")

    def test_put_one_without_parent_keeps_the_current_parent(self):
        self.put_all([{"id": "root", "name": "Root"}, {"id": "kid", "name": "Kid", "parent": "root"}])
        rv = self.make_request("put", f"{URL}/kid", data={"name": "Renamed"}, user=self.admin)
        self.assertEqual(rv.status_code, 200)
        self.assertEqual(rv.json["category"]["parent"], "root")
        self.assertEqual(rv.json["category"]["name"], "Renamed")

    def test_put_one_can_move_to_top_level_but_not_into_a_cycle(self):
        self.put_all([{"id": "root", "name": "Root"}, {"id": "kid", "name": "Kid", "parent": "root"}])
        rv = self.make_request("put", f"{URL}/root", data={"name": "Root", "parent": "kid"}, user=self.admin)
        self.assertEqual(rv.status_code, 400)

        rv = self.make_request("put", f"{URL}/kid", data={"name": "Kid", "parent": None}, user=self.admin)
        self.assertEqual(rv.status_code, 200)
        self.assertIsNone(rv.json["category"]["parent"])

    def test_delete_refused_while_it_has_sub_folders(self):
        self.put_all([{"id": "root", "name": "Root"}, {"id": "kid", "name": "Kid", "parent": "root"}])
        rv = self.make_request("delete", f"{URL}/root", user=self.admin)
        self.assertEqual(rv.status_code, 400)
        self.assertIn("sub-folders", rv.json["error"])

        self.assertEqual(self.make_request("delete", f"{URL}/kid", user=self.admin).status_code, 200)
        self.assertEqual(self.make_request("delete", f"{URL}/root", user=self.admin).status_code, 200)

    def test_flat_categories_stored_before_folders_read_as_top_level(self):
        org = self.factory.org
        org.settings.setdefault("settings", {})["report_categories"] = [{"id": "sales", "name": "Sales"}]
        from sqlalchemy.orm.attributes import flag_modified

        from redash.models import db

        flag_modified(org, "settings")
        db.session.commit()
        self.assertEqual(self.stored(), [{"id": "sales", "name": "Sales", "parent": None}])

    def test_non_admin_cannot_change_folders(self):
        user = self.factory.create_user()
        rv = self.make_request("put", URL, data=[{"id": "a", "name": "A"}], user=user)
        self.assertEqual(rv.status_code, 403)
