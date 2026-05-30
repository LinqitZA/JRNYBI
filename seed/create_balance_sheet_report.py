#!/usr/bin/env python3
"""Create Balance Sheet report via JRNYBI API."""
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
    result = api_call("GET", "/api/queries?q=Balance+Sheet&page_size=100")
    existing = [q for q in result.get("results", []) if "Balance Sheet" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} Balance Sheet queries already exist\n")
        for q in existing:
            sys.stderr.write(f"  - {q['name']} (id={q['id']})\n")
        return

    # ========================================================================
    # Query 1: Balance Sheet Detail - Hierarchical with running balances
    # ========================================================================
    q1_sql = """WITH balances AS (
  SELECT
    account_code,
    account_name,
    account_type,
    account_group,
    SUM(debit - credit) AS balance
  FROM reporting.v_general_ledger
  WHERE entry_date <= '{{ as_at_date }}'
    AND account_type IN ('asset', 'liability', 'equity')
  GROUP BY account_code, account_name, account_type, account_group
),
categorized AS (
  SELECT
    CASE account_type
      WHEN 'asset' THEN 'Assets'
      WHEN 'liability' THEN 'Liabilities'
      WHEN 'equity' THEN 'Equity'
    END AS section,
    COALESCE(account_group, INITCAP(account_type)) AS account_group,
    account_code,
    '    ' || account_name AS account_name,
    balance,
    account_type
  FROM balances
),
section_totals AS (
  SELECT
    section,
    SUM(balance) AS section_total
  FROM categorized
  GROUP BY section
)
SELECT
  c.section,
  c.account_group,
  c.account_code,
  c.account_name,
  c.balance,
  st.section_total
FROM categorized c
JOIN section_totals st ON st.section = c.section
ORDER BY
  CASE c.account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 WHEN 'equity' THEN 3 END,
  c.account_group,
  c.account_code"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Balance Sheet - Detail",
        "description": "Balance sheet showing assets, liabilities, and equity with account-level drill-down. Running balance calculated as sum of all transactions up to the as-at date.",
        "data_source_id": DS_ID,
        "query": q1_sql,
        "options": {
            "parameters": [
                {"name": "as_at_date", "title": "As At Date", "type": "date", "value": "2024-12-31"},
            ]
        },
        "tags": ["finance", "jrny-report"],
    })
    q1_id = q1["id"]
    sys.stderr.write(f"Query 1 (BS Detail) created: id={q1_id}\n")

    # ========================================================================
    # Query 2: Balance Sheet Summary KPIs
    # ========================================================================
    q2_sql = """WITH balances AS (
  SELECT account_type, account_group, SUM(debit - credit) AS balance
  FROM reporting.v_general_ledger
  WHERE entry_date <= '{{ as_at_date }}'
    AND account_type IN ('asset', 'liability', 'equity')
  GROUP BY account_type, account_group
)
SELECT
  SUM(CASE WHEN account_type = 'asset' THEN balance ELSE 0 END) AS total_assets,
  SUM(CASE WHEN account_type = 'liability' THEN balance ELSE 0 END) AS total_liabilities,
  SUM(CASE WHEN account_type = 'equity' THEN balance ELSE 0 END) AS total_equity,
  SUM(CASE WHEN account_type = 'liability' THEN balance ELSE 0 END)
    + SUM(CASE WHEN account_type = 'equity' THEN balance ELSE 0 END) AS liabilities_plus_equity,
  SUM(CASE WHEN account_type = 'asset' AND account_group ILIKE '%current%' AND account_group NOT ILIKE '%non%' THEN balance ELSE 0 END) AS current_assets,
  SUM(CASE WHEN account_type = 'liability' AND account_group ILIKE '%current%' AND account_group NOT ILIKE '%non%' THEN balance ELSE 0 END) AS current_liabilities,
  ROUND(
    SUM(CASE WHEN account_type = 'asset' AND account_group ILIKE '%current%' AND account_group NOT ILIKE '%non%' THEN balance ELSE 0 END)::NUMERIC
    / NULLIF(SUM(CASE WHEN account_type = 'liability' AND account_group ILIKE '%current%' AND account_group NOT ILIKE '%non%' THEN balance ELSE 0 END), 0), 2
  ) AS current_ratio,
  ROUND(
    SUM(CASE WHEN account_type = 'liability' THEN balance ELSE 0 END)::NUMERIC
    / NULLIF(SUM(CASE WHEN account_type = 'equity' THEN balance ELSE 0 END), 0), 2
  ) AS debt_to_equity
