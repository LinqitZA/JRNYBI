#!/usr/bin/env python3
"""Create Goods Receipt Summary (GRN) report via JRNYBI API.

Creates:
  - Query 1: Supplier-level GRN metrics (total GRNs, avg fill rate, inspection pass %)
  - Query 2: GRN volume over time (monthly trend)
  - Visualizations: Supplier metrics table, GRN volume chart, fill rate bar chart
  - Dashboard: "Goods Receipt Summary (GRN)" tagged report:inventory
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
    result = api_call("GET", "/api/queries?q=Goods+Receipt+Summary&page_size=100")
    existing = [q for q in result.get("results", []) if "Goods Receipt Summary" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} Goods Receipt Summary queries already exist\n")
        return

    # -------------------------------------------------------------------------
    # Query 1: Supplier-level GRN metrics
    # -------------------------------------------------------------------------
    q1_sql = """SELECT
  g.supplier_name,
  COUNT(DISTINCT g.grn_id)                                    AS total_grns,
  COUNT(g.grn_line_id)                                        AS total_lines,
  ROUND(AVG(g.fill_rate_pct), 1)                              AS avg_fill_rate_pct,
  ROUND(SUM(g.received_qty)::NUMERIC / NULLIF(SUM(g.expected_qty), 0) * 100, 1)
                                                              AS overall_fill_rate_pct,
  SUM(g.rejected_qty)                                         AS total_rejected,
  ROUND(
    COUNT(*) FILTER (WHERE g.inspection_result = 'pass')::NUMERIC
    / NULLIF(COUNT(*) FILTER (WHERE g.inspection_result IS NOT NULL), 0)
    * 100, 1
  )                                                           AS inspection_pass_pct,
  ROUND(AVG(g.lead_time_days), 1)                             AS avg_lead_time_days,
  ROUND(
    COUNT(DISTINCT g.grn_id) FILTER (WHERE g.on_time)::NUMERIC
    / NULLIF(COUNT(DISTINCT g.grn_id), 0)
    * 100, 1
  )                                                           AS on_time_pct,
  SUM(g.line_total)                                           AS total_received_value
