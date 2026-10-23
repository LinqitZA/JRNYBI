"""
JRNY "Download as Excel (as shown)"

Endpoint:
  POST /api/jrny/excel-export  - body: an ExportGrid (redash/utils/excel_grid.py); returns the .xlsx

The browser sends the pivot or table exactly as it is drawn on screen; this endpoint only formats it
(title, bold bordered headers and totals, frozen header, column widths, typed cells). It reads no
query data, so any logged-in user may call it.
"""

from flask import make_response, request
from flask_restful import abort

from redash.handlers.base import BaseResource
from redash.handlers.query_results import content_disposition_filenames
from redash.utils.excel_grid import (
    GridError,
    build_workbook,
    safe_filename,
    validate_grid,
)

XLSX_MIMETYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class JRNYExcelExportResource(BaseResource):
    def post(self):
        try:
            grid = validate_grid(request.get_json(force=True, silent=True))
        except GridError as exc:
            abort(400, message=str(exc))

        response = make_response(build_workbook(grid))
        response.headers["Content-Type"] = XLSX_MIMETYPE
        response.headers.add("Content-Disposition", "attachment", **content_disposition_filenames(
            safe_filename(grid["title"])
        ))
        response.headers["Cache-Control"] = "no-store"

        self.record_event({"action": "export_as_shown", "object_type": "excel", "object_id": grid["title"]})
        return response
