#!/usr/bin/env python3
"""Create Warehouse Bin Utilization report via JRNYBI API.

Creates:
  - Query 1: Zone-level utilization summary (occupied vs total bins, fill rates)
  - Query 2: Bin-level detail with status classification
  - Visualizations: Utilization bar chart, zone summary table, bin detail table
  - Dashboard: "Warehouse Bin Utilization" tagged report:inventory
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
    result = api_call("GET", "/api/queries?q=Warehouse+Bin+Utilization&page_size=100")
    existing = [q for q in result.get("results", []) if "Warehouse Bin Utilization" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} Warehouse Bin Utilization queries already exist\n")
        return

    # -------------------------------------------------------------------------
    # Query 1: Zone-level utilization summary
    # -------------------------------------------------------------------------
    q1_sql = """SELECT
  u.warehouse_name,
  u.zone_code,
  u.zone_name,
  u.zone_type,
  COUNT(DISTINCT u.bin_id) AS total_bins,
  COUNT(DISTINCT u.bin_id) FILTER (WHERE u.bin_status <> 'Empty') AS occupied_bins,
  COUNT(DISTINCT u.bin_id) FILTER (WHERE u.bin_status = 'Empty') AS empty_bins,
  COUNT(DISTINCT u.bin_id) FILTER (WHERE u.bin_status = 'Over-capacity') AS overcapacity_bins,
  COUNT(DISTINCT u.bin_id) FILTER (WHERE u.bin_status = 'Near-full') AS nearfull_bins,
  ROUND(
    COUNT(DISTINCT u.bin_id) FILTER (WHERE u.bin_status <> 'Empty')::NUMERIC
    / NULLIF(COUNT(DISTINCT u.bin_id), 0)
    * 100, 1
  ) AS utilization_pct,
  ROUND(AVG(u.bin_fill_pct) FILTER (WHERE u.bin_status <> 'Empty'), 1) AS avg_fill_pct,
  SUM(u.current_qty) AS total_qty_stored