FROM balances"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Balance Sheet - KPIs",
        "description": "Key balance sheet metrics: total assets, total liabilities, total equity, current ratio, debt-to-equity ratio.",
        "data_source_id": DS_ID,
        "query": q2_sql,
        "options": {
            "parameters": [
                {"name": "as_at_date", "title": "As At Date", "type": "date", "value": "2024-12-31"},
            ]
        },
        "tags": ["finance", "jrny-report"],
    })
    q2_id = q2["id"]
    sys.stderr.write(f"Query 2 (BS KPIs) created: id={q2_id}\n")

    # ========================================================================
    # Query 3: Balance Sheet Composition (for pie charts)
    # ========================================================================
    q3_sql = """SELECT
  COALESCE(account_group, INITCAP(account_type)) AS category,
  account_type,
  SUM(debit - credit) AS total_balance
FROM reporting.v_general_ledger
WHERE entry_date <= '{{ as_at_date }}'
  AND account_type IN ('asset', 'liability', 'equity')
GROUP BY account_group, account_type
ORDER BY
  CASE account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 WHEN 'equity' THEN 3 END,
  account_group"""

    q3 = api_call("POST", "/api/queries", {
        "name": "Balance Sheet - Composition",
        "description": "Balance sheet breakdown by category for asset and liability composition charts.",
        "data_source_id": DS_ID,
        "query": q3_sql,
        "options": {
            "parameters": [
                {"name": "as_at_date", "title": "As At Date", "type": "date", "value": "2024-12-31"},
            ]
        },
        "tags": ["finance", "jrny-report"],
    })
    q3_id = q3["id"]
    sys.stderr.write(f"Query 3 (BS Composition) created: id={q3_id}\n")

    # ========================================================================
    # Visualizations
    # ========================================================================

    # V1: Detail Table
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Balance Sheet Detail",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 50,
            "columns": [
                {"name": "section", "title": "Section", "visible": True},
                {"name": "account_group", "title": "Category", "visible": True},
                {"name": "account_code", "title": "Code", "visible": True},
                {"name": "account_name", "title": "Account", "visible": True},
                {"name": "balance", "title": "Balance", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "section_total", "title": "Section Total", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
            ],
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Detail Table) created: id={v1_id}\n")

    # V2: Total Assets KPI Counter
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Total Assets",
        "type": "COUNTER",
        "options": {
            "counterLabel": "Total Assets",
            "counterColName": "total_assets",
            "rowNumber": 1,
            "stringDecimal": 0,
            "stringDecChar": ".",
            "stringThouSep": ",",
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Assets Counter) created: id={v2_id}\n")

    # V3: Total Liabilities KPI Counter
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Total Liabilities",
        "type": "COUNTER",
        "options": {
            "counterLabel": "Total Liabilities",
            "counterColName": "total_liabilities",
            "rowNumber": 1,
            "stringDecimal": 0,
            "stringDecChar": ".",
            "stringThouSep": ",",
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (Liabilities Counter) created: id={v3_id}\n")

    # V4: Total Equity KPI Counter
    v4 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Total Equity",
        "type": "COUNTER",
        "options": {
            "counterLabel": "Total Equity",
            "counterColName": "total_equity",
            "rowNumber": 1,
            "stringDecimal": 0,
            "stringDecChar": ".",
            "stringThouSep": ",",
        },
    })
    v4_id = v4["id"]
    sys.stderr.write(f"Vis 4 (Equity Counter) created: id={v4_id}\n")

    # V5: Asset Composition Pie Chart
    v5 = api_call("POST", "/api/visualizations", {
        "query_id": q3_id,
        "name": "Asset Composition",
        "type": "CHART",
        "options": {
            "globalSeriesType": "pie",
            "columnMapping": {
                "category": "x",
                "total_balance": "y",
            },
            "seriesOptions": {
                "total_balance": {"type": "pie", "name": "Balance"},
            },
            "legend": {"enabled": True},
            "series": {"stacking": None},
        },
    })
    v5_id = v5["id"]
    sys.stderr.write(f"Vis 5 (Asset Pie) created: id={v5_id}\n")

    # V6: Current Ratio KPI
    v6 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Current Ratio",
        "type": "COUNTER",
        "options": {
            "counterLabel": "Current Ratio",
            "counterColName": "current_ratio",
            "rowNumber": 1,
            "stringDecimal": 2,
            "stringDecChar": ".",
            "stringThouSep": ",",
            "stringSuffix": ":1",
        },
    })
    v6_id = v6["id"]
    sys.stderr.write(f"Vis 6 (Current Ratio) created: id={v6_id}\n")

    # ========================================================================
    # Create Dashboard
    # ========================================================================
    dash = api_call("POST", "/api/dashboards", {"name": "Balance Sheet"})
    dash_id = dash["id"]
    dash_slug = dash.get("slug", "")
    sys.stderr.write(f"Dashboard created: id={dash_id}, slug={dash_slug}\n")

    # ========================================================================
    # Add Widgets
    # ========================================================================
    # Row 0: KPI counters (3 across)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v2_id,
        "width": 2,
        "options": {"position": {"autoHeight": True, "sizeX": 2, "sizeY": 5, "col": 0, "row": 0}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v3_id,
        "width": 2,
        "options": {"position": {"autoHeight": True, "sizeX": 2, "sizeY": 5, "col": 2, "row": 0}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v4_id,
        "width": 2,
        "options": {"position": {"autoHeight": True, "sizeX": 2, "sizeY": 5, "col": 4, "row": 0}},
    })

    # Row 5: Pie chart + Current Ratio
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v5_id,
        "width": 4,
        "options": {"position": {"autoHeight": True, "sizeX": 4, "sizeY": 10, "col": 0, "row": 5}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v6_id,
        "width": 2,
        "options": {"position": {"autoHeight": True, "sizeX": 2, "sizeY": 5, "col": 4, "row": 5}},
    })

    # Row 15: Full detail table
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v1_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 14, "col": 0, "row": 15}},
    })
    sys.stderr.write("All widgets added.\n")

    # Publish dashboard
    api_call("POST", f"/api/dashboards/{dash_id}", {
        "is_draft": False,
        "tags": ["finance", "jrny-report", "report:finance"],
    })
    sys.stderr.write("Dashboard published with report:finance tag.\n")

    # Output summary
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
