#!/usr/bin/env python3
"""Create Inventory Aging per Warehouse report via JRNYBI API.

Creates:
  - Query 1: Aging by Warehouse (stacked bar chart + summary)
  - Query 2: Product-level Aging Detail (detail table)
  - Query 3: KPI — Total value of stock >90 days old
  - Visualizations: Stacked bar chart, summary table, detail table, KPI counter
  - Dashboard: "Inventory Aging per Warehouse" tagged report:inventory
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
    result = api_call("GET", "/api/queries?q=Inventory+Aging&page_size=100")
    existing = [q for q in result.get("results", []) if "Inventory Aging" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} Inventory Aging queries already exist\n")
        return

    # -------------------------------------------------------------------------
    # Query 1: Aging by Warehouse (for stacked bar chart)
    # -------------------------------------------------------------------------
    q1_sql = """SELECT
  warehouse,
  aging_bucket,
  COUNT(*) AS item_count,
  SUM(quantity_on_hand) AS total_quantity,
  SUM(total_value) AS total_value
FROM reporting.v_inventory_aging
WHERE ('{{ warehouse }}' = '' OR warehouse = '{{ warehouse }}')
GROUP BY warehouse, aging_bucket
ORDER BY warehouse,
  CASE aging_bucket
    WHEN '0-30 Days' THEN 1
    WHEN '31-60 Days' THEN 2
    WHEN '61-90 Days' THEN 3
    WHEN '91-180 Days' THEN 4
    WHEN '180+ Days' THEN 5
    ELSE 6
  END"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Inventory Aging per Warehouse - Summary",
        "description": "Stock age distribution (0-30, 31-60, 61-90, 91-180, 180+ days) aggregated by warehouse. Identifies obsolescence risk for working capital management.",
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
    sys.stderr.write(f"Query 1 (Summary) created: id={q1_id}\n")

    # -------------------------------------------------------------------------
    # Query 2: Product-level Aging Detail
    # -------------------------------------------------------------------------
    q2_sql = """SELECT
  product_code,
  product_name,
  warehouse,
  quantity_on_hand,
  unit_cost,
  total_value,
  last_received_date,
  days_in_stock,
  aging_bucket,
  months_of_supply
FROM reporting.v_inventory_aging
WHERE ('{{ warehouse }}' = '' OR warehouse = '{{ warehouse }}')
ORDER BY days_in_stock DESC, total_value DESC"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Inventory Aging per Warehouse - Detail",
        "description": "Product-level aging detail showing days in stock, aging bucket, and months of supply per warehouse.",
        "data_source_id": DS_ID,
        "query": q2_sql,
        "options": {
            "parameters": [
                {"name": "warehouse", "title": "Warehouse", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q2_id = q2["id"]
    sys.stderr.write(f"Query 2 (Detail) created: id={q2_id}\n")

    # -------------------------------------------------------------------------
    # Query 3: KPI — Total value of stock older than 90 days
    # -------------------------------------------------------------------------
    q3_sql = """SELECT
  SUM(total_value) AS value_over_90_days,
  COUNT(*) AS items_over_90_days,
  SUM(CASE WHEN aging_bucket = '180+ Days' THEN total_value ELSE 0 END) AS value_over_180_days,
  SUM(total_value) AS total_inventory_value,
  ROUND(100.0 * SUM(CASE WHEN days_in_stock > 90 THEN total_value ELSE 0 END)
    / NULLIF(SUM(total_value), 0), 1) AS pct_over_90_days