FROM reporting.v_bin_utilization u
WHERE ('{{ warehouse }}' = '' OR u.warehouse_name ILIKE '%' || '{{ warehouse }}' || '%')
GROUP BY u.warehouse_name, u.zone_code, u.zone_name, u.zone_type
ORDER BY u.warehouse_name, u.zone_code"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Warehouse Bin Utilization - Zone Summary",
        "description": "Zone-level bin utilization showing occupied vs empty bins, over-capacity alerts, and average fill rates. Use for capacity planning and warehouse layout optimization.",
        "data_source_id": DS_ID,
        "query": q1_sql,
        "options": {
            "parameters": [
                {"name": "warehouse", "title": "Warehouse", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q1_id = q1["id"]
    sys.stderr.write(f"Query 1 (Zone Summary) created: id={q1_id}\n")

    # -------------------------------------------------------------------------
    # Query 2: Bin-level detail
    # -------------------------------------------------------------------------
    q2_sql = """SELECT
  u.warehouse_name,
  u.zone_code,
  u.zone_name,
  u.bin_code,
  u.bin_type,
  u.max_capacity,
  u.current_qty,
  u.bin_fill_pct,
  u.bin_status,
  u.product_code,
  u.product_name,
  u.product_category
FROM reporting.v_bin_utilization u
WHERE ('{{ warehouse }}' = '' OR u.warehouse_name ILIKE '%' || '{{ warehouse }}' || '%')
  AND ('{{ zone }}' = '' OR u.zone_code = '{{ zone }}')
  AND ('{{ status }}' = '' OR u.bin_status = '{{ status }}')
ORDER BY u.warehouse_name, u.zone_code, u.bin_code"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Warehouse Bin Utilization - Bin Detail",
        "description": "Individual bin-level detail showing current stock, fill percentage, and status. Filter by warehouse, zone, or bin status (Empty, In-use, Near-full, Over-capacity).",
        "data_source_id": DS_ID,
        "query": q2_sql,
        "options": {
            "parameters": [
                {"name": "warehouse", "title": "Warehouse", "type": "text", "value": ""},
                {"name": "zone", "title": "Zone Code", "type": "text", "value": ""},
                {"name": "status", "title": "Bin Status", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q2_id = q2["id"]
    sys.stderr.write(f"Query 2 (Bin Detail) created: id={q2_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 1: Utilization by Zone (bar chart)
    # -------------------------------------------------------------------------
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Utilization by Zone",
        "type": "CHART",
        "options": {
            "globalSeriesType": "column",
            "columnMapping": {
                "zone_name": "x",
                "utilization_pct": "y",
                "avg_fill_pct": "y",
            },
            "seriesOptions": {
                "utilization_pct": {"type": "column", "yAxis": 0, "color": "#2563eb", "name": "Bin Utilization %"},
                "avg_fill_pct": {"type": "line", "yAxis": 0, "color": "#dc2626", "name": "Avg Fill Rate %"},
            },
            "legend": {"enabled": True},
            "xAxis": {"type": "category", "title": {"text": "Zone"}},
            "yAxis": [{"type": "linear", "title": {"text": "Percentage"}, "rangeMax": 100}],
            "numberFormat": "0.0",
            "series": {"stacking": None},
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Utilization Chart) created: id={v1_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 2: Zone Summary Table
    # -------------------------------------------------------------------------
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Zone Utilization Summary",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 25,
            "columns": [
                {"name": "warehouse_name", "title": "Warehouse", "visible": True},
                {"name": "zone_code", "title": "Zone", "visible": True},
                {"name": "zone_name", "title": "Zone Name", "visible": True},
                {"name": "zone_type", "title": "Type", "visible": True},
                {"name": "total_bins", "title": "Total Bins", "visible": True, "alignContent": "right"},
                {"name": "occupied_bins", "title": "Occupied", "visible": True, "alignContent": "right"},
                {"name": "empty_bins", "title": "Empty", "visible": True, "alignContent": "right"},
                {"name": "overcapacity_bins", "title": "Over-capacity", "visible": True, "alignContent": "right"},
                {"name": "utilization_pct", "title": "Utilization %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "avg_fill_pct", "title": "Avg Fill %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "total_qty_stored", "title": "Total Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
            ],
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Zone Table) created: id={v2_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 3: Bin Detail Table
    # -------------------------------------------------------------------------
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Bin-Level Detail",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 50,
            "columns": [
                {"name": "warehouse_name", "title": "Warehouse", "visible": True},
                {"name": "zone_code", "title": "Zone", "visible": True},
                {"name": "bin_code", "title": "Bin", "visible": True},
                {"name": "bin_type", "title": "Type", "visible": True},
                {"name": "product_code", "title": "Product", "visible": True},
                {"name": "product_name", "title": "Product Name", "visible": True},
                {"name": "current_qty", "title": "Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "max_capacity", "title": "Capacity", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "bin_fill_pct", "title": "Fill %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "bin_status", "title": "Status", "visible": True},
            ],
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (Bin Detail Table) created: id={v3_id}\n")

    # -------------------------------------------------------------------------
    # Create Dashboard
    # -------------------------------------------------------------------------
    dash = api_call("POST", "/api/dashboards", {"name": "Warehouse Bin Utilization"})
    dash_id = dash["id"]
    dash_slug = dash.get("slug", "")
    sys.stderr.write(f"Dashboard created: id={dash_id}, slug={dash_slug}\n")

    # Add Widgets
    # Row 0: Utilization chart (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v1_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 10, "col": 0, "row": 0}},
    })
    # Row 10: Zone summary table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v2_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 10, "col": 0, "row": 10}},
    })
    # Row 20: Bin detail table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v3_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 14, "col": 0, "row": 20}},
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