FROM reporting.v_grn_summary g
WHERE g.receipt_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier }}' = '' OR g.supplier_name ILIKE '%' || '{{ supplier }}' || '%')
GROUP BY g.supplier_name
ORDER BY total_grns DESC"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Goods Receipt Summary - Supplier Metrics",
        "description": "Supplier-level GRN performance: total receipts, fill rates, inspection pass rates, lead times, and on-time delivery. Key metrics for supplier quality and reliability assessment.",
        "data_source_id": DS_ID,
        "query": q1_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2026-12-31"},
                {"name": "supplier", "title": "Supplier", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q1_id = q1["id"]
    sys.stderr.write(f"Query 1 (Supplier Metrics) created: id={q1_id}\n")

    # -------------------------------------------------------------------------
    # Query 2: GRN volume over time
    # -------------------------------------------------------------------------
    q2_sql = """SELECT
  DATE_TRUNC('month', g.receipt_date)::DATE                   AS month,
  COUNT(DISTINCT g.grn_id)                                    AS grn_count,
  SUM(g.received_qty)                                         AS total_received_qty,
  SUM(g.expected_qty)                                         AS total_expected_qty,
  ROUND(SUM(g.received_qty)::NUMERIC / NULLIF(SUM(g.expected_qty), 0) * 100, 1)
                                                              AS period_fill_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE g.inspection_result = 'pass')::NUMERIC
    / NULLIF(COUNT(*) FILTER (WHERE g.inspection_result IS NOT NULL), 0)
    * 100, 1
  )                                                           AS period_inspection_pass_pct,
  SUM(g.rejected_qty)                                         AS total_rejected,
  ROUND(AVG(g.lead_time_days), 1)                             AS avg_lead_time_days,
  SUM(g.line_total)                                           AS received_value
FROM reporting.v_grn_summary g
WHERE g.receipt_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier }}' = '' OR g.supplier_name ILIKE '%' || '{{ supplier }}' || '%')
GROUP BY DATE_TRUNC('month', g.receipt_date)
ORDER BY month"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Goods Receipt Summary - Monthly Trend",
        "description": "Monthly GRN volume trend showing receipt counts, fill rates, inspection pass rates, and lead time performance over time.",
        "data_source_id": DS_ID,
        "query": q2_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2026-12-31"},
                {"name": "supplier", "title": "Supplier", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q2_id = q2["id"]
    sys.stderr.write(f"Query 2 (Monthly Trend) created: id={q2_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 1: Supplier Metrics Table
    # -------------------------------------------------------------------------
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Supplier GRN Metrics",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 25,
            "columns": [
                {"name": "supplier_name", "title": "Supplier", "visible": True},
                {"name": "total_grns", "title": "GRNs", "visible": True, "alignContent": "right"},
                {"name": "total_lines", "title": "Lines", "visible": True, "alignContent": "right"},
                {"name": "overall_fill_rate_pct", "title": "Fill Rate %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "inspection_pass_pct", "title": "Inspection Pass %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "total_rejected", "title": "Rejected Qty", "visible": True, "alignContent": "right"},
                {"name": "avg_lead_time_days", "title": "Avg Lead Time (days)", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "on_time_pct", "title": "On-Time %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "total_received_value", "title": "Total Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
            ],
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Supplier Table) created: id={v1_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 2: Fill Rate by Supplier (horizontal bar chart)
    # -------------------------------------------------------------------------
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Fill Rate by Supplier",
        "type": "CHART",
        "options": {
            "globalSeriesType": "column",
            "columnMapping": {
                "supplier_name": "x",
                "overall_fill_rate_pct": "y",
                "inspection_pass_pct": "y",
            },
            "seriesOptions": {
                "overall_fill_rate_pct": {"type": "column", "yAxis": 0, "color": "#2563eb", "name": "Fill Rate %"},
                "inspection_pass_pct": {"type": "column", "yAxis": 0, "color": "#16a34a", "name": "Inspection Pass %"},
            },
            "legend": {"enabled": True},
            "xAxis": {"type": "category", "title": {"text": "Supplier"}},
            "yAxis": [{"type": "linear", "title": {"text": "Percentage"}, "rangeMax": 100}],
            "numberFormat": "0.0",
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Fill Rate Chart) created: id={v2_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 3: GRN Volume Over Time (line + column combo)
    # -------------------------------------------------------------------------
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "GRN Volume Over Time",
        "type": "CHART",
        "options": {
            "globalSeriesType": "column",
            "columnMapping": {
                "month": "x",
                "grn_count": "y",
                "period_fill_rate_pct": "y",
            },
            "seriesOptions": {
                "grn_count": {"type": "column", "yAxis": 0, "color": "#2563eb", "name": "GRN Count"},
                "period_fill_rate_pct": {"type": "line", "yAxis": 1, "color": "#dc2626", "name": "Fill Rate %"},
            },
            "sortX": True,
            "legend": {"enabled": True},
            "xAxis": {"type": "datetime", "title": {"text": "Month"}},
            "yAxis": [
                {"type": "linear", "title": {"text": "GRN Count"}},
                {"type": "linear", "title": {"text": "Fill Rate %"}, "opposite": True, "rangeMax": 100},
            ],
            "numberFormat": "0,0",
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (Volume Chart) created: id={v3_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 4: Monthly Trend Table
    # -------------------------------------------------------------------------
    v4 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Monthly GRN Summary",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 25,
            "columns": [
                {"name": "month", "title": "Month", "visible": True},
                {"name": "grn_count", "title": "GRNs", "visible": True, "alignContent": "right"},
                {"name": "total_received_qty", "title": "Received Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "total_expected_qty", "title": "Expected Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "period_fill_rate_pct", "title": "Fill Rate %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "period_inspection_pass_pct", "title": "Inspection Pass %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "total_rejected", "title": "Rejected", "visible": True, "alignContent": "right"},
                {"name": "avg_lead_time_days", "title": "Avg Lead Time", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                {"name": "received_value", "title": "Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
            ],
        },
    })
    v4_id = v4["id"]
    sys.stderr.write(f"Vis 4 (Monthly Table) created: id={v4_id}\n")

    # -------------------------------------------------------------------------
    # Create Dashboard
    # -------------------------------------------------------------------------
    dash = api_call("POST", "/api/dashboards", {"name": "Goods Receipt Summary (GRN)"})
    dash_id = dash["id"]
    dash_slug = dash.get("slug", "")
    sys.stderr.write(f"Dashboard created: id={dash_id}, slug={dash_slug}\n")

    # Add Widgets
    # Row 0: GRN Volume chart (left) + Fill Rate chart (right)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v3_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 10, "col": 0, "row": 0}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v2_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 10, "col": 3, "row": 0}},
    })
    # Row 10: Supplier metrics table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v1_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 10, "col": 0, "row": 10}},
    })
    # Row 20: Monthly trend table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v4_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 10, "col": 0, "row": 20}},
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
        "v4_id": v4_id,
        "dash_id": dash_id,
        "dash_slug": dash_slug,
    }
    sys.stdout.write(json.dumps(summary))


if __name__ == "__main__":
    main()
