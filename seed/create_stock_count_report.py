#!/usr/bin/env python3
"""Create Stock Count Variance report via JRNYBI API.

Creates:
  - Query 1: Variance summary by warehouse zone and product category
  - Query 2: Item-level detail with material variances
  - Query 3: Variance distribution chart data
  - Visualizations: Summary table, detail table, variance distribution chart
  - Dashboard: "Stock Count Variance" tagged report:inventory
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
    result = api_call("GET", "/api/queries?q=Stock+Count+Variance&page_size=100")
    existing = [q for q in result.get("results", []) if "Stock Count Variance" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} Stock Count Variance queries already exist\n")
        return

    # -------------------------------------------------------------------------
    # Query 1: Variance summary by zone and product category
    # -------------------------------------------------------------------------
    q1_sql = """SELECT
  v.warehouse_name,
  v.zone,
  v.product_category,
  COUNT(*) AS line_count,
  SUM(v.book_qty) AS total_book_qty,
  SUM(v.physical_qty) AS total_physical_qty,
  SUM(v.variance_qty) AS total_variance_qty,
  SUM(v.variance_value) AS total_variance_value,
  COUNT(*) FILTER (WHERE v.variance_type = 'Shrinkage') AS shrinkage_count,
  COUNT(*) FILTER (WHERE v.variance_type = 'Over-count') AS overcount_count,
  COUNT(*) FILTER (WHERE v.variance_type = 'Match') AS match_count,
  ROUND(
    COUNT(*) FILTER (WHERE v.variance_type = 'Match')::NUMERIC
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS accuracy_pct
FROM reporting.v_stock_count_variance v
WHERE v.count_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ warehouse }}' = '' OR v.warehouse_name ILIKE '%' || '{{ warehouse }}' || '%')
  AND v.count_status = 'completed'
GROUP BY v.warehouse_name, v.zone, v.product_category
ORDER BY total_variance_value ASC"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Stock Count Variance - Summary",
        "description": "Stock count variance summary by warehouse zone and product category. Shows total shrinkage value, over-count value, and accuracy percentages for each area.",
        "data_source_id": DS_ID,
        "query": q1_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Count Date From", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "Count Date To", "type": "date", "value": "2026-12-31"},
                {"name": "warehouse", "title": "Warehouse", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q1_id = q1["id"]
    sys.stderr.write(f"Query 1 (Summary) created: id={q1_id}\n")

    # -------------------------------------------------------------------------
    # Query 2: Item-level detail (material variances)
    # -------------------------------------------------------------------------
    q2_sql = """SELECT
  v.count_number,
  v.count_date,
  v.warehouse_name,
  v.zone,
  v.product_code,
  v.product_name,
  v.product_category,
  v.book_qty,
  v.physical_qty,
  v.variance_qty,
  v.variance_pct,
  v.unit_cost,
  v.variance_value,
  v.variance_type,
  v.counted_by
FROM reporting.v_stock_count_variance v
WHERE v.count_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ warehouse }}' = '' OR v.warehouse_name ILIKE '%' || '{{ warehouse }}' || '%')
  AND v.count_status = 'completed'
  AND v.variance_qty <> 0
ORDER BY ABS(v.variance_value) DESC"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Stock Count Variance - Detail",
        "description": "Item-level stock count variances (non-zero only). Sorted by absolute variance value to highlight the most material discrepancies requiring investigation.",
        "data_source_id": DS_ID,
        "query": q2_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Count Date From", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "Count Date To", "type": "date", "value": "2026-12-31"},
                {"name": "warehouse", "title": "Warehouse", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q2_id = q2["id"]
    sys.stderr.write(f"Query 2 (Detail) created: id={q2_id}\n")

    # -------------------------------------------------------------------------
    # Query 3: Variance distribution (for chart)
    # -------------------------------------------------------------------------
    q3_sql = """SELECT
  v.variance_type,
  COUNT(*) AS item_count,
  ABS(SUM(v.variance_value)) AS total_abs_value
FROM reporting.v_stock_count_variance v
WHERE v.count_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ warehouse }}' = '' OR v.warehouse_name ILIKE '%' || '{{ warehouse }}' || '%')
  AND v.count_status = 'completed'
