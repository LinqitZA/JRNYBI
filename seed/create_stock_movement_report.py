#!/usr/bin/env python3
"""Create Stock Movement History report via JRNYBI API.

Creates:
  - Query 1: Movement detail with running balance
  - Query 2: Movement summary by type per period
  - Visualizations: Detail table, summary chart
  - Dashboard: "Stock Movement History" tagged report:inventory
"""
import json
import sys
import urllib.request
import urllib.error

API_KEY = "adminTestKey123456789012345678901234"
BASE_URL = "http://localhost:5001"
DS_ID = 1


def api_call(method, path, data=None):
    url = f"{BASE_URL}{path}"
    headers = {
        "Authorization": f"Key {API_KEY}",
        "Content-Type": "application/json",
    }
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        sys.stderr.write(f"HTTP {e.code} on {method} {path}: {err_body}\n")
        raise


def main():
    # Check if already exists
    result = api_call("GET", "/api/queries?q=Stock+Movement+History&page_size=100")
    existing = [q for q in result.get("results", []) if "Stock Movement History" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} Stock Movement History queries already exist\n")
        return

    # -------------------------------------------------------------------------
    # Query 1: Movement detail with running balance
    # -------------------------------------------------------------------------
    q1_sql = """SELECT
  sm.product_code,
  sm.product_name,
  sm.warehouse,
  sm.movement_type,
  sm.quantity,
  sm.unit_cost,
  sm.movement_value,
  sm.reference_type,
  sm.reference_id::TEXT AS reference_id,
  sm.movement_date::DATE AS movement_date,
  SUM(sm.quantity) OVER (
    PARTITION BY sm.product_id, sm.warehouse_id
    ORDER BY sm.movement_date, sm.id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_balance
FROM reporting.v_stock_movements sm
WHERE sm.movement_date::DATE BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ product }}' = '' OR sm.product_name ILIKE '%' || '{{ product }}' || '%' OR sm.product_code ILIKE '%' || '{{ product }}' || '%')
  AND ('{{ warehouse }}' = '' OR sm.warehouse = '{{ warehouse }}')
  AND ('{{ movement_type }}' = '' OR sm.movement_type = '{{ movement_type }}')
ORDER BY sm.movement_date DESC, sm.product_name, sm.warehouse"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Stock Movement History - Detail",
        "description": "Complete stock movement audit trail with running balance per product/warehouse. Includes receipts, issues, adjustments, and transfers with source document references.",
        "data_source_id": DS_ID,
        "query": q1_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2026-12-31"},
                {"name": "product", "title": "Product", "type": "text", "value": ""},
                {"name": "warehouse", "title": "Warehouse", "type": "text", "value": ""},
                {"name": "movement_type", "title": "Movement Type", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q1_id = q1["id"]
    sys.stderr.write(f"Query 1 (Detail) created: id={q1_id}\n")

    # -------------------------------------------------------------------------
    # Query 2: Movement summary by type per period
    # -------------------------------------------------------------------------
    q2_sql = """SELECT
  DATE_TRUNC('month', sm.movement_date)::DATE AS period,
  sm.movement_type,
  COUNT(*) AS movement_count,
  SUM(ABS(sm.quantity)) AS total_quantity,
  SUM(ABS(sm.movement_value)) AS total_value
FROM reporting.v_stock_movements sm
WHERE sm.movement_date::DATE BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ warehouse }}' = '' OR sm.warehouse = '{{ warehouse }}')
GROUP BY DATE_TRUNC('month', sm.movement_date), sm.movement_type
ORDER BY period, sm.movement_type"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Stock Movement History - Summary by Type",
        "description": "Monthly summary of stock movements grouped by movement type (receipt, issue, adjustment, transfer).",
        "data_source_id": DS_ID,
        "query": q2_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2026-12-31"},
                {"name": "warehouse", "title": "Warehouse", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q2_id = q2["id"]
    sys.stderr.write(f"Query 2 (Summary) created: id={q2_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 1: Detail Table with running balance
    # -------------------------------------------------------------------------
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Movement Detail Table",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 50,
            "columns": [
                {"name": "movement_date", "title": "Date", "visible": True},
                {"name": "product_code", "title": "Code", "visible": True},
                {"name": "product_name", "title": "Product", "visible": True},
                {"name": "warehouse", "title": "Warehouse", "visible": True},
                {"name": "movement_type", "title": "Type", "visible": True},
                {"name": "quantity", "title": "Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "unit_cost", "title": "Unit Cost", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "movement_value", "title": "Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "running_balance", "title": "Running Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "reference_type", "title": "Ref Type", "visible": True},
                {"name": "reference_id", "title": "Ref ID", "visible": True},
            ],
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Detail Table) created: id={v1_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 2: Stacked column chart — Movements by Type per Period
    # -------------------------------------------------------------------------
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Movements by Type per Period",
        "type": "CHART",
        "options": {
            "globalSeriesType": "column",
            "columnMapping": {
                "period": "x",
                "total_value": "y",
                "movement_type": "series",
            },
            "seriesOptions": {
                "receipt": {"type": "column", "yAxis": 0, "color": "#16a34a", "name": "Receipts"},
                "issue": {"type": "column", "yAxis": 0, "color": "#dc2626", "name": "Issues"},
                "adjustment": {"type": "column", "yAxis": 0, "color": "#eab308", "name": "Adjustments"},
                "transfer": {"type": "column", "yAxis": 0, "color": "#2563eb", "name": "Transfers"},
            },
            "series": {"stacking": "stack"},
            "sortX": True,
            "legend": {"enabled": True},
            "xAxis": {"type": "datetime", "title": {"text": "Period"}},
            "yAxis": [{"type": "linear", "title": {"text": "Total Value"}}],
            "numberFormat": "0,0.00",
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Chart) created: id={v2_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 3: Summary table
    # -------------------------------------------------------------------------
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Movement Summary Table",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 25,
            "columns": [
                {"name": "period", "title": "Period", "visible": True},
                {"name": "movement_type", "title": "Type", "visible": True},
                {"name": "movement_count", "title": "Count", "visible": True, "alignContent": "right"},
                {"name": "total_quantity", "title": "Total Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "total_value", "title": "Total Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
            ],
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (Summary Table) created: id={v3_id}\n")

    # -------------------------------------------------------------------------
    # Create Dashboard
    # -------------------------------------------------------------------------
    dash = api_call("POST", "/api/dashboards", {"name": "Stock Movement History"})
    dash_id = dash["id"]
    dash_slug = dash.get("slug", "")
    sys.stderr.write(f"Dashboard created: id={dash_id}, slug={dash_slug}\n")

    # Add Widgets
    # Row 0: Chart (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v2_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 10, "col": 0, "row": 0}},
    })
    # Row 10: Summary table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v3_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 8, "col": 0, "row": 10}},
    })
    # Row 18: Detail table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v1_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 14, "col": 0, "row": 18}},
    })
    sys.stderr.write("Widgets added.\n")

    # Publish
    api_call("POST", f"/api/dashboards/{dash_id}", {
        "is_draft": False,
        "tags": ["inventory", "jrny-report", "report:inventory"],
    })
    sys.stderr.write("Dashboard published with tags [inventory, jrny-report, report:inventory].\n")

    summary = {
        "q1_id": q1_id,
        "q2_id": q2_id,
        "v1_id": v1_id,
        "v2_id": v2_id,
        "v3_id": v3_id,
        "dash_id": dash_id,
        "dash_slug": dash_slug,
    }
    sys.stdout.write(json.dumps(summary))


if __name__ == "__main__":
    main()
