#!/usr/bin/env python3
"""Create Sales Returns Analysis report via JRNYBI API."""
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
    result = api_call("GET", "/api/queries?q=Sales+Returns&page_size=100")
    existing = [q for q in result.get("results", []) if "Sales Returns" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} Sales Returns queries already exist\n")
        return

    # Query 1: Returns by Reason (bar chart)
    q1_sql = """SELECT
  return_reason,
  COUNT(DISTINCT return_id) AS return_count,
  SUM(return_line_value) AS total_return_value,
  COUNT(DISTINCT line_id) AS line_count
FROM reporting.v_sales_returns_analysis
WHERE return_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ product_category }}' = '' OR product_category = '{{ product_category }}')
GROUP BY return_reason
ORDER BY total_return_value DESC"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Sales Returns - By Reason",
        "description": "Sales returns aggregated by reason code showing volume and value.",
        "data_source_id": DS_ID,
        "query": q1_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2024-12-31"},
                {"name": "product_category", "title": "Product Category", "type": "text", "value": ""},
            ]
        },
        "tags": ["sales", "jrny-report"],
    })
    q1_id = q1["id"]
    sys.stderr.write(f"Query 1 created: id={q1_id}\n")

    # Query 2: Return Rate Trend Over Time
    q2_sql = """SELECT
  return_month AS month,
  COUNT(DISTINCT return_id) AS return_count,
  SUM(return_line_value) AS return_value,
  (SELECT SUM(total_amount)
   FROM reporting.v_sales_orders so
   WHERE DATE_TRUNC('month', so.order_date)::DATE = return_month
     AND so.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  ) AS sales_value,
  ROUND(
    100.0 * SUM(return_line_value) / NULLIF(
      (SELECT SUM(total_amount)
       FROM reporting.v_sales_orders so
       WHERE DATE_TRUNC('month', so.order_date)::DATE = return_month
         AND so.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
      ), 0
    ), 2
  ) AS return_rate_pct
FROM reporting.v_sales_returns_analysis
WHERE return_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ product_category }}' = '' OR product_category = '{{ product_category }}')
GROUP BY return_month
ORDER BY return_month"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Sales Returns - Rate Trend",
        "description": "Monthly return rate as percentage of sales value, showing trend over time.",
        "data_source_id": DS_ID,
        "query": q2_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2024-12-31"},
                {"name": "product_category", "title": "Product Category", "type": "text", "value": ""},
            ]
        },
        "tags": ["sales", "jrny-report"],
    })
    q2_id = q2["id"]
    sys.stderr.write(f"Query 2 created: id={q2_id}\n")

    # Query 3: Detail Table with Individual Return Records
    q3_sql = """SELECT
  return_number,
  customer_name,
  return_date,
  return_reason,
  return_status,
  order_number,
  product_code,
  product_name,
  product_category,
  return_qty,
  unit_price,
  return_line_value,
  line_reason
FROM reporting.v_sales_returns_analysis
WHERE return_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ product_category }}' = '' OR product_category = '{{ product_category }}')
ORDER BY return_date DESC, return_number"""

    q3 = api_call("POST", "/api/queries", {
        "name": "Sales Returns - Detail Records",
        "description": "Individual return records with product details and reason codes.",
        "data_source_id": DS_ID,
        "query": q3_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2024-12-31"},
                {"name": "product_category", "title": "Product Category", "type": "text", "value": ""},
            ]
        },
        "tags": ["sales", "jrny-report"],
    })
    q3_id = q3["id"]
    sys.stderr.write(f"Query 3 created: id={q3_id}\n")

    # Visualization 1: Returns by Reason (Bar Chart)
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Returns by Reason (Bar)",
        "type": "CHART",
        "options": {
            "globalSeriesType": "bar",
            "columnMapping": {
                "return_reason": "x",
                "total_return_value": "y",
            },
            "sortX": True,
            "legend": {"enabled": False},
            "xAxis": {"type": "category"},
            "yAxis": [{"type": "linear", "title": {"text": "Return Value"}}],
            "series": {"stacking": None},
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Bar Chart) created: id={v1_id}\n")

    # Visualization 2: Return Rate Trend (Line Chart)
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Return Rate Trend (Line)",
        "type": "CHART",
        "options": {
            "globalSeriesType": "line",
            "columnMapping": {
                "month": "x",
                "return_rate_pct": "y",
                "return_value": "y",
            },
            "seriesOptions": {
                "return_rate_pct": {"type": "line", "yAxis": 0, "name": "Return Rate (%)", "color": "#dc2626"},
                "return_value": {"type": "column", "yAxis": 1, "name": "Return Value", "color": "#f97316"},
            },
            "xAxis": {"type": "datetime", "labels": {"enabled": True}},
            "yAxis": [
                {"type": "linear", "title": {"text": "Return Rate (%)"}},
                {"type": "linear", "title": {"text": "Value"}, "opposite": True},
            ],
            "sortX": True,
            "legend": {"enabled": True},
            "series": {"stacking": None},
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Line Chart) created: id={v2_id}\n")

    # Visualization 3: Detail Table
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q3_id,
        "name": "Return Records Detail",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 25,
            "columns": [
                {"name": "return_number", "title": "Return #", "visible": True},
                {"name": "customer_name", "title": "Customer", "visible": True},
                {"name": "return_date", "title": "Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                {"name": "return_reason", "title": "Reason", "visible": True},
                {"name": "return_status", "title": "Status", "visible": True},
                {"name": "order_number", "title": "Order #", "visible": True},
                {"name": "product_code", "title": "Product", "visible": True},
                {"name": "product_name", "title": "Product Name", "visible": True},
                {"name": "product_category", "title": "Category", "visible": True},
                {"name": "return_qty", "title": "Qty", "visible": True, "alignContent": "right"},
                {"name": "unit_price", "title": "Unit Price", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "return_line_value", "title": "Return Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "line_reason", "title": "Detail", "visible": True},
            ],
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (Detail Table) created: id={v3_id}\n")

    # Create Dashboard
    dash = api_call("POST", "/api/dashboards", {"name": "Sales Returns Analysis"})
    dash_id = dash["id"]
    dash_slug = dash.get("slug", "")
    sys.stderr.write(f"Dashboard created: id={dash_id}, slug={dash_slug}\n")

    # Add Widgets
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
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v3_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 12, "col": 0, "row": 8}},
    })
    sys.stderr.write("Widgets added.\n")

    # Publish dashboard
    api_call("POST", f"/api/dashboards/{dash_id}", {"is_draft": False, "tags": ["sales", "jrny-report"]})
    sys.stderr.write("Dashboard published.\n")

    summary = {
        "q1_id": q1_id,
        "q2_id": q2_id,
        "q3_id": q3_id,
        "v1_id": v1_id,
        "v2_id": v2_id,
        "v3_id": v3_id,
        "dash_id": dash_id,
        "dash_slug": dash_slug,
    }
    sys.stdout.write(json.dumps(summary))


if __name__ == "__main__":
    main()