FROM reporting.v_inventory_aging
WHERE days_in_stock > 90
  AND ('{{ warehouse }}' = '' OR warehouse = '{{ warehouse }}')"""

    q3 = api_call("POST", "/api/queries", {
        "name": "Inventory Aging per Warehouse - KPI",
        "description": "KPI: Total value and count of inventory items older than 90 days. Supports obsolescence risk monitoring.",
        "data_source_id": DS_ID,
        "query": q3_sql,
        "options": {
            "parameters": [
                {"name": "warehouse", "title": "Warehouse", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q3_id = q3["id"]
    sys.stderr.write(f"Query 3 (KPI) created: id={q3_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 1: Stacked Bar Chart — Warehouses on X, Aging Buckets as series
    # -------------------------------------------------------------------------
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Aging by Warehouse (Stacked Bar)",
        "type": "CHART",
        "options": {
            "globalSeriesType": "column",
            "columnMapping": {
                "warehouse": "x",
                "total_value": "y",
                "aging_bucket": "series",
            },
            "seriesOptions": {
                "0-30 Days": {"type": "column", "yAxis": 0, "color": "#16a34a"},
                "31-60 Days": {"type": "column", "yAxis": 0, "color": "#84cc16"},
                "61-90 Days": {"type": "column", "yAxis": 0, "color": "#eab308"},
                "91-180 Days": {"type": "column", "yAxis": 0, "color": "#f97316"},
                "180+ Days": {"type": "column", "yAxis": 0, "color": "#dc2626"},
            },
            "series": {"stacking": "stack"},
            "sortX": True,
            "legend": {"enabled": True},
            "xAxis": {"type": "category", "title": {"text": "Warehouse"}},
            "yAxis": [{"type": "linear", "title": {"text": "Inventory Value"}}],
            "numberFormat": "0,0.00",
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Stacked Bar) created: id={v1_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 2: Summary Table
    # -------------------------------------------------------------------------
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Aging Summary Table",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 25,
            "columns": [
                {"name": "warehouse", "title": "Warehouse", "visible": True},
                {"name": "aging_bucket", "title": "Aging Bucket", "visible": True},
                {"name": "item_count", "title": "Items", "visible": True, "alignContent": "right"},
                {"name": "total_quantity", "title": "Qty on Hand", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "total_value", "title": "Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
            ],
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Summary Table) created: id={v2_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 3: Detail Table
    # -------------------------------------------------------------------------
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Product Aging Detail",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 50,
            "columns": [
                {"name": "product_code", "title": "Code", "visible": True},
                {"name": "product_name", "title": "Product", "visible": True},
                {"name": "warehouse", "title": "Warehouse", "visible": True},
                {"name": "quantity_on_hand", "title": "Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "unit_cost", "title": "Unit Cost", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "total_value", "title": "Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "last_received_date", "title": "Last Received", "visible": True},
                {"name": "days_in_stock", "title": "Days in Stock", "visible": True, "alignContent": "right"},
                {"name": "aging_bucket", "title": "Aging Bucket", "visible": True},
                {"name": "months_of_supply", "title": "Months Supply", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
            ],
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (Detail Table) created: id={v3_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 4: KPI Counter — Value of stock >90 days
    # -------------------------------------------------------------------------
    v4 = api_call("POST", "/api/visualizations", {
        "query_id": q3_id,
        "name": "Stock >90 Days Value",
        "type": "COUNTER",
        "options": {
            "counterColName": "value_over_90_days",
            "counterLabel": "Stock Value >90 Days Old",
            "targetColName": "total_inventory_value",
            "targetRowNumber": 1,
            "stringDecimal": 2,
            "stringDecChar": ".",
            "stringThouSep": ",",
            "formatTargetValue": True,
        },
    })
    v4_id = v4["id"]
    sys.stderr.write(f"Vis 4 (KPI Counter) created: id={v4_id}\n")

    # -------------------------------------------------------------------------
    # Create Dashboard
    # -------------------------------------------------------------------------
    dash = api_call("POST", "/api/dashboards", {"name": "Inventory Aging per Warehouse"})
    dash_id = dash["id"]
    dash_slug = dash.get("slug", "")
    sys.stderr.write(f"Dashboard created: id={dash_id}, slug={dash_slug}\n")

    # Add Widgets
    # Row 0: KPI (left, narrow) + Stacked bar chart (right, wide)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v4_id,
        "width": 2,
        "options": {"position": {"autoHeight": True, "sizeX": 2, "sizeY": 5, "col": 0, "row": 0}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v1_id,
        "width": 4,
        "options": {"position": {"autoHeight": True, "sizeX": 4, "sizeY": 10, "col": 2, "row": 0}},
    })
    # Row 10: Summary table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v2_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 8, "col": 0, "row": 10}},
    })
    # Row 18: Detail table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v3_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 14, "col": 0, "row": 18}},
    })
    sys.stderr.write("Widgets added.\n")

    # Publish with inventory tag
    api_call("POST", f"/api/dashboards/{dash_id}", {
        "is_draft": False,
        "tags": ["inventory", "jrny-report", "report:inventory"],
    })
    sys.stderr.write("Dashboard published with tags [inventory, jrny-report, report:inventory].\n")

    summary = {
        "q1_id": q1_id,
        "q2_id": q2_id,
        "q3_id": q3_id,
        "v1_id": v1_id,
        "v2_id": v2_id,
        "v3_id": v3_id,
        "v4_id": v4_id,
        "dash_id": dash_id,
        "dash_slug": dash_slug,
    }
    sys.stdout.write(json.dumps(summary))


if __name__ == "__main__":
    main()
