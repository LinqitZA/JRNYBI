#!/usr/bin/env python3
"""Create Accounts Receivable Aging Detail report via JRNYBI API."""
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
    result = api_call("GET", "/api/queries?q=Accounts+Receivable&page_size=100")
    existing = [q for q in result.get("results", []) if "Receivable" in q["name"] and "Aging" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} AR Aging queries already exist\n")
        for q in existing:
            sys.stderr.write(f"  - {q['name']} (id={q['id']})\n")
        return

    # ========================================================================
    # Query 1: AR Aging Detail — Customer-level aging pivot table
    # ========================================================================
    q1_sql = """WITH invoice_aging AS (
  SELECT
    i.customer_id,
    i.customer_name,
    i.customer_email,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.invoice_total,
    i.invoice_balance,
    ('{{ as_at_date }}'::DATE - i.due_date) AS days_overdue,
    CASE
      WHEN i.due_date >= '{{ as_at_date }}'::DATE THEN 'Current'
      WHEN ('{{ as_at_date }}'::DATE - i.due_date) BETWEEN 1 AND 30 THEN '1-30 Days'
      WHEN ('{{ as_at_date }}'::DATE - i.due_date) BETWEEN 31 AND 60 THEN '31-60 Days'
      WHEN ('{{ as_at_date }}'::DATE - i.due_date) BETWEEN 61 AND 90 THEN '61-90 Days'
      ELSE '90+ Days'
    END AS aging_bucket
  FROM reporting.v_invoices i
  WHERE i.invoice_balance > 0
    AND i.invoice_status != 'paid'
),
customer_aging AS (
  SELECT
    ia.customer_id,
    ia.customer_name,
    ia.customer_email,
    SUM(ia.invoice_balance) AS total_outstanding,
    SUM(CASE WHEN ia.aging_bucket = 'Current'   THEN ia.invoice_balance ELSE 0 END) AS current_amount,
    SUM(CASE WHEN ia.aging_bucket = '1-30 Days'  THEN ia.invoice_balance ELSE 0 END) AS days_1_30,
    SUM(CASE WHEN ia.aging_bucket = '31-60 Days' THEN ia.invoice_balance ELSE 0 END) AS days_31_60,
    SUM(CASE WHEN ia.aging_bucket = '61-90 Days' THEN ia.invoice_balance ELSE 0 END) AS days_61_90,
    SUM(CASE WHEN ia.aging_bucket = '90+ Days'   THEN ia.invoice_balance ELSE 0 END) AS days_90_plus,
    COUNT(DISTINCT ia.invoice_number) AS open_invoices
  FROM invoice_aging ia
  GROUP BY ia.customer_id, ia.customer_name, ia.customer_email
),
last_payments AS (
  SELECT DISTINCT ON (customer_id)
    customer_id,
    last_payment_date,
    total_payment_amount AS last_payment_amount
  FROM reporting.v_payment_compliance
  WHERE last_payment_date IS NOT NULL
    AND last_payment_date <= '{{ as_at_date }}'::DATE
  ORDER BY customer_id, last_payment_date DESC
)
SELECT
  ca.customer_name,
  ca.customer_email,
  ca.total_outstanding,
  ca.current_amount,
  ca.days_1_30,
  ca.days_31_60,
  ca.days_61_90,
  ca.days_90_plus,
  ca.open_invoices,
  lp.last_payment_date,
  lp.last_payment_amount
FROM customer_aging ca
LEFT JOIN last_payments lp ON lp.customer_id = ca.customer_id
ORDER BY ca.total_outstanding DESC"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Accounts Receivable Aging - Customer Detail",
        "description": "Customer-level AR aging with contact info, credit limit utilization, aging buckets (Current, 1-30, 31-60, 61-90, 90+ days), and last payment details.",
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
    sys.stderr.write(f"Query 1 (AR Detail) created: id={q1_id}\n")

    # ========================================================================
    # Query 2: AR Aging Summary (for pie chart and KPIs)
    # ========================================================================
    q2_sql = """SELECT
  aging_bucket,
  SUM(invoice_balance) AS bucket_total,
  COUNT(DISTINCT invoice_number) AS invoice_count,
  CASE aging_bucket
    WHEN 'Current'   THEN 1
    WHEN '1-30 Days'  THEN 2
    WHEN '31-60 Days' THEN 3
    WHEN '61-90 Days' THEN 4
    WHEN '90+ Days'   THEN 5
  END AS sort_order
