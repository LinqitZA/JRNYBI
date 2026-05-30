#!/usr/bin/env python3
"""Create Quote-to-Order Conversion report via JRNYBI API."""
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
    result = api_call("GET", "/api/queries?q=Quote-to-Order+Conversion&page_size=100")
    existing = [q for q in result.get("results", []) if "Quote-to-Order" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} Quote-to-Order queries already exist\n")
        for q in existing:
            sys.stderr.write(f"  - {q['name']} (id={q['id']})\n")
        return

    # Query 1: Monthly Conversion Rate Trend
    q1_sql = """SELECT
  DATE_TRUNC('month', quotation_date)::date AS month,
  COUNT(*) AS total_quotes,
  SUM(CASE WHEN is_converted THEN 1 ELSE 0 END) AS converted_quotes,
  ROUND(100.0 * SUM(CASE WHEN is_converted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS conversion_rate_pct,
  ROUND(AVG(validity_days), 1) AS avg_validity_days,
  SUM(total) AS total_pipeline_value,
  SUM(CASE WHEN is_converted THEN total ELSE 0 END) AS converted_value
FROM reporting.v_quote_conversion
WHERE quotation_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY DATE_TRUNC('month', quotation_date)
ORDER BY month"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Quote-to-Order Conversion - Monthly Trend",
        "description": "Monthly quote-to-order conversion rate showing quotes submitted, converted, and average days to close.",
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

    # Query 2: Rep-Level Conversion Stats
    q2_sql = """SELECT
  sales_rep_name AS sales_rep,
  COUNT(*) AS total_quotes,
  SUM(CASE WHEN is_converted THEN 1 ELSE 0 END) AS converted_quotes,
  ROUND(100.0 * SUM(CASE WHEN is_converted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS conversion_rate_pct,
  ROUND(AVG(validity_days), 1) AS avg_validity_days,
  SUM(total) AS total_pipeline_value,
  SUM(CASE WHEN is_converted THEN total ELSE 0 END) AS converted_value,
  SUM(CASE WHEN quotation_status = 'Rejected' THEN 1 ELSE 0 END) AS rejected_quotes,
  SUM(CASE WHEN is_expired THEN 1 ELSE 0 END) AS expired_quotes
FROM reporting.v_quote_conversion
WHERE quotation_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY sales_rep_name
ORDER BY conversion_rate_pct DESC"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Quote-to-Order Conversion - Rep Performance",
        "description": "Sales rep conversion performance showing quotes handled, conversion rate, average days to close, and pipeline value.",
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

    # Visualization 1: Conversion Rate Line Chart
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Conversion Rate Trend (Line)",
        "type": "CHART",
        "options": {
            "globalSeriesType": "line",
            "columnMapping": {
                "month": "x",
                "conversion_rate_pct": "y",
                "avg_validity_days": "y",
            },
            "seriesOptions": {
                "conversion_rate_pct": {"type": "line", "yAxis": 0, "name": "Conversion Rate (%)", "color": "#2563eb"},
                "avg_validity_days": {"type": "line", "yAxis": 1, "name": "Avg Validity (Days)", "color": "#16a34a"},
            },
            "xAxis": {"type": "datetime", "labels": {"enabled": True}},
            "yAxis": [
                {"type": "linear", "title": {"text": "Conversion Rate (%)"}},
                {"type": "linear", "title": {"text": "Validity (Days)"}, "opposite": True},
            ],
            "sortX": True,
            "legend": {"enabled": True},
            "series": {"stacking": None},
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Line Chart) created: id={v1_id}\n")

    # Visualization 2: Quote Volume Bar Chart
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Quote Volume (Bar)",
        "type": "CHART",
        "options": {
            "globalSeriesType": "column",
            "columnMapping": {
                "month": "x",
                "total_quotes": "y",
                "converted_quotes": "y",
            },
            "seriesOptions": {
                "total_quotes": {"type": "column", "yAxis": 0, "name": "Total Quotes", "color": "#94a3b8"},
                "converted_quotes": {"type": "column", "yAxis": 0, "name": "Converted", "color": "#2563eb"},
            },
            "xAxis": {"type": "datetime", "labels": {"enabled": True}},
            "yAxis": [{"type": "linear", "title": {"text": "Quotes"}}],
            "sortX": True,
            "legend": {"enabled": True},
            "series": {"stacking": None},
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Bar Chart) created: id={v2_id}\n")

    # Visualization 3: Rep Conversion Table
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Rep Conversion Stats",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 25,
            "columns": [
                {"name": "sales_rep", "title": "Sales Rep", "visible": True},
                {"name": "total_quotes", "title": "Total Quotes", "visible": True, "alignContent": "right"},
                {"name": "converted_quotes", "title": "Converted", "visible": True, "alignContent": "right"},
                {"name": "conversion_rate_pct", "title": "Conversion %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "avg_validity_days", "title": "Avg Validity (Days)", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "total_pipeline_value", "title": "Pipeline Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "converted_value", "title": "Converted Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "rejected_quotes", "title": "Rejected", "visible": True, "alignContent": "right"},
                {"name": "expired_quotes", "title": "Expired", "visible": True, "alignContent": "right"},
            ],
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (Rep Table) created: id={v3_id}\n")

    # Create Dashboard
    dash = api_call("POST", "/api/dashboards", {"name": "Quote-to-Order Conversion"})
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
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 10, "col": 0, "row": 8}},
    })
    sys.stderr.write("Widgets added.\n")

    # Publish dashboard
    api_call("POST", f"/api/dashboards/{dash_id}", {"is_draft": False, "tags": ["sales", "jrny-report"]})
    sys.stderr.write("Dashboard published.\n")

    # Output summary as JSON
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
