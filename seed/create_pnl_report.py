#!/usr/bin/env python3
"""Create Profit & Loss Statement report via JRNYBI API."""
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
    result = api_call("GET", "/api/queries?q=Profit+Loss&page_size=100")
    existing = [q for q in result.get("results", []) if "Profit" in q["name"] and "Loss" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} P&L queries already exist\n")
        for q in existing:
            sys.stderr.write(f"  - {q['name']} (id={q['id']})\n")
        return

    # ========================================================================
    # Query 1: Detailed P&L Statement with Account Hierarchy
    # ========================================================================
    q1_sql = """WITH current_period AS (
  SELECT
    account_code,
    account_name,
    account_type,
    account_group,
    SUM(net_amount) AS current_amount
  FROM reporting.v_general_ledger
  WHERE entry_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    AND account_type IN ('revenue', 'expense')
  GROUP BY account_code, account_name, account_type, account_group
),
prior_period AS (
  SELECT
    account_code,
    SUM(net_amount) AS prior_amount
  FROM reporting.v_general_ledger
  WHERE entry_date BETWEEN
    ('{{ start_date }}'::DATE - ('{{ end_date }}'::DATE - '{{ start_date }}'::DATE + 1))
    AND ('{{ start_date }}'::DATE - INTERVAL '1 day')
    AND account_type IN ('revenue', 'expense')
  GROUP BY account_code
),
pnl_detail AS (
  SELECT
    cp.account_type,
    COALESCE(cp.account_group, INITCAP(cp.account_type)) AS account_group,
    cp.account_code,
    '    ' || cp.account_name AS account_name,
    cp.current_amount,
    COALESCE(pp.prior_amount, 0) AS prior_amount,
    cp.current_amount - COALESCE(pp.prior_amount, 0) AS variance,
    CASE
      WHEN COALESCE(pp.prior_amount, 0) = 0 THEN NULL
      ELSE ROUND(100.0 * (cp.current_amount - pp.prior_amount) / ABS(pp.prior_amount), 1)
    END AS variance_pct
  FROM current_period cp
  LEFT JOIN prior_period pp ON pp.account_code = cp.account_code
)
SELECT
  account_group,
  account_code,
  account_name,
  current_amount,
  prior_amount,
  variance,
  variance_pct
FROM pnl_detail
ORDER BY
  CASE account_type WHEN 'revenue' THEN 1 WHEN 'expense' THEN 2 END,
  account_group,
  account_code"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Profit & Loss Statement - Detail",
        "description": "Detailed income statement with account-level breakdown, period comparison, and variance analysis. Shows revenue minus expenses grouped by category.",
        "data_source_id": DS_ID,
        "query": q1_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2024-12-31"},
            ]
        },
        "tags": ["finance", "jrny-report"],
    })
    q1_id = q1["id"]
    sys.stderr.write(f"Query 1 (P&L Detail) created: id={q1_id}\n")

    # ========================================================================
    # Query 2: P&L Monthly Trend / Summary
    # ========================================================================
    q2_sql = """SELECT
  DATE_TRUNC('month', entry_date)::DATE AS month,
  SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END) AS total_revenue,
  SUM(CASE WHEN account_type = 'expense' AND account_group ILIKE '%cost%sale%' THEN net_amount ELSE 0 END) AS cost_of_sales,
  SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END)
    - SUM(CASE WHEN account_type = 'expense' AND account_group ILIKE '%cost%sale%' THEN net_amount ELSE 0 END) AS gross_profit,
  SUM(CASE WHEN account_type = 'expense' AND account_group NOT ILIKE '%cost%sale%' THEN net_amount ELSE 0 END) AS operating_expenses,
  SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END)
    - SUM(CASE WHEN account_type = 'expense' THEN net_amount ELSE 0 END) AS net_income,
  ROUND(100.0 * (
    SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END)
    - SUM(CASE WHEN account_type = 'expense' THEN net_amount ELSE 0 END)
  ) / NULLIF(SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END), 0), 1) AS net_margin_pct
