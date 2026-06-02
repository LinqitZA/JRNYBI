#!/usr/bin/env python3
"""Create Revenue by Product Category report via JRNYBI API."""
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
    result = api_call("GET", "/api/queries?q=Revenue+by+Product+Category&page_size=100")
    existing = [q for q in result.get("results", []) if "Revenue by Product Category" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} Revenue by Product Category queries already exist\n")
        return

    # Query 1: Category Summary (for bar chart + % contribution)
    # v_revenue_by_category is pre-aggregated; use v_sales_orders for date-filtered analysis.
    # The inner CTE produces one monthly revenue total per (category, month) and we
    # aggregate it into a JSON array per category so the Table viz can render it
    # as an in-cell sparkline (feature #206).
    q1_sql = """WITH monthly AS (
  SELECT
    product_category,
    date_trunc('month', order_date) AS month,
    SUM(line_total) AS month_revenue
  FROM reporting.v_sales_orders
  WHERE order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  GROUP BY product_category, date_trunc('month', order_date)
)
SELECT
  s.product_category,
  COUNT(DISTINCT s.order_id) AS order_count,
  SUM(s.quantity) AS total_qty_sold,
  COUNT(*) AS line_count,
  SUM(s.line_total) AS total_revenue,
  SUM(s.quantity * s.cost_price) AS total_cogs,
  SUM(s.line_total) - SUM(s.quantity * s.cost_price) AS total_margin,
  ROUND(AVG(s.line_gp_margin), 1) AS avg_margin_pct,
  ROUND(100.0 * SUM(s.line_total) / NULLIF(SUM(SUM(s.line_total)) OVER (), 0), 1) AS pct_of_total_revenue,
  (
    SELECT json_agg(m.month_revenue ORDER BY m.month)
    FROM monthly m
    WHERE m.product_category = s.product_category
  ) AS monthly_trend
FROM reporting.v_sales_orders s
WHERE s.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY s.product_category
ORDER BY total_revenue DESC"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Revenue by Product Category - Summary",
        "description": "Revenue and contribution margin breakdown by product category with percentage of total revenue.",
        "data_source_id": DS_ID,
        "query": q1_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2024-12-31"},
            ]
        },
        "tags": ["sales", "jrny-report"],
    })
    q1_id = q1["id"]
    sys.stderr.write(f"Query 1 created: id={q1_id}\n")

    # Query 2: Category Detail with Product Drill-down
    # v_sales_orders has product_category, product_code, product_name at line level
    q2_sql = """SELECT
  product_category,
  product_code,
  product_name,
  COUNT(DISTINCT order_id) AS order_count,
  SUM(quantity) AS total_qty_sold,
  SUM(line_total) AS total_revenue,
  SUM(line_total) - SUM(quantity * cost_price) AS total_margin,
  ROUND(AVG(line_gp_margin), 1) AS avg_margin_pct,
  ROUND(100.0 * SUM(line_total) / NULLIF(SUM(SUM(line_total)) OVER (), 0), 1) AS pct_of_total_revenue
