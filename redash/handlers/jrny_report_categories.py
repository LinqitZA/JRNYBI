"""
JRNY Report Categories API Handler

Endpoints:
  GET    /api/jrny/report-categories            - List all categories (ordered)
  POST   /api/jrny/report-categories            - Create a new category (admin)
  PUT    /api/jrny/report-categories             - Bulk update / reorder all categories (admin)
  PUT    /api/jrny/report-categories/<id>        - Update a single category (admin)
  DELETE /api/jrny/report-categories/<id>        - Delete a single category (admin)

Categories are stored as an ordered list of objects in the organization's
JSONB settings under the key ``report_categories``.  Each object has:

  {
      "id":          "slug-style-id",
      "name":        "Display Name",
      "icon":        "antd-icon-name",
      "color":       "#hex",
      "description": "Short helper text"
  }

The GET endpoint is available to any authenticated user.
All mutation endpoints require admin permission.
"""

import logging
import re
import uuid

from flask import request

from redash.handlers.base import BaseResource
from redash.models import db
from redash.permissions import require_admin
from redash.settings.organization import settings as org_settings

logger = logging.getLogger(__name__)

# Allowed icon names (Ant Design icon identifiers, lowercase-kebab)
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")
_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _get_categories(org):
    """Return the current report_categories list for *org*."""
    stored = org.settings.get("settings", {}).get("report_categories")
    if stored is not None:
        return stored
    # Fall back to the default defined in the org_settings registry
    return list(org_settings.get("report_categories", []))


def _save_categories(org, categories):
    """Persist *categories* list into the org settings JSONB."""
    org.settings.setdefault("settings", {})
    org.settings["settings"]["report_categories"] = categories
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(org, "settings")
    db.session.add(org)
    db.session.commit()


def _validate_category(data, existing_ids=None, is_update=False):
    """Validate a single category dict.  Returns (clean_dict, error_string)."""
    errors = []

    name = (data.get("name") or "").strip()
    if not name:
        errors.append("name is required")
    elif len(name) > 64:
        errors.append("name must be 64 characters or fewer")

    cat_id = (data.get("id") or "").strip().lower()
    if not is_update:
        if not cat_id:
            cat_id = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:63]
        if not _SLUG_RE.match(cat_id):
            errors.append("id must be lowercase alphanumeric with hyphens/underscores")
        if existing_ids and cat_id in existing_ids:
            errors.append(f"id '{cat_id}' already exists")

    icon = (data.get("icon") or "").strip() or "folder"
    color = (data.get("color") or "").strip() or "#6b7280"
    if color and not _COLOR_RE.match(color):
        errors.append("color must be a valid hex color (#RRGGBB)")

    description = (data.get("description") or "").strip()
    if len(description) > 256:
        errors.append("description must be 256 characters or fewer")

    if errors:
        return None, "; ".join(errors)

    return {
        "id": cat_id,
        "name": name,
        "icon": icon,
        "color": color,
        "description": description,
    }, None


class JRNYReportCategoryListResource(BaseResource):
    """
    GET  /api/jrny/report-categories  - list (authenticated)
    POST /api/jrny/report-categories  - create one (admin)
    PUT  /api/jrny/report-categories  - bulk update/reorder (admin)
    """

    def get(self):
        categories = _get_categories(self.current_org)
        return {"categories": categories}

    @require_admin
    def post(self):
        data = request.get_json(force=True, silent=True) or {}
        categories = _get_categories(self.current_org)
        existing_ids = {c["id"] for c in categories}

        clean, error = _validate_category(data, existing_ids=existing_ids)
        if error:
            return {"error": error}, 400

        categories.append(clean)
        _save_categories(self.current_org, categories)

        self.record_event({
            "action": "create",
            "object_type": "report_category",
            "object_id": clean["id"],
        })

        return {"category": clean}, 201

    @require_admin
    def put(self):
        """Bulk replace the entire ordered list of categories."""
        data = request.get_json(force=True, silent=True)
        if not isinstance(data, list):
            return {"error": "Request body must be a JSON array of category objects"}, 400

        clean_list = []
        seen_ids = set()
        for idx, item in enumerate(data):
            clean, error = _validate_category(item, existing_ids=seen_ids)
            if error:
                return {"error": f"Category at index {idx}: {error}"}, 400
            seen_ids.add(clean["id"])
            clean_list.append(clean)

        _save_categories(self.current_org, clean_list)

        self.record_event({
            "action": "reorder",
            "object_type": "report_categories",
        })

        return {"categories": clean_list}


class JRNYReportCategoryResource(BaseResource):
    """
    PUT    /api/jrny/report-categories/<category_id>  - update one (admin)
    DELETE /api/jrny/report-categories/<category_id>  - delete one (admin)
    """

    @require_admin
    def put(self, category_id):
        categories = _get_categories(self.current_org)
        target_idx = None
        for idx, cat in enumerate(categories):
            if cat["id"] == category_id:
                target_idx = idx
                break

        if target_idx is None:
            return {"error": f"Category '{category_id}' not found"}, 404

        data = request.get_json(force=True, silent=True) or {}
        # Preserve the original id
        data["id"] = category_id

        other_ids = {c["id"] for c in categories if c["id"] != category_id}
        clean, error = _validate_category(data, existing_ids=other_ids, is_update=True)
        if error:
            return {"error": error}, 400

        categories[target_idx] = clean
        _save_categories(self.current_org, categories)

        self.record_event({
            "action": "edit",
            "object_type": "report_category",
            "object_id": category_id,
        })

        return {"category": clean}

    @require_admin
    def delete(self, category_id):
        categories = _get_categories(self.current_org)
        original_len = len(categories)
        categories = [c for c in categories if c["id"] != category_id]

        if len(categories) == original_len:
            return {"error": f"Category '{category_id}' not found"}, 404

        _save_categories(self.current_org, categories)

        self.record_event({
            "action": "delete",
            "object_type": "report_category",
            "object_id": category_id,
        })

        return {"message": f"Category '{category_id}' deleted"}, 200