FROM reporting.v_general_ledger
WHERE entry_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND account_type IN ('revenue', 'expense')
GROUP BY DATE_TRUNC('month', entry_date)
ORDER BY month"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Profit & Loss Statement - Monthly Trend",
        "description": "Monthly revenue, gross profit, operating income, and net income trend with margin percentage.",
        "data_source_id": DS_ID,
        "query": q2_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2024-12-31"},
            ]
        },
        "tags": ["finance", "jrny-report"],
    })
    q2_id = q2["id"]
    sys.stderr.write(f"Query 2 (P&L Trend) created: id={q2_id}\n")

    # ========================================================================
    # Query 3: P&L Summary KPIs (Total for period)
    # ========================================================================
    q3_sql = """SELECT
  SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END) AS total_revenue,
  SUM(CASE WHEN account_type = 'expense' AND account_group ILIKE '%cost%sale%' THEN net_amount ELSE 0 END) AS total_cogs,
  SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END)
    - SUM(CASE WHEN account_type = 'expense' AND account_group ILIKE '%cost%sale%' THEN net_amount ELSE 0 END) AS gross_profit,
  ROUND(100.0 * (
    SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END)
    - SUM(CASE WHEN account_type = 'expense' AND account_group ILIKE '%cost%sale%' THEN net_amount ELSE 0 END)
  ) / NULLIF(SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END), 0), 1) AS gross_margin_pct,
  SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END)
    - SUM(CASE WHEN account_type = 'expense' THEN net_amount ELSE 0 END) AS net_income,
  ROUND(100.0 * (
    SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END)
    - SUM(CASE WHEN account_type = 'expense' THEN net_amount ELSE 0 END)
  ) / NULLIF(SUM(CASE WHEN account_type = 'revenue' THEN net_amount ELSE 0 END), 0), 1) AS net_margin_pct
FROM reporting.v_general_ledger
WHERE entry_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND account_type IN ('revenue', 'expense')"""

    q3 = api_call("POST", "/api/queries", {
        "name": "Profit & Loss Statement - KPIs",
        "description": "Key P&L metrics: total revenue, gross profit, gross margin %, net income, net margin %.",
        "data_source_id": DS_ID,
        "query": q3_sql,
        "options": {
            "parameters": [
                {"name": "start_date", "title": "Start Date", "type": "date", "value": "2024-01-01"},
                {"name": "end_date", "title": "End Date", "type": "date", "value": "2024-12-31"},
            ]
        },
        "tags": ["finance", "jrny-report"],
    })
    q3_id = q3["id"]
    sys.stderr.write(f"Query 3 (P&L KPIs) created: id={q3_id}\n")

    # ========================================================================
    # Visualization 1: Detailed P&L Table (hierarchical)
    # ========================================================================
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "P&L Statement Detail",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 50,
            "columns": [
                {"name": "account_group", "title": "Category", "visible": True},
                {"name": "account_code", "title": "Code", "visible": True},
                {"name": "account_name", "title": "Account", "visible": True},
                {"name": "current_amount", "title": "Current Period", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "prior_amount", "title": "Prior Period", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "variance", "title": "Variance", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "variance_pct", "title": "Variance %", "visible": True,
                 "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
            ],
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Detail Table) created: id={v1_id}\n")

    # ========================================================================
    # Visualization 2: Revenue vs Expenses Trend (stacked bar + line)
    # ========================================================================
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Revenue vs Expenses Trend",
        "type": "CHART",
        "options": {
            "globalSeriesType": "column",
            "columnMapping": {
                "month": "x",
                "total_revenue": "y",
                "cost_of_sales": "y",
                "operating_expenses": "y",
                "net_income": "y",
            },
            "seriesOptions": {
                "total_revenue": {"type": "column", "yAxis": 0, "name": "Revenue", "color": "#2563eb"},
                "cost_of_sales": {"type": "column", "yAxis": 0, "name": "COGS", "color": "#f59e0b"},
                "operating_expenses": {"type": "column", "yAxis": 0, "name": "Operating Expenses", "color": "#ef4444"},
                "net_income": {"type": "line", "yAxis": 0, "name": "Net Income", "color": "#16a34a"},
            },
            "xAxis": {"type": "datetime", "labels": {"enabled": True}},
            "yAxis": [{"type": "linear", "title": {"text": "Amount"}}],
            "sortX": True,
            "legend": {"enabled": True},
            "series": {"stacking": None},
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Trend Chart) created: id={v2_id}\n")

    # ========================================================================
    # Visualization 3: Margin Trend Line
    # ========================================================================
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Profit Margin Trend",
        "type": "CHART",
        "options": {
            "globalSeriesType": "line",
            "columnMapping": {
                "month": "x",
                "net_margin_pct": "y",
            },
            "seriesOptions": {
                "net_margin_pct": {"type": "line", "yAxis": 0, "name": "Net Margin %", "color": "#16a34a"},
            },
            "xAxis": {"type": "datetime", "labels": {"enabled": True}},
            "yAxis": [{"type": "linear", "title": {"text": "Margin %"}}],
            "sortX": True,
            "legend": {"enabled": True},
            "series": {"stacking": None},
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (Margin Line) created: id={v3_id}\n")

    # ========================================================================
    # Visualization 4: Net Income KPI Counter
    # ========================================================================
    v4 = api_call("POST", "/api/visualizations", {
        "query_id": q3_id,
        "name": "Net Income",
        "type": "COUNTER",
        "options": {
            "counterLabel": "Net Income",
            "counterColName": "net_income",
            "rowNumber": 1,
            "targetRowNumber": 1,
            "targetColName": "total_revenue",
            "stringDecimal": 2,
            "stringDecChar": ".",
            "stringThouSep": ",",
            "formatTargetValue": True,
        },
    })
    v4_id = v4["id"]
    sys.stderr.write(f"Vis 4 (Net Income Counter) created: id={v4_id}\n")

    # ========================================================================
    # Visualization 5: Gross Margin KPI Counter
    # ========================================================================
    v5 = api_call("POST", "/api/visualizations", {
        "query_id": q3_id,
        "name": "Gross Margin %",
        "type": "COUNTER",
        "options": {
            "counterLabel": "Gross Margin %",
            "counterColName": "gross_margin_pct",
            "rowNumber": 1,
            "targetRowNumber": 1,
            "targetColName": "net_margin_pct",
            "stringSuffix": "%",
            "stringDecimal": 1,
            "stringDecChar": ".",
            "stringThouSep": ",",
            "formatTargetValue": True,
            "targetColSuffix": "%",
        },
    })
    v5_id = v5["id"]
    sys.stderr.write(f"Vis 5 (Gross Margin Counter) created: id={v5_id}\n")

    # ========================================================================
    # Visualization 6: Monthly P&L Summary Table
    # ========================================================================
    v6 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Monthly P&L Summary",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 25,
            "columns": [
                {"name": "month", "title": "Month", "visible": True, "displayAs": "datetime",
                 "dateTimeFormat": "MMM YYYY"},
                {"name": "total_revenue", "title": "Revenue", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "cost_of_sales", "title": "COGS", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "gross_profit", "title": "Gross Profit", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "operating_expenses", "title": "Operating Exp.", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "operating_income", "title": "Operating Income", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "other_expenses", "title": "Other Exp.", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "net_income", "title": "Net Income", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "net_margin_pct", "title": "Net Margin %", "visible": True,
                 "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
            ],
        },
    })
    v6_id = v6["id"]
    sys.stderr.write(f"Vis 6 (Monthly Summary Table) created: id={v6_id}\n")

    # ========================================================================
    # Create Dashboard
    # ========================================================================
    dash = api_call("POST", "/api/dashboards", {"name": "Profit & Loss Statement"})
    dash_id = dash["id"]
    dash_slug = dash.get("slug", "")
    sys.stderr.write(f"Dashboard created: id={dash_id}, slug={dash_slug}\n")

    # ========================================================================
    # Add Widgets to Dashboard
    # ========================================================================
    # Row 0: KPI counters (2 across top)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v4_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 5, "col": 0, "row": 0}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v5_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 5, "col": 3, "row": 0}},
    })

    # Row 5: Revenue vs Expenses chart + Margin trend
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v2_id,
        "width": 4,
        "options": {"position": {"autoHeight": True, "sizeX": 4, "sizeY": 10, "col": 0, "row": 5}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v3_id,
        "width": 2,
        "options": {"position": {"autoHeight": True, "sizeX": 2, "sizeY": 10, "col": 4, "row": 5}},
    })

    # Row 15: Monthly summary table
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v6_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 10, "col": 0, "row": 15}},
    })

    # Row 25: Detailed P&L table
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v1_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 14, "col": 0, "row": 25}},
    })
    sys.stderr.write("All widgets added.\n")

    # Publish dashboard with finance tag
    api_call("POST", f"/api/dashboards/{dash_id}", {
        "is_draft": False,
        "tags": ["finance", "jrny-report", "report:finance"],
    })
    sys.stderr.write("Dashboard published with report:finance tag.\n")

    # Output summary as JSON
    summary = {
        "q1_id": q1_id,
        "q2_id": q2_id,
        "q3_id": q3_id,
        "v1_id": v1_id,
        "v2_id": v2_id,
        "v3_id": v3_id,
        "v4_id": v4_id,
        "v5_id": v5_id,
        "v6_id": v6_id,
        "dash_id": dash_id,
        "dash_slug": dash_slug,
    }
    sys.stdout.write(json.dumps(summary))


if __name__ == "__main__":
    main()