FROM reporting.v_sales_orders
WHERE order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY product_category, product_code, product_name
ORDER BY product_category, total_revenue DESC"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Revenue by Product Category - Detail",
        "description": "Product-level revenue detail grouped by category, showing individual product contributions.",
        "data_source_id": DS_ID,
        "query": q2_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2024-12-31"},
            ]
        },
        "tags": ["sales", "jrny-report"],
    })
    q2_id = q2["id"]
    sys.stderr.write(f"Query 2 created: id={q2_id}\n")

    # Visualization 1: Horizontal Bar Chart by Category
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Revenue by Category (Bar)",
        "type": "CHART",
        "options": {
            "globalSeriesType": "bar",
            "columnMapping": {
                "product_category": "x",
                "total_revenue": "y",
                "total_margin": "y",
            },
            "seriesOptions": {
                "total_revenue": {"type": "bar", "yAxis": 0, "name": "Revenue", "color": "#2563eb"},
                "total_margin": {"type": "bar", "yAxis": 0, "name": "Margin", "color": "#16a34a"},
            },
            "sortX": True,
            "legend": {"enabled": True},
            "xAxis": {"type": "category"},
            "yAxis": [{"type": "linear", "title": {"text": "Amount"}}],
            "series": {"stacking": None},
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Bar Chart) created: id={v1_id}\n")

    # Visualization 2: Category Summary Table
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Category Summary Table",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 25,
            "columns": [
                {"name": "product_category", "title": "Category", "visible": True},
                {"name": "order_count", "title": "Orders", "visible": True, "alignContent": "right"},
                {"name": "total_qty_sold", "title": "Qty Sold", "visible": True, "alignContent": "right"},
                {"name": "line_count", "title": "Lines", "visible": True, "alignContent": "right"},
                # Feature #208 — Data bar visualises revenue magnitude across
                # categories at a glance. Bar scales to column min/max.
                {"name": "total_revenue", "title": "Revenue", "visible": True,
                 "displayAs": "data-bar", "numberFormat": "0,0.00", "alignContent": "right",
                 "dataBarColor": "positive", "dataBarShowValue": True, "dataBarHeight": 18},
                {"name": "total_cogs", "title": "COGS", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "total_margin", "title": "Margin", "visible": True,
                 "displayAs": "data-bar", "numberFormat": "0,0.00", "alignContent": "right",
                 "dataBarColor": "info", "dataBarNegativeColor": "negative",
                 "dataBarShowValue": True, "dataBarHeight": 18},
                {"name": "avg_margin_pct", "title": "Margin %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "pct_of_total_revenue", "title": "% of Total", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                # Feature #206 — in-cell sparkline of monthly revenue trend per category.
                # The query above aggregates per-month revenue into a JSON array;
                # the sparkline column type parses arrays, comma-separated strings
                # and Postgres array literals.
                {
                    "name": "monthly_trend",
                    "title": "Trend",
                    "visible": True,
                    "displayAs": "sparkline",
                    "alignContent": "left",
                    "sparklineVariant": "area",
                    "sparklineColor": "auto",
                    "sparklineShowLast": True,
                    "sparklineWidth": 120,
                    "sparklineHeight": 28,
                },
            ],
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Summary Table) created: id={v2_id}\n")

    # Visualization 3: Detail Table with Product Drill-Down
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Product Detail by Category",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 50,
            "columns": [
                {"name": "product_category", "title": "Category", "visible": True},
                {"name": "product_code", "title": "Code", "visible": True},
                {"name": "product_name", "title": "Product", "visible": True},
                {"name": "order_count", "title": "Orders", "visible": True, "alignContent": "right"},
                {"name": "total_qty_sold", "title": "Qty Sold", "visible": True, "alignContent": "right"},
                {"name": "total_revenue", "title": "Revenue", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "total_margin", "title": "Margin", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "avg_margin_pct", "title": "Margin %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "pct_of_total_revenue", "title": "% of Total", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
            ],
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (Detail Table) created: id={v3_id}\n")

    # Create Dashboard
    dash = api_call("POST", "/api/dashboards", {"name": "Revenue by Product Category"})
    dash_id = dash["id"]
    dash_slug = dash.get("slug", "")
    sys.stderr.write(f"Dashboard created: id={dash_id}, slug={dash_slug}\n")

    # Add Widgets
    # Top row: Bar chart (left) + Summary table (right)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v1_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 8, "col": 0, "row": 0}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v2_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 8, "col": 3, "row": 0}},
    })
    # Bottom row: Detail table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v3_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 12, "col": 0, "row": 8}},
    })
    sys.stderr.write("Widgets added.\n")

    # Publish
    api_call("POST", f"/api/dashboards/{dash_id}", {"is_draft": False, "tags": ["sales", "jrny-report"]})
    sys.stderr.write("Dashboard published.\n")

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