GROUP BY v.variance_type
ORDER BY v.variance_type"""

    q3 = api_call("POST", "/api/queries", {
        "name": "Stock Count Variance - Distribution",
        "description": "Variance distribution showing counts and values by type (Shrinkage, Over-count, Match).",
        "data_source_id": DS_ID,
        "query": q3_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Count Date From", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "Count Date To", "type": "date", "value": "2026-12-31"},
                {"name": "warehouse", "title": "Warehouse", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q3_id = q3["id"]
    sys.stderr.write(f"Query 3 (Distribution) created: id={q3_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 1: Summary Table
    # -------------------------------------------------------------------------
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Variance Summary by Zone",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 25,
            "columns": [
                {"name": "warehouse_name", "title": "Warehouse", "visible": True},
                {"name": "zone", "title": "Zone", "visible": True},
                {"name": "product_category", "title": "Category", "visible": True},
                {"name": "line_count", "title": "Items Counted", "visible": True, "alignContent": "right"},
                {"name": "total_variance_qty", "title": "Variance Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "total_variance_value", "title": "Variance Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "shrinkage_count", "title": "Shrinkage", "visible": True, "alignContent": "right"},
                {"name": "overcount_count", "title": "Over-count", "visible": True, "alignContent": "right"},
                {"name": "match_count", "title": "Match", "visible": True, "alignContent": "right"},
                {"name": "accuracy_pct", "title": "Accuracy %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
            ],
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Summary Table) created: id={v1_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 2: Variance Distribution Pie Chart
    # -------------------------------------------------------------------------
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q3_id,
        "name": "Variance Distribution",
        "type": "CHART",
        "options": {
            "globalSeriesType": "pie",
            "columnMapping": {
                "variance_type": "x",
                "item_count": "y",
            },
            "seriesOptions": {
                "Shrinkage": {"color": "#dc2626"},
                "Over-count": {"color": "#eab308"},
                "Match": {"color": "#16a34a"},
            },
            "legend": {"enabled": True},
            "numberFormat": "0,0",
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Pie Chart) created: id={v2_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 3: Variance Value by Type (bar chart)
    # -------------------------------------------------------------------------
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q3_id,
        "name": "Variance Value by Type",
        "type": "CHART",
        "options": {
            "globalSeriesType": "column",
            "columnMapping": {
                "variance_type": "x",
                "total_abs_value": "y",
            },
            "seriesOptions": {
                "total_abs_value": {"type": "column", "yAxis": 0, "color": "#2563eb", "name": "Total Value"},
            },
            "legend": {"enabled": False},
            "xAxis": {"type": "category", "title": {"text": "Variance Type"}},
            "yAxis": [{"type": "linear", "title": {"text": "Total Value (Abs)"}}],
            "numberFormat": "0,0.00",
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (Bar Chart) created: id={v3_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 4: Detail Table (material items only)
    # -------------------------------------------------------------------------
    v4 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Item-Level Variance Detail",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 50,
            "columns": [
                {"name": "count_number", "title": "Count #", "visible": True},
                {"name": "count_date", "title": "Date", "visible": True},
                {"name": "warehouse_name", "title": "Warehouse", "visible": True},
                {"name": "zone", "title": "Zone", "visible": True},
                {"name": "product_code", "title": "Product Code", "visible": True},
                {"name": "product_name", "title": "Product", "visible": True},
                {"name": "product_category", "title": "Category", "visible": True},
                {"name": "book_qty", "title": "Book Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "physical_qty", "title": "Physical Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "variance_qty", "title": "Variance", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "variance_pct", "title": "Variance %", "visible": True, "displayAs": "number", "numberFormat": "0.00", "alignContent": "right"},
                {"name": "variance_value", "title": "Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "variance_type", "title": "Type", "visible": True},
            ],
        },
    })
    v4_id = v4["id"]
    sys.stderr.write(f"Vis 4 (Detail Table) created: id={v4_id}\n")

    # -------------------------------------------------------------------------
    # Create Dashboard
    # -------------------------------------------------------------------------
    dash = api_call("POST", "/api/dashboards", {"name": "Stock Count Variance"})
    dash_id = dash["id"]
    dash_slug = dash.get("slug", "")
    sys.stderr.write(f"Dashboard created: id={dash_id}, slug={dash_slug}\n")

    # Add Widgets
    # Row 0: Pie chart (left) + Bar chart (right)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v2_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 10, "col": 0, "row": 0}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v3_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 10, "col": 3, "row": 0}},
    })
    # Row 10: Summary table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v1_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 10, "col": 0, "row": 10}},
    })
    # Row 20: Detail table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v4_id,
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