FROM (
  SELECT
    i.invoice_number,
    i.invoice_balance,
    CASE
      WHEN i.due_date >= '{{ as_at_date }}'::DATE THEN 'Current'
      WHEN ('{{ as_at_date }}'::DATE - i.due_date) BETWEEN 1 AND 30 THEN '1-30 Days'
      WHEN ('{{ as_at_date }}'::DATE - i.due_date) BETWEEN 31 AND 60 THEN '31-60 Days'
      WHEN ('{{ as_at_date }}'::DATE - i.due_date) BETWEEN 61 AND 90 THEN '61-90 Days'
      ELSE '90+ Days'
    END AS aging_bucket
  FROM reporting.v_invoices i
  WHERE i.invoice_balance > 0
    AND i.invoice_status != 'paid'
) sub
GROUP BY aging_bucket
ORDER BY sort_order"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Accounts Receivable Aging - Summary",
        "description": "AR aging summary by bucket with totals and counts for pie chart visualization.",
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
    sys.stderr.write(f"Query 2 (AR Summary) created: id={q2_id}\n")

    # ========================================================================
    # Query 3: AR KPIs
    # ========================================================================
    q3_sql = """SELECT
  SUM(invoice_balance) AS total_ar,
  SUM(CASE WHEN due_date < '{{ as_at_date }}'::DATE THEN invoice_balance ELSE 0 END) AS overdue_amount,
  ROUND(100.0 * SUM(CASE WHEN due_date < '{{ as_at_date }}'::DATE THEN invoice_balance ELSE 0 END)
    / NULLIF(SUM(invoice_balance), 0), 1) AS pct_overdue,
  COUNT(DISTINCT invoice_id) AS total_open_invoices,
  COUNT(DISTINCT customer_id) AS customers_with_ar
FROM reporting.v_invoices
WHERE invoice_balance > 0
  AND invoice_status != 'paid'"""

    q3 = api_call("POST", "/api/queries", {
        "name": "Accounts Receivable Aging - KPIs",
        "description": "Key AR metrics: total AR, overdue amount, % overdue, open invoice count.",
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
    sys.stderr.write(f"Query 3 (AR KPIs) created: id={q3_id}\n")

    # ========================================================================
    # Visualizations
    # ========================================================================

    # Feature #207 — conditional formatting per aging bucket. Buckets get
    # progressively more alarming colors so an overdue customer sticks out.
    # Rules are evaluated top-to-bottom, first match wins (so we only need a
    # single "any positive value" rule per bucket).
    overdue_rules_30 = [{"type": "comparison", "op": "gt", "value": 0,
                         "bg": "#fef3c7", "icon": "⚠"}]
    overdue_rules_60 = [{"type": "comparison", "op": "gt", "value": 0,
                         "bg": "#fed7aa", "icon": "⚠"}]
    overdue_rules_90 = [{"type": "comparison", "op": "gt", "value": 0,
                         "bg": "#fca5a5", "icon": "⚠"}]
    overdue_rules_90plus = [{"type": "comparison", "op": "gt", "value": 0,
                             "bg": "#dc2626", "fg": "#ffffff", "icon": "🚨",
                             "fontWeight": "bold"}]
    total_rules = [
        {"type": "color-scale", "minColor": "#fef9c3", "maxColor": "#dc2626"},
    ]

    # V1: Customer Aging Pivot Table
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Customer Aging Detail",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 25,
            "columns": [
                {"name": "customer_name", "title": "Customer", "visible": True},
                {"name": "customer_email", "title": "Email", "visible": True},
                {"name": "total_outstanding", "title": "Total Outstanding", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right",
                 "conditionalFormatting": total_rules},
                {"name": "current_amount", "title": "Current", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "days_1_30", "title": "1-30 Days", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right",
                 "conditionalFormatting": overdue_rules_30},
                {"name": "days_31_60", "title": "31-60 Days", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right",
                 "conditionalFormatting": overdue_rules_60},
                {"name": "days_61_90", "title": "61-90 Days", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right",
                 "conditionalFormatting": overdue_rules_90},
                {"name": "days_90_plus", "title": "90+ Days", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right",
                 "conditionalFormatting": overdue_rules_90plus},
                {"name": "open_invoices", "title": "# Invoices", "visible": True, "alignContent": "right"},
                {"name": "last_payment_date", "title": "Last Payment", "visible": True,
                 "displayAs": "datetime", "dateTimeFormat": "DD/MM/YYYY"},
                {"name": "last_payment_amount", "title": "Last Pmt Amount", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
            ],
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Customer Table) created: id={v1_id}\n")

    # V2: Aging Pie Chart
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Aging Buckets",
        "type": "CHART",
        "options": {
            "globalSeriesType": "pie",
            "columnMapping": {
                "aging_bucket": "x",
                "bucket_total": "y",
            },
            "seriesOptions": {
                "bucket_total": {"type": "pie", "name": "Amount"},
            },
            "legend": {"enabled": True},
            "series": {"stacking": None},
            "colors": {
                "Current": "#16a34a",
                "1-30 Days": "#f59e0b",
                "31-60 Days": "#f97316",
                "61-90 Days": "#ef4444",
                "90+ Days": "#dc2626",
            },
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Aging Pie) created: id={v2_id}\n")

    # V3: Total AR Counter
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q3_id,
        "name": "Total AR",
        "type": "COUNTER",
        "options": {
            "counterLabel": "Total Accounts Receivable",
            "counterColName": "total_ar",
            "rowNumber": 1,
            "stringDecimal": 0,
            "stringDecChar": ".",
            "stringThouSep": ",",
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (Total AR Counter) created: id={v3_id}\n")

    # V4: Overdue Amount Counter
    v4 = api_call("POST", "/api/visualizations", {
        "query_id": q3_id,
        "name": "Overdue Amount",
        "type": "COUNTER",
        "options": {
            "counterLabel": "Overdue Amount",
            "counterColName": "overdue_amount",
            "rowNumber": 1,
            "targetRowNumber": 1,
            "targetColName": "total_ar",
            "stringDecimal": 0,
            "stringDecChar": ".",
            "stringThouSep": ",",
            "formatTargetValue": True,
        },
    })
    v4_id = v4["id"]
    sys.stderr.write(f"Vis 4 (Overdue Counter) created: id={v4_id}\n")

    # V5: % Overdue Counter
    v5 = api_call("POST", "/api/visualizations", {
        "query_id": q3_id,
        "name": "% Overdue",
        "type": "COUNTER",
        "options": {
            "counterLabel": "% Overdue",
            "counterColName": "pct_overdue",
            "rowNumber": 1,
            "stringSuffix": "%",
            "stringDecimal": 1,
            "stringDecChar": ".",
            "stringThouSep": ",",
        },
    })
    v5_id = v5["id"]
    sys.stderr.write(f"Vis 5 (% Overdue Counter) created: id={v5_id}\n")

    # V6: Aging Summary Table
    v6 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Aging Summary Table",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 10,
            "columns": [
                {"name": "aging_bucket", "title": "Aging Bucket", "visible": True},
                {"name": "bucket_total", "title": "Amount", "visible": True,
                 "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "invoice_count", "title": "Invoices", "visible": True, "alignContent": "right"},
                {"name": "sort_order", "title": "Sort", "visible": False},
            ],
        },
    })
    v6_id = v6["id"]
    sys.stderr.write(f"Vis 6 (Summary Table) created: id={v6_id}\n")

    # ========================================================================
    # Create Dashboard
    # ========================================================================
    dash = api_call("POST", "/api/dashboards", {"name": "Accounts Receivable Aging"})
    dash_id = dash["id"]
    dash_slug = dash.get("slug", "")
    sys.stderr.write(f"Dashboard created: id={dash_id}, slug={dash_slug}\n")

    # ========================================================================
    # Add Widgets
    # ========================================================================
    # Row 0: KPI counters (3 across)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v3_id,
        "width": 2,
        "options": {"position": {"autoHeight": True, "sizeX": 2, "sizeY": 5, "col": 0, "row": 0}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v4_id,
        "width": 2,
        "options": {"position": {"autoHeight": True, "sizeX": 2, "sizeY": 5, "col": 2, "row": 0}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v5_id,
        "width": 2,
        "options": {"position": {"autoHeight": True, "sizeX": 2, "sizeY": 5, "col": 4, "row": 0}},
    })

    # Row 5: Pie chart + Summary table
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v2_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 10, "col": 0, "row": 5}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v6_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 10, "col": 3, "row": 5}},
    })

    # Row 15: Full detail pivot table
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
