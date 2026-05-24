#!/usr/bin/env python3
"""
JRNY Pre-Built Reports Seed Script

Creates all pre-built report queries, visualizations, and dashboards
using the JRNYBI REST API. Run this as part of the first-boot sequence.

Reports created:
  Sales:
    - Sales Summary (monthly revenue line/bar chart + order count)
    - Customer Revenue Ranking (bar chart + sortable table)
    - Product Performance (top/bottom performers charts)

  Finance:
    - Outstanding Invoices Aging (aging buckets table + pie chart)
    - Cash Flow Summary (inflows/outflows line chart + transaction table)
    - Trial Balance (debit/credit columns grouped by account)
    - Credit Note Summary (trend chart, CN rate %, reason pie, customer detail table)

  Inventory & Procurement:
    - Inventory Valuation (table + KPI widgets: total value, item count)
    - Stock Below Reorder Point (alert table)
    - Purchase Order Status (PO pipeline by status)
    - Supplier Spend Analysis (bar chart + detail table)

All reports use parameterized queries with:
    - {{start_date}} / {{end_date}} for date range filtering
    - {{status}} for status/category filtering (where applicable)

Usage:
    python seed/jrny_reports.py [--base-url URL] [--api-key KEY] [--data-source-id ID]

Environment variables (alternative to CLI args):
    JRNYBI_BASE_URL       (default: http://localhost:5001)
    JRNYBI_ADMIN_API_KEY  (required if --api-key not provided)
    JRNYBI_DATA_SOURCE_ID (default: auto-detect first jrny_pg source)
"""

import argparse
import json
import logging
import os
import sys
import time

try:
    import requests
except ImportError:
    # When running inside Docker container, requests may not be available.
    # Fall back to urllib for basic HTTP.
    requests = None

if requests is None:
    import urllib.request
    import urllib.error
    import urllib.parse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HTTP helper (works with or without 'requests' library)
# ---------------------------------------------------------------------------
class APIClient:
    """Simple HTTP client for the JRNYBI REST API."""

    def __init__(self, base_url, api_key):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Key {api_key}",
            "Content-Type": "application/json",
        }

    def _url(self, path):
        return f"{self.base_url}{path}"

    def get_text(self, path):
        """GET returning raw text (for non-JSON endpoints like /ping)."""
        url = self._url(path)
        if requests:
            resp = requests.get(url, headers=self.headers, timeout=30)
            resp.raise_for_status()
            return resp.text
        else:
            req = urllib.request.Request(url, headers=self.headers, method="GET")
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode()

    def get(self, path):
        url = self._url(path)
        if requests:
            resp = requests.get(url, headers=self.headers, timeout=30)
            resp.raise_for_status()
            return resp.json()
        else:
            req = urllib.request.Request(url, headers=self.headers, method="GET")
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())

    def post(self, path, data):
        url = self._url(path)
        body = json.dumps(data).encode("utf-8")
        if requests:
            resp = requests.post(url, headers=self.headers, json=data, timeout=30)
            resp.raise_for_status()
            return resp.json()
        else:
            req = urllib.request.Request(url, data=body, headers=self.headers, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())


# ---------------------------------------------------------------------------
# Query definitions
# ---------------------------------------------------------------------------

DATE_PARAMS = [
    {
        "name": "start_date",
        "title": "Start Date",
        "type": "date",
        "value": "2024-01-01",
    },
    {
        "name": "end_date",
        "title": "End Date",
        "type": "date",
        "value": "2024-12-31",
    },
]

STATUS_PARAM = {
    "name": "status",
    "title": "Status",
    "type": "text",
    "value": "",
}


QUERIES = {
    # ---- Sales ----
    "sales_summary": {
        "name": "Sales Summary - Monthly Revenue",
        "description": "Monthly revenue totals and order counts for the selected date range.",
        "query": """
SELECT
    DATE_TRUNC('month', order_date)::date AS month,
    COUNT(*) AS order_count,
    SUM(total_amount) AS revenue,
    SUM(total_amount) / NULLIF(COUNT(*), 0) AS avg_order_value
FROM reporting.v_sales_orders
WHERE order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY month;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["sales", "jrny-report"],
    },
    "customer_revenue_ranking": {
        "name": "Customer Revenue Ranking",
        "description": "Top customers ranked by total revenue in the selected period.",
        "query": """
SELECT
    c.customer_name,
    c.customer_code,
    COUNT(DISTINCT so.id) AS order_count,
    SUM(so.total_amount) AS total_revenue,
    MAX(so.order_date) AS last_order_date
FROM reporting.v_sales_orders so
JOIN reporting.v_customers c ON c.id = so.customer_id
WHERE so.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY c.customer_name, c.customer_code
ORDER BY total_revenue DESC
LIMIT 50;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["sales", "jrny-report"],
    },
    "product_performance": {
        "name": "Product Performance",
        "description": "Product sales performance showing top and bottom performers.",
        "query": """
SELECT
    p.product_name,
    p.product_code,
    p.category,
    SUM(sol.quantity) AS total_qty_sold,
    SUM(sol.line_total) AS total_revenue,
    COUNT(DISTINCT sol.sales_order_id) AS num_orders
FROM reporting.v_sales_orders so
JOIN reporting.v_sales_orders sol ON sol.sales_order_id = so.id
JOIN reporting.v_product_catalogue p ON p.id = sol.product_id
WHERE so.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY p.product_name, p.product_code, p.category
ORDER BY total_revenue DESC;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["sales", "jrny-report"],
    },
    # ---- Finance ----
    "outstanding_invoices_aging": {
        "name": "Outstanding Invoices Aging",
        "description": "Invoice aging analysis with aging buckets (current, 30, 60, 90+ days).",
        "query": """
SELECT
    c.customer_name,
    inv.invoice_number,
    inv.invoice_date,
    inv.due_date,
    inv.total_amount,
    inv.balance_due,
    CASE
        WHEN CURRENT_DATE - inv.due_date <= 0 THEN 'Current'
        WHEN CURRENT_DATE - inv.due_date BETWEEN 1 AND 30 THEN '1-30 Days'
        WHEN CURRENT_DATE - inv.due_date BETWEEN 31 AND 60 THEN '31-60 Days'
        WHEN CURRENT_DATE - inv.due_date BETWEEN 61 AND 90 THEN '61-90 Days'
        ELSE '90+ Days'
    END AS aging_bucket
FROM reporting.v_invoices inv
JOIN reporting.v_customers c ON c.id = inv.customer_id
WHERE inv.status = 'outstanding'
ORDER BY inv.due_date ASC;
""".strip(),
        "options": {"parameters": []},
        "tags": ["finance", "jrny-report"],
    },
    "cash_flow_summary": {
        "name": "Cash Flow Summary",
        "description": "Cash inflows and outflows over time with running balance.",
        "query": """
SELECT
    DATE_TRUNC('month', transaction_date)::date AS month,
    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS inflows,
    SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS outflows,
    SUM(amount) AS net_cash_flow
FROM reporting.v_cashbook_transactions
WHERE transaction_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY DATE_TRUNC('month', transaction_date)
ORDER BY month;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["finance", "jrny-report"],
    },
    "trial_balance": {
        "name": "Trial Balance",
        "description": "Trial balance report with debit and credit columns grouped by account.",
        "query": """
SELECT
    gl.account_code,
    gl.account_name,
    gl.account_type,
    SUM(CASE WHEN gl.amount >= 0 THEN gl.amount ELSE 0 END) AS debit,
    SUM(CASE WHEN gl.amount < 0 THEN ABS(gl.amount) ELSE 0 END) AS credit,
    SUM(gl.amount) AS balance
FROM reporting.v_general_ledger gl
WHERE gl.posting_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY gl.account_code, gl.account_name, gl.account_type
ORDER BY gl.account_code;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["finance", "jrny-report"],
    },
    # ---- Inventory & Procurement ----
    "inventory_valuation": {
        "name": "Inventory Valuation",
        "description": "Current inventory levels with valuation (cost and retail).",
        "query": """
SELECT
    il.product_code,
    il.product_name,
    il.warehouse_name,
    il.quantity_on_hand,
    il.unit_cost,
    il.quantity_on_hand * il.unit_cost AS total_value,
    il.reorder_point,
    CASE
        WHEN il.quantity_on_hand <= il.reorder_point THEN 'Low Stock'
        ELSE 'OK'
    END AS stock_status
FROM reporting.v_inventory_levels il
WHERE il.quantity_on_hand > 0
ORDER BY total_value DESC;
""".strip(),
        "options": {"parameters": []},
        "tags": ["inventory", "jrny-report"],
    },
    "stock_below_reorder": {
        "name": "Stock Below Reorder Point",
        "description": "Items where current stock is at or below the reorder point.",
        "query": """
SELECT
    il.product_code,
    il.product_name,
    il.warehouse_name,
    il.quantity_on_hand,
    il.reorder_point,
    il.reorder_point - il.quantity_on_hand AS shortfall,
    il.unit_cost,
    (il.reorder_point - il.quantity_on_hand) * il.unit_cost AS reorder_value
FROM reporting.v_inventory_levels il
WHERE il.quantity_on_hand <= il.reorder_point
ORDER BY shortfall DESC;
""".strip(),
        "options": {"parameters": []},
        "tags": ["inventory", "jrny-report"],
    },
    "purchase_order_status": {
        "name": "Purchase Order Status",
        "description": "Purchase order pipeline grouped by status.",
        "query": """
SELECT
    po.status,
    COUNT(*) AS po_count,
    SUM(po.total_amount) AS total_value,
    MIN(po.order_date) AS earliest_order,
    MAX(po.order_date) AS latest_order
FROM reporting.v_purchase_orders po
WHERE po.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ status }}' = '' OR po.status = '{{ status }}')
GROUP BY po.status
ORDER BY po.status;
""".strip(),
        "options": {"parameters": DATE_PARAMS + [STATUS_PARAM]},
        "tags": ["procurement", "jrny-report"],
    },
    "supplier_spend_analysis": {
        "name": "Supplier Spend Analysis",
        "description": "Supplier spending ranked by total purchase value.",
        "query": """
SELECT
    s.supplier_name,
    s.supplier_code,
    COUNT(DISTINCT po.id) AS po_count,
    SUM(po.total_amount) AS total_spend,
    AVG(po.total_amount) AS avg_po_value,
    MAX(po.order_date) AS last_order_date
FROM reporting.v_purchase_orders po
JOIN reporting.v_suppliers s ON s.id = po.supplier_id
WHERE po.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY s.supplier_name, s.supplier_code
ORDER BY total_spend DESC
LIMIT 50;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["procurement", "jrny-report"],
    },
    # ---- Finance: GL Account Activity ----
    "gl_account_activity": {
        "name": "GL Account Activity",
        "description": "Transaction-level detail for any GL account in a date range. Shows debit, credit, and running balance for drill-down investigation.",
        "query": """
WITH opening AS (
    SELECT
        COALESCE(SUM(gl.debit - gl.credit), 0) AS opening_balance
    FROM reporting.v_general_ledger gl
    WHERE gl.account_code = '{{ account_code }}'
      AND gl.posting_date < '{{ start_date }}'
),
activity AS (
    SELECT
        gl.posting_date,
        gl.account_code,
        gl.account_name,
        gl.account_type,
        gl.debit,
        gl.credit,
        gl.net_amount
    FROM reporting.v_general_ledger gl
    WHERE gl.account_code = '{{ account_code }}'
      AND gl.posting_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
)
SELECT
    a.posting_date,
    a.account_code,
    a.account_name,
    a.account_type,
    a.debit,
    a.credit,
    a.net_amount,
    (SELECT opening_balance FROM opening)
        + SUM(a.net_amount) OVER (ORDER BY a.posting_date, a.debit DESC ROWS UNBOUNDED PRECEDING)
        AS running_balance
FROM activity a
ORDER BY a.posting_date, a.debit DESC;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "account_code",
                    "title": "Account Code",
                    "type": "text",
                    "value": "4000",
                },
                {
                    "name": "start_date",
                    "title": "Start Date",
                    "type": "date",
                    "value": "2024-01-01",
                },
                {
                    "name": "end_date",
                    "title": "End Date",
                    "type": "date",
                    "value": "2024-12-31",
                },
            ]
        },
        "tags": ["finance", "jrny-report"],
    },
    "gl_account_summary": {
        "name": "GL Account Activity - Summary",
        "description": "Opening balance, total debits, credits, and closing balance for a GL account in a date range.",
        "query": """
SELECT
    '{{ account_code }}' AS account_code,
    coa.account_name,
    coa.account_type,
    COALESCE(ob.opening_balance, 0) AS opening_balance,
    COALESCE(act.total_debit, 0) AS total_debit,
    COALESCE(act.total_credit, 0) AS total_credit,
    COALESCE(act.total_net, 0) AS period_movement,
    COALESCE(ob.opening_balance, 0) + COALESCE(act.total_net, 0) AS closing_balance,
    COALESCE(act.transaction_count, 0) AS transaction_count
FROM (
    SELECT account_name, account_type
    FROM reporting.v_general_ledger
    WHERE account_code = '{{ account_code }}'
    LIMIT 1
) coa
LEFT JOIN LATERAL (
    SELECT SUM(debit - credit) AS opening_balance
    FROM reporting.v_general_ledger
    WHERE account_code = '{{ account_code }}'
      AND posting_date < '{{ start_date }}'
) ob ON TRUE
LEFT JOIN LATERAL (
    SELECT
        SUM(debit) AS total_debit,
        SUM(credit) AS total_credit,
        SUM(debit - credit) AS total_net,
        COUNT(*) AS transaction_count
    FROM reporting.v_general_ledger
    WHERE account_code = '{{ account_code }}'
      AND posting_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
) act ON TRUE;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "account_code",
                    "title": "Account Code",
                    "type": "text",
                    "value": "4000",
                },
                {
                    "name": "start_date",
                    "title": "Start Date",
                    "type": "date",
                    "value": "2024-01-01",
                },
                {
                    "name": "end_date",
                    "title": "End Date",
                    "type": "date",
                    "value": "2024-12-31",
                },
            ]
        },
        "tags": ["finance", "jrny-report"],
    },
    # ---- Finance: Accounts Payable Aging ----
    "ap_aging": {
        "name": "Accounts Payable Aging",
        "description": "Vendor-level aging showing amounts owed, payment terms, overdue amounts, and upcoming payments. Critical for cash flow planning and vendor relationship management.",
        "query": """
SELECT
    ap.supplier_name,
    ap.bill_number,
    ap.bill_date,
    ap.due_date,
    ap.total_amount,
    ap.amount_paid,
    ap.balance_due,
    ap.status,
    ap.aging_bucket,
    ap.days_overdue
FROM reporting.v_ap_aging ap
WHERE ap.due_date <= '{{ as_at_date }}'
   OR ap.status = 'open'
ORDER BY ap.days_overdue DESC, ap.balance_due DESC;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "as_at_date",
                    "title": "As-At Date",
                    "type": "date",
                    "value": "2024-12-31",
                },
            ]
        },
        "tags": ["finance", "jrny-report"],
    },
    # ---- Finance: Credit Note Summary ----
    "credit_note_trend": {
        "name": "Credit Note Summary - Trend",
        "description": "Credit notes aggregated by period and reason, with credit note rate as percentage of gross revenue.",
        "query": """
SELECT
    cn.credit_note_month                             AS month,
    cn.reason,
    COUNT(DISTINCT cn.id)                            AS credit_note_count,
    SUM(cn.line_total)                               AS credit_note_value,
    COALESCE(rev.gross_revenue, 0)                   AS gross_revenue,
    CASE
        WHEN COALESCE(rev.gross_revenue, 0) > 0
        THEN ROUND(100.0 * SUM(cn.line_total) / rev.gross_revenue, 2)
        ELSE 0
    END                                              AS cn_rate_pct
FROM reporting.v_credit_note_summary cn
LEFT JOIN (
    SELECT
        DATE_TRUNC('month', order_date)::DATE AS month,
        SUM(total_amount)                     AS gross_revenue
    FROM reporting.v_sales_orders
    WHERE order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY DATE_TRUNC('month', order_date)
) rev ON rev.month = cn.credit_note_month
WHERE cn.credit_note_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY cn.credit_note_month, cn.reason, rev.gross_revenue
ORDER BY cn.credit_note_month, cn.reason;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["finance", "jrny-report"],
    },
    "credit_note_detail": {
        "name": "Credit Note Summary - Customer Detail",
        "description": "Credit notes grouped by customer, reason, and product category with line-level detail.",
        "query": """
SELECT
    cn.customer_name,
    cn.credit_note_number,
    cn.credit_note_date,
    cn.reason,
    cn.product_category,
    cn.product_name,
    cn.quantity,
    cn.unit_price,
    cn.line_total,
    cn.original_invoice_number,
    cn.status
FROM reporting.v_credit_note_summary cn
WHERE cn.credit_note_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
ORDER BY cn.credit_note_date DESC, cn.customer_name;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["finance", "jrny-report"],
    },
    # ---- Finance: Payment Terms Compliance ----
    "payment_terms_histogram": {
        "name": "Payment Terms Compliance - Days to Pay",
        "description": "Distribution of days-to-pay across all paid invoices, with on-time vs late breakdown.",
        "query": """
SELECT
    CASE
        WHEN ptc.days_to_pay <= 7 THEN '0-7 days'
        WHEN ptc.days_to_pay <= 14 THEN '8-14 days'
        WHEN ptc.days_to_pay <= 21 THEN '15-21 days'
        WHEN ptc.days_to_pay <= 30 THEN '22-30 days'
        WHEN ptc.days_to_pay <= 45 THEN '31-45 days'
        WHEN ptc.days_to_pay <= 60 THEN '46-60 days'
        WHEN ptc.days_to_pay <= 90 THEN '61-90 days'
        ELSE '90+ days'
    END                                        AS days_to_pay_bucket,
    ptc.payment_status,
    COUNT(*)                                   AS invoice_count,
    SUM(ptc.total_amount)                      AS total_value,
    ROUND(AVG(ptc.days_to_pay), 1)             AS avg_days_to_pay
FROM reporting.v_payment_terms_compliance ptc
WHERE ptc.invoice_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ptc.payment_status != 'Unpaid'
GROUP BY 1, ptc.payment_status
ORDER BY
    CASE
        WHEN days_to_pay_bucket = '0-7 days' THEN 1
        WHEN days_to_pay_bucket = '8-14 days' THEN 2
        WHEN days_to_pay_bucket = '15-21 days' THEN 3
        WHEN days_to_pay_bucket = '22-30 days' THEN 4
        WHEN days_to_pay_bucket = '31-45 days' THEN 5
        WHEN days_to_pay_bucket = '46-60 days' THEN 6
        WHEN days_to_pay_bucket = '61-90 days' THEN 7
        ELSE 8
    END;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["finance", "jrny-report"],
    },
    "payment_terms_customer": {
        "name": "Payment Terms Compliance - By Customer",
        "description": "Customer-level payment compliance showing average days-to-pay, on-time percentage, and outstanding balance.",
        "query": """
SELECT
    ptc.customer_name,
    COUNT(DISTINCT ptc.invoice_id)                                           AS total_invoices,
    COUNT(DISTINCT CASE WHEN ptc.payment_status = 'On Time' THEN ptc.invoice_id END)  AS on_time_count,
    COUNT(DISTINCT CASE WHEN ptc.payment_status = 'Late' THEN ptc.invoice_id END)     AS late_count,
    COUNT(DISTINCT CASE WHEN ptc.payment_status = 'Unpaid' THEN ptc.invoice_id END)   AS unpaid_count,
    ROUND(
        100.0 * COUNT(DISTINCT CASE WHEN ptc.payment_status = 'On Time' THEN ptc.invoice_id END)
        / NULLIF(COUNT(DISTINCT CASE WHEN ptc.payment_status != 'Unpaid' THEN ptc.invoice_id END), 0),
        1
    )                                                                        AS on_time_pct,
    ROUND(AVG(ptc.days_to_pay), 1)                                           AS avg_days_to_pay,
    ROUND(AVG(ptc.days_late), 1)                                             AS avg_days_late,
    SUM(ptc.total_amount)                                                    AS total_invoiced,
    SUM(ptc.balance_due)                                                     AS total_outstanding
FROM reporting.v_payment_terms_compliance ptc
WHERE ptc.invoice_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY ptc.customer_name
ORDER BY on_time_pct ASC NULLS LAST, avg_days_to_pay DESC NULLS LAST;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["finance", "jrny-report"],
    },
    # ---- Finance: Revenue by Dimension ----
    "revenue_by_dimension": {
        "name": "Revenue by Dimension",
        "description": "Revenue from GL entries sliced by dimension type (cost centre, department, project, territory) with contribution percentage.",
        "query": """
SELECT
    rd.dimension_type,
    rd.dimension_name,
    rd.dimension_code,
    SUM(rd.revenue_amount)                                               AS revenue,
    ROUND(
        100.0 * SUM(rd.revenue_amount)
        / NULLIF(SUM(SUM(rd.revenue_amount)) OVER (), 0),
        2
    )                                                                    AS pct_of_total,
    COUNT(DISTINCT rd.gl_entry_id)                                       AS entry_count
FROM reporting.v_revenue_by_dimension rd
WHERE rd.posting_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ dimension_type }}' = '' OR rd.dimension_type = '{{ dimension_type }}')
GROUP BY rd.dimension_type, rd.dimension_name, rd.dimension_code
ORDER BY revenue DESC;
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "dimension_type",
                    "title": "Dimension Type",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["finance", "jrny-report"],
    },
    "revenue_dimension_trend": {
        "name": "Revenue by Dimension - Trend",
        "description": "Monthly revenue trend broken down by dimension member for time-series analysis.",
        "query": """
SELECT
    rd.posting_month                                       AS month,
    rd.dimension_name,
    SUM(rd.revenue_amount)                                 AS revenue
FROM reporting.v_revenue_by_dimension rd
WHERE rd.posting_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ dimension_type }}' = '' OR rd.dimension_type = '{{ dimension_type }}')
GROUP BY rd.posting_month, rd.dimension_name
ORDER BY rd.posting_month, rd.dimension_name;
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "dimension_type",
                    "title": "Dimension Type",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["finance", "jrny-report"],
    },
    # ---- Finance: Budget vs Actual Variance ----
    "budget_variance": {
        "name": "Budget vs Actual Variance",
        "description": "Period-by-period comparison of budgeted amounts vs actual GL postings with variance calculation. Supports cost control and financial planning.",
        "query": """
SELECT
    bv.account_code,
    bv.account_name,
    bv.account_type,
    bv.account_category,
    bv.fiscal_year,
    bv.fiscal_month,
    bv.budget_amount,
    bv.actual_amount,
    bv.variance_amount,
    bv.variance_pct,
    bv.budget_status
FROM reporting.v_budget_variance bv
WHERE bv.fiscal_year = {{ fiscal_year }}
  AND ('{{ department }}' = '' OR bv.account_category = '{{ department }}')
  AND ({{ fiscal_period }} = 0 OR bv.fiscal_month = {{ fiscal_period }})
ORDER BY bv.account_type, bv.account_code, bv.fiscal_month;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "fiscal_year",
                    "title": "Fiscal Year",
                    "type": "number",
                    "value": "2024",
                },
                {
                    "name": "fiscal_period",
                    "title": "Period (0=All)",
                    "type": "number",
                    "value": "0",
                },
                {
                    "name": "department",
                    "title": "Department/Category",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["finance", "jrny-report"],
    },
    "budget_variance_summary": {
        "name": "Budget vs Actual Variance - Summary",
        "description": "Summary of budget vs actual variance grouped by account type/category.",
        "query": """
SELECT
    bv.account_type,
    bv.account_category,
    SUM(bv.budget_amount) AS total_budget,
    SUM(bv.actual_amount) AS total_actual,
    SUM(bv.variance_amount) AS total_variance,
    CASE
        WHEN SUM(bv.budget_amount) <> 0
            THEN ROUND(((SUM(bv.actual_amount) - SUM(bv.budget_amount)) / ABS(SUM(bv.budget_amount))) * 100, 2)
        ELSE 0
    END AS variance_pct,
    COUNT(*) FILTER (WHERE bv.budget_status = 'Over Budget') AS over_budget_count,
    COUNT(*) FILTER (WHERE bv.budget_status = 'Under Budget') AS under_budget_count,
    COUNT(*) FILTER (WHERE ABS(bv.variance_pct) > 10) AS significant_variances
FROM reporting.v_budget_variance bv
WHERE bv.fiscal_year = {{ fiscal_year }}
  AND ({{ fiscal_period }} = 0 OR bv.fiscal_month = {{ fiscal_period }})
GROUP BY bv.account_type, bv.account_category
ORDER BY bv.account_type, bv.account_category;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "fiscal_year",
                    "title": "Fiscal Year",
                    "type": "number",
                    "value": "2024",
                },
                {
                    "name": "fiscal_period",
                    "title": "Period (0=All)",
                    "type": "number",
                    "value": "0",
                },
            ]
        },
        "tags": ["finance", "jrny-report"],
    },
    "ap_aging_summary": {
        "name": "Accounts Payable Aging - Summary",
        "description": "Aging bucket summary for accounts payable with total outstanding per bucket.",
        "query": """
SELECT
    ap.aging_bucket,
    COUNT(*) AS bill_count,
    SUM(ap.balance_due) AS total_balance_due,
    SUM(ap.total_amount) AS total_invoiced,
    SUM(ap.amount_paid) AS total_paid,
    ROUND(AVG(ap.days_overdue), 0) AS avg_days_overdue
FROM reporting.v_ap_aging ap
WHERE ap.due_date <= '{{ as_at_date }}'
   OR ap.status = 'open'
GROUP BY ap.aging_bucket
ORDER BY
    CASE ap.aging_bucket
        WHEN 'Current' THEN 1
        WHEN '1-30 Days' THEN 2
        WHEN '31-60 Days' THEN 3
        WHEN '61-90 Days' THEN 4
        WHEN '90+ Days' THEN 5
    END;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "as_at_date",
                    "title": "As-At Date",
                    "type": "date",
                    "value": "2024-12-31",
                },
            ]
        },
        "tags": ["finance", "jrny-report"],
    },
    # ---- Finance: Tax/VAT Summary ----
    "vat_summary": {
        "name": "Tax/VAT Summary",
        "description": "VAT collected vs paid by tax code and period. Supports VAT return filing preparation with output tax, input tax, and net liability calculation.",
        "query": """
SELECT
    vs.tax_period                                         AS period,
    vs.tax_code,
    vs.tax_rate,
    SUM(CASE WHEN vs.vat_type = 'output' THEN vs.taxable_amount ELSE 0 END) AS output_taxable,
    SUM(CASE WHEN vs.vat_type = 'output' THEN vs.vat_amount ELSE 0 END)     AS output_vat,
    SUM(CASE WHEN vs.vat_type = 'input' THEN vs.taxable_amount ELSE 0 END)  AS input_taxable,
    SUM(CASE WHEN vs.vat_type = 'input' THEN vs.vat_amount ELSE 0 END)      AS input_vat,
    SUM(CASE WHEN vs.vat_type = 'output' THEN vs.vat_amount ELSE 0 END)
      - SUM(CASE WHEN vs.vat_type = 'input' THEN vs.vat_amount ELSE 0 END)  AS net_vat_payable,
    SUM(vs.line_count)                                                       AS total_lines
FROM reporting.v_vat_summary vs
WHERE vs.tax_period BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY vs.tax_period, vs.tax_code, vs.tax_rate
ORDER BY vs.tax_period, vs.tax_code;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["finance", "jrny-report"],
    },
    "vat_liability_trend": {
        "name": "Tax/VAT Summary - Monthly Liability Trend",
        "description": "Monthly VAT liability trend showing output VAT, input VAT, and net payable over time.",
        "query": """
SELECT
    vs.tax_period                                         AS month,
    SUM(CASE WHEN vs.vat_type = 'output' THEN vs.vat_amount ELSE 0 END) AS output_vat,
    SUM(CASE WHEN vs.vat_type = 'input' THEN vs.vat_amount ELSE 0 END)  AS input_vat,
    SUM(CASE WHEN vs.vat_type = 'output' THEN vs.vat_amount ELSE 0 END)
      - SUM(CASE WHEN vs.vat_type = 'input' THEN vs.vat_amount ELSE 0 END)  AS net_vat_payable
FROM reporting.v_vat_summary vs
WHERE vs.tax_period BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY vs.tax_period
ORDER BY vs.tax_period;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["finance", "jrny-report"],
    },
}


# ---------------------------------------------------------------------------
# Visualization definitions (keyed by query key)
# ---------------------------------------------------------------------------
# Redash visualization types: CHART, TABLE, COUNTER, PIVOT, MAP, WORD_CLOUD, etc.

VISUALIZATIONS = {
    "sales_summary": [
        {
            "name": "Monthly Revenue Chart",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "month": "x",
                    "revenue": "y",
                    "order_count": "y",
                },
                "seriesOptions": {
                    "revenue": {"type": "column", "yAxis": 0, "name": "Revenue"},
                    "order_count": {"type": "line", "yAxis": 1, "name": "Order Count"},
                },
                "yAxis": [
                    {"type": "linear", "title": {"text": "Revenue"}},
                    {"type": "linear", "title": {"text": "Orders"}, "opposite": True},
                ],
                "xAxis": {"type": "datetime", "labels": {"enabled": True}},
                "series": {"stacking": None},
                "sortX": True,
                "legend": {"enabled": True},
            },
        },
    ],
    "customer_revenue_ranking": [
        {
            "name": "Revenue by Customer (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "bar",
                "columnMapping": {
                    "customer_name": "x",
                    "total_revenue": "y",
                },
                "sortX": True,
                "legend": {"enabled": False},
                "xAxis": {"type": "category"},
                "yAxis": [{"type": "linear", "title": {"text": "Revenue"}}],
                "series": {"stacking": None},
            },
        },
        {
            "name": "Customer Revenue Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "customer_name", "title": "Customer", "visible": True},
                    {"name": "customer_code", "title": "Code", "visible": True},
                    {"name": "order_count", "title": "Orders", "visible": True, "alignContent": "right"},
                    {"name": "total_revenue", "title": "Total Revenue", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "last_order_date", "title": "Last Order", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                ],
            },
        },
    ],
    "product_performance": [
        {
            "name": "Product Revenue Chart",
            "type": "CHART",
            "options": {
                "globalSeriesType": "bar",
                "columnMapping": {
                    "product_name": "x",
                    "total_revenue": "y",
                },
                "sortX": True,
                "legend": {"enabled": False},
                "xAxis": {"type": "category"},
                "yAxis": [{"type": "linear", "title": {"text": "Revenue"}}],
                "series": {"stacking": None},
            },
        },
    ],
    "outstanding_invoices_aging": [
        {
            "name": "Aging Buckets (Pie)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "pie",
                "columnMapping": {
                    "aging_bucket": "x",
                    "balance_due": "y",
                },
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
        {
            "name": "Outstanding Invoices Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "customer_name", "title": "Customer", "visible": True},
                    {"name": "invoice_number", "title": "Invoice #", "visible": True},
                    {"name": "invoice_date", "title": "Invoice Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "due_date", "title": "Due Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "total_amount", "title": "Amount", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "balance_due", "title": "Balance Due", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "aging_bucket", "title": "Aging", "visible": True},
                ],
            },
        },
    ],
    "cash_flow_summary": [
        {
            "name": "Cash Flow Line Chart",
            "type": "CHART",
            "options": {
                "globalSeriesType": "line",
                "columnMapping": {
                    "month": "x",
                    "inflows": "y",
                    "outflows": "y",
                    "net_cash_flow": "y",
                },
                "seriesOptions": {
                    "inflows": {"type": "line", "yAxis": 0, "name": "Inflows", "color": "#2ecc71"},
                    "outflows": {"type": "line", "yAxis": 0, "name": "Outflows", "color": "#e74c3c"},
                    "net_cash_flow": {"type": "line", "yAxis": 0, "name": "Net Cash Flow", "color": "#2563eb"},
                },
                "xAxis": {"type": "datetime", "labels": {"enabled": True}},
                "yAxis": [{"type": "linear", "title": {"text": "Amount"}}],
                "sortX": True,
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
        {
            "name": "Cash Flow Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "month", "title": "Month", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM"},
                    {"name": "inflows", "title": "Inflows", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "outflows", "title": "Outflows", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "net_cash_flow", "title": "Net Cash Flow", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                ],
            },
        },
    ],
    "trial_balance": [
        {
            "name": "Trial Balance Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 50,
                "columns": [
                    {"name": "account_code", "title": "Account Code", "visible": True},
                    {"name": "account_name", "title": "Account Name", "visible": True},
                    {"name": "account_type", "title": "Type", "visible": True},
                    {"name": "debit", "title": "Debit", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "credit", "title": "Credit", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "balance", "title": "Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                ],
            },
        },
    ],
    "inventory_valuation": [
        {
            "name": "Inventory Valuation Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "product_code", "title": "Product Code", "visible": True},
                    {"name": "product_name", "title": "Product Name", "visible": True},
                    {"name": "warehouse_name", "title": "Warehouse", "visible": True},
                    {"name": "quantity_on_hand", "title": "Qty on Hand", "visible": True, "alignContent": "right"},
                    {"name": "unit_cost", "title": "Unit Cost", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_value", "title": "Total Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "stock_status", "title": "Status", "visible": True},
                ],
            },
        },
        {
            "name": "Total Inventory Value",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Total Inventory Value",
                "counterColName": "total_value",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
            },
        },
        {
            "name": "Total Item Count",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Total Items in Stock",
                "counterColName": "quantity_on_hand",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 0,
                "stringThouSep": ",",
                "tooltipFormat": "0,0",
            },
        },
    ],
    "stock_below_reorder": [
        {
            "name": "Reorder Alert Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "product_code", "title": "Product Code", "visible": True},
                    {"name": "product_name", "title": "Product Name", "visible": True},
                    {"name": "warehouse_name", "title": "Warehouse", "visible": True},
                    {"name": "quantity_on_hand", "title": "Qty on Hand", "visible": True, "alignContent": "right"},
                    {"name": "reorder_point", "title": "Reorder Point", "visible": True, "alignContent": "right"},
                    {"name": "shortfall", "title": "Shortfall", "visible": True, "alignContent": "right"},
                    {"name": "reorder_value", "title": "Reorder Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                ],
            },
        },
    ],
    "purchase_order_status": [
        {
            "name": "PO Status Pipeline",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "status": "x",
                    "total_value": "y",
                    "po_count": "y",
                },
                "seriesOptions": {
                    "total_value": {"type": "column", "yAxis": 0, "name": "Total Value"},
                    "po_count": {"type": "line", "yAxis": 1, "name": "PO Count"},
                },
                "xAxis": {"type": "category"},
                "yAxis": [
                    {"type": "linear", "title": {"text": "Value"}},
                    {"type": "linear", "title": {"text": "Count"}, "opposite": True},
                ],
                "sortX": True,
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
    ],
    "supplier_spend_analysis": [
        {
            "name": "Supplier Spend (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "bar",
                "columnMapping": {
                    "supplier_name": "x",
                    "total_spend": "y",
                },
                "sortX": True,
                "legend": {"enabled": False},
                "xAxis": {"type": "category"},
                "yAxis": [{"type": "linear", "title": {"text": "Total Spend"}}],
                "series": {"stacking": None},
            },
        },
        {
            "name": "Supplier Spend Detail Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "supplier_name", "title": "Supplier", "visible": True},
                    {"name": "supplier_code", "title": "Code", "visible": True},
                    {"name": "po_count", "title": "PO Count", "visible": True, "alignContent": "right"},
                    {"name": "total_spend", "title": "Total Spend", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "avg_po_value", "title": "Avg PO Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "last_order_date", "title": "Last Order", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                ],
            },
        },
    ],
    "credit_note_trend": [
        {
            "name": "Credit Notes Over Time",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "month": "x",
                    "credit_note_value": "y",
                    "credit_note_count": "y",
                },
                "seriesOptions": {
                    "credit_note_value": {"type": "column", "yAxis": 0, "name": "Credit Note Value"},
                    "credit_note_count": {"type": "line", "yAxis": 1, "name": "Count"},
                },
                "xAxis": {"type": "datetime", "labels": {"enabled": True}},
                "yAxis": [
                    {"type": "linear", "title": {"text": "Value"}},
                    {"type": "linear", "title": {"text": "Count"}, "opposite": True},
                ],
                "sortX": True,
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
        {
            "name": "CN Rate % (Credit Note Value / Revenue)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "line",
                "columnMapping": {
                    "month": "x",
                    "cn_rate_pct": "y",
                },
                "seriesOptions": {
                    "cn_rate_pct": {"type": "line", "yAxis": 0, "name": "CN Rate %", "color": "#e74c3c"},
                },
                "xAxis": {"type": "datetime", "labels": {"enabled": True}},
                "yAxis": [{"type": "linear", "title": {"text": "CN Rate %"}}],
                "sortX": True,
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
        {
            "name": "Credit Notes by Reason (Pie)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "pie",
                "columnMapping": {
                    "reason": "x",
                    "credit_note_value": "y",
                },
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
    ],
    "credit_note_detail": [
        {
            "name": "Credit Note Detail Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "customer_name", "title": "Customer", "visible": True},
                    {"name": "credit_note_number", "title": "CN #", "visible": True},
                    {"name": "credit_note_date", "title": "Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "reason", "title": "Reason", "visible": True},
                    {"name": "product_category", "title": "Category", "visible": True},
                    {"name": "product_name", "title": "Product", "visible": True},
                    {"name": "quantity", "title": "Qty", "visible": True, "alignContent": "right"},
                    {"name": "unit_price", "title": "Unit Price", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "line_total", "title": "Line Total", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "original_invoice_number", "title": "Invoice #", "visible": True},
                    {"name": "status", "title": "Status", "visible": True},
                ],
            },
        },
    ],
    "gl_account_activity": [
        {
            "name": "GL Account Activity Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 50,
                "columns": [
                    {"name": "posting_date", "title": "Posting Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "account_code", "title": "Account Code", "visible": True},
                    {"name": "account_name", "title": "Account Name", "visible": True},
                    {"name": "account_type", "title": "Type", "visible": True},
                    {"name": "debit", "title": "Debit", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "credit", "title": "Credit", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "net_amount", "title": "Net", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "running_balance", "title": "Running Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                ],
            },
        },
    ],
    "gl_account_summary": [
        {
            "name": "Opening Balance",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Opening Balance",
                "counterColName": "opening_balance",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
            },
        },
        {
            "name": "Closing Balance",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Closing Balance",
                "counterColName": "closing_balance",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
            },
        },
        {
            "name": "Period Movement",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Period Movement",
                "counterColName": "period_movement",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
            },
        },
        {
            "name": "Account Summary Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 5,
                "columns": [
                    {"name": "account_code", "title": "Account Code", "visible": True},
                    {"name": "account_name", "title": "Account Name", "visible": True},
                    {"name": "account_type", "title": "Type", "visible": True},
                    {"name": "opening_balance", "title": "Opening Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_debit", "title": "Total Debit", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_credit", "title": "Total Credit", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "period_movement", "title": "Movement", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "closing_balance", "title": "Closing Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "transaction_count", "title": "Transactions", "visible": True, "alignContent": "right"},
                ],
            },
        },
    ],
    "budget_variance": [
        {
            "name": "Budget vs Actual Detail Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "account_code", "title": "Account Code", "visible": True},
                    {"name": "account_name", "title": "Account Name", "visible": True},
                    {"name": "account_type", "title": "Type", "visible": True},
                    {"name": "account_category", "title": "Category", "visible": True},
                    {"name": "fiscal_month", "title": "Month", "visible": True, "alignContent": "right"},
                    {"name": "budget_amount", "title": "Budget", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "actual_amount", "title": "Actual", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "variance_amount", "title": "Variance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "variance_pct", "title": "Variance %", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "budget_status", "title": "Status", "visible": True},
                ],
            },
        },
    ],
    "budget_variance_summary": [
        {
            "name": "Budget vs Actual by Category (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "account_category": "x",
                    "total_budget": "y",
                    "total_actual": "y",
                },
                "seriesOptions": {
                    "total_budget": {"type": "column", "yAxis": 0, "name": "Budget", "color": "#94a3b8"},
                    "total_actual": {"type": "column", "yAxis": 0, "name": "Actual", "color": "#2563eb"},
                },
                "xAxis": {"type": "category"},
                "yAxis": [{"type": "linear", "title": {"text": "Amount"}}],
                "sortX": True,
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
        {
            "name": "Budget Variance Summary Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 10,
                "columns": [
                    {"name": "account_type", "title": "Account Type", "visible": True},
                    {"name": "account_category", "title": "Category", "visible": True},
                    {"name": "total_budget", "title": "Budget", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_actual", "title": "Actual", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_variance", "title": "Variance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "variance_pct", "title": "Variance %", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "over_budget_count", "title": "Over Budget", "visible": True, "alignContent": "right"},
                    {"name": "under_budget_count", "title": "Under Budget", "visible": True, "alignContent": "right"},
                    {"name": "significant_variances", "title": ">10% Variances", "visible": True, "alignContent": "right"},
                ],
            },
        },
    ],
    "payment_terms_histogram": [
        {
            "name": "Days to Pay Distribution",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "days_to_pay_bucket": "x",
                    "invoice_count": "y",
                },
                "seriesOptions": {
                    "invoice_count": {"type": "column", "yAxis": 0, "name": "Invoice Count"},
                },
                "xAxis": {"type": "category"},
                "yAxis": [{"type": "linear", "title": {"text": "Invoices"}}],
                "sortX": True,
                "legend": {"enabled": True},
                "series": {"stacking": "normal"},
            },
        },
    ],
    "payment_terms_customer": [
        {
            "name": "Customer Payment Compliance Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "customer_name", "title": "Customer", "visible": True},
                    {"name": "total_invoices", "title": "Invoices", "visible": True, "alignContent": "right"},
                    {"name": "on_time_count", "title": "On Time", "visible": True, "alignContent": "right"},
                    {"name": "late_count", "title": "Late", "visible": True, "alignContent": "right"},
                    {"name": "unpaid_count", "title": "Unpaid", "visible": True, "alignContent": "right"},
                    {"name": "on_time_pct", "title": "On Time %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                    {"name": "avg_days_to_pay", "title": "Avg Days to Pay", "visible": True, "alignContent": "right"},
                    {"name": "avg_days_late", "title": "Avg Days Late", "visible": True, "alignContent": "right"},
                    {"name": "total_invoiced", "title": "Total Invoiced", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_outstanding", "title": "Outstanding", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                ],
            },
        },
    ],
    "revenue_by_dimension": [
        {
            "name": "Revenue by Dimension (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "bar",
                "columnMapping": {
                    "dimension_name": "x",
                    "revenue": "y",
                },
                "sortX": True,
                "legend": {"enabled": False},
                "xAxis": {"type": "category"},
                "yAxis": [{"type": "linear", "title": {"text": "Revenue"}}],
                "series": {"stacking": None},
            },
        },
        {
            "name": "Revenue by Dimension Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "dimension_type", "title": "Dimension Type", "visible": True},
                    {"name": "dimension_name", "title": "Dimension", "visible": True},
                    {"name": "dimension_code", "title": "Code", "visible": True},
                    {"name": "revenue", "title": "Revenue", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "pct_of_total", "title": "% of Total", "visible": True, "displayAs": "number", "numberFormat": "0.00", "alignContent": "right"},
                    {"name": "entry_count", "title": "Entries", "visible": True, "alignContent": "right"},
                ],
            },
        },
    ],
    "revenue_dimension_trend": [
        {
            "name": "Revenue Trend by Dimension",
            "type": "CHART",
            "options": {
                "globalSeriesType": "line",
                "columnMapping": {
                    "month": "x",
                    "revenue": "y",
                    "dimension_name": "series",
                },
                "xAxis": {"type": "datetime", "labels": {"enabled": True}},
                "yAxis": [{"type": "linear", "title": {"text": "Revenue"}}],
                "sortX": True,
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
    ],
    "ap_aging": [
        {
            "name": "AP Aging Detail Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "supplier_name", "title": "Supplier", "visible": True},
                    {"name": "bill_number", "title": "Bill #", "visible": True},
                    {"name": "bill_date", "title": "Bill Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "due_date", "title": "Due Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "total_amount", "title": "Total Amount", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "amount_paid", "title": "Paid", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "balance_due", "title": "Balance Due", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "status", "title": "Status", "visible": True},
                    {"name": "aging_bucket", "title": "Aging", "visible": True},
                    {"name": "days_overdue", "title": "Days Overdue", "visible": True, "alignContent": "right"},
                ],
            },
        },
    ],
    "ap_aging_summary": [
        {
            "name": "AP Aging Buckets (Pie)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "pie",
                "columnMapping": {
                    "aging_bucket": "x",
                    "total_balance_due": "y",
                },
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
        {
            "name": "AP Aging Buckets (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "aging_bucket": "x",
                    "total_balance_due": "y",
                    "bill_count": "y",
                },
                "seriesOptions": {
                    "total_balance_due": {"type": "column", "yAxis": 0, "name": "Balance Due"},
                    "bill_count": {"type": "line", "yAxis": 1, "name": "Bill Count"},
                },
                "xAxis": {"type": "category"},
                "yAxis": [
                    {"type": "linear", "title": {"text": "Amount"}},
                    {"type": "linear", "title": {"text": "Count"}, "opposite": True},
                ],
                "sortX": True,
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
        {
            "name": "AP Aging Summary Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 10,
                "columns": [
                    {"name": "aging_bucket", "title": "Aging Bucket", "visible": True},
                    {"name": "bill_count", "title": "Bills", "visible": True, "alignContent": "right"},
                    {"name": "total_balance_due", "title": "Balance Due", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_invoiced", "title": "Total Invoiced", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_paid", "title": "Total Paid", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "avg_days_overdue", "title": "Avg Days Overdue", "visible": True, "alignContent": "right"},
                ],
            },
        },
    ],
    "vat_summary": [
        {
            "name": "VAT Summary Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "period", "title": "Period", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM"},
                    {"name": "tax_code", "title": "Tax Code", "visible": True},
                    {"name": "tax_rate", "title": "Rate %", "visible": True, "displayAs": "number", "numberFormat": "0.00", "alignContent": "right"},
                    {"name": "output_taxable", "title": "Output Taxable", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "output_vat", "title": "Output VAT", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "input_taxable", "title": "Input Taxable", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "input_vat", "title": "Input VAT", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "net_vat_payable", "title": "Net VAT Payable", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_lines", "title": "Lines", "visible": True, "alignContent": "right"},
                ],
            },
        },
    ],
    "vat_liability_trend": [
        {
            "name": "Monthly VAT Liability Trend",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "month": "x",
                    "output_vat": "y",
                    "input_vat": "y",
                    "net_vat_payable": "y",
                },
                "seriesOptions": {
                    "output_vat": {"type": "column", "yAxis": 0, "name": "Output VAT (Collected)", "color": "#e74c3c"},
                    "input_vat": {"type": "column", "yAxis": 0, "name": "Input VAT (Paid)", "color": "#2ecc71"},
                    "net_vat_payable": {"type": "line", "yAxis": 0, "name": "Net VAT Payable", "color": "#2563eb"},
                },
                "yAxis": [
                    {"type": "linear", "title": {"text": "VAT Amount"}},
                ],
                "xAxis": {"type": "datetime", "labels": {"enabled": True}},
                "series": {"stacking": None},
                "sortX": True,
                "legend": {"enabled": True},
            },
        },
    ],
}


# ---------------------------------------------------------------------------
# Dashboard definitions
# ---------------------------------------------------------------------------

DASHBOARDS = {
    "sales_summary_dashboard": {
        "name": "Sales Summary",
        "tags": ["sales", "jrny-report"],
        "widgets": [
            # Each widget references query_key + vis index (0-based)
            {"query_key": "sales_summary", "vis_index": 0, "width": 6},
        ],
    },
    "customer_revenue_dashboard": {
        "name": "Customer Revenue Ranking",
        "tags": ["sales", "jrny-report"],
        "widgets": [
            {"query_key": "customer_revenue_ranking", "vis_index": 0, "width": 6},
            {"query_key": "customer_revenue_ranking", "vis_index": 1, "width": 6},
        ],
    },
    "product_performance_dashboard": {
        "name": "Product Performance",
        "tags": ["sales", "jrny-report"],
        "widgets": [
            {"query_key": "product_performance", "vis_index": 0, "width": 6},
        ],
    },
    "invoices_aging_dashboard": {
        "name": "Outstanding Invoices Aging",
        "tags": ["finance", "jrny-report"],
        "widgets": [
            {"query_key": "outstanding_invoices_aging", "vis_index": 0, "width": 3},
            {"query_key": "outstanding_invoices_aging", "vis_index": 1, "width": 6},
        ],
    },
    "cash_flow_dashboard": {
        "name": "Cash Flow Summary",
        "tags": ["finance", "jrny-report"],
        "widgets": [
            {"query_key": "cash_flow_summary", "vis_index": 0, "width": 6},
            {"query_key": "cash_flow_summary", "vis_index": 1, "width": 6},
        ],
    },
    "trial_balance_dashboard": {
        "name": "Trial Balance",
        "tags": ["finance", "jrny-report"],
        "widgets": [
            {"query_key": "trial_balance", "vis_index": 0, "width": 6},
        ],
    },
    "inventory_dashboard": {
        "name": "Inventory Valuation",
        "tags": ["inventory", "jrny-report"],
        "widgets": [
            {"query_key": "inventory_valuation", "vis_index": 1, "width": 2},  # KPI: Total Value
            {"query_key": "inventory_valuation", "vis_index": 2, "width": 2},  # KPI: Item Count
            {"query_key": "inventory_valuation", "vis_index": 0, "width": 6},  # Table
            {"query_key": "stock_below_reorder", "vis_index": 0, "width": 6},  # Reorder table
        ],
    },
    "purchase_orders_dashboard": {
        "name": "Purchase Order Status",
        "tags": ["procurement", "jrny-report"],
        "widgets": [
            {"query_key": "purchase_order_status", "vis_index": 0, "width": 6},
        ],
    },
    "supplier_spend_dashboard": {
        "name": "Supplier Spend Analysis",
        "tags": ["procurement", "jrny-report"],
        "widgets": [
            {"query_key": "supplier_spend_analysis", "vis_index": 0, "width": 6},
            {"query_key": "supplier_spend_analysis", "vis_index": 1, "width": 6},
        ],
    },
    "gl_account_activity_dashboard": {
        "name": "GL Account Activity",
        "tags": ["finance", "jrny-report", "report:finance"],
        "widgets": [
            {"query_key": "gl_account_summary", "vis_index": 0, "width": 2},   # Opening Balance KPI
            {"query_key": "gl_account_summary", "vis_index": 1, "width": 2},   # Closing Balance KPI
            {"query_key": "gl_account_summary", "vis_index": 2, "width": 2},   # Period Movement KPI
            {"query_key": "gl_account_summary", "vis_index": 3, "width": 6},   # Summary table
            {"query_key": "gl_account_activity", "vis_index": 0, "width": 6},   # Detail table
        ],
    },
    "budget_variance_dashboard": {
        "name": "Budget vs Actual Variance",
        "tags": ["finance", "jrny-report", "report:finance"],
        "widgets": [
            {"query_key": "budget_variance_summary", "vis_index": 0, "width": 6},   # Bar chart
            {"query_key": "budget_variance_summary", "vis_index": 1, "width": 6},   # Summary table
            {"query_key": "budget_variance", "vis_index": 0, "width": 6},            # Detail table
        ],
    },
    "ap_aging_dashboard": {
        "name": "Accounts Payable Aging",
        "tags": ["finance", "jrny-report", "report:finance"],
        "widgets": [
            {"query_key": "ap_aging_summary", "vis_index": 0, "width": 3},   # Pie chart
            {"query_key": "ap_aging_summary", "vis_index": 1, "width": 3},   # Bar chart
            {"query_key": "ap_aging_summary", "vis_index": 2, "width": 6},   # Summary table
            {"query_key": "ap_aging", "vis_index": 0, "width": 6},           # Detail table
        ],
    },
    "credit_note_summary_dashboard": {
        "name": "Credit Note Summary",
        "tags": ["finance", "jrny-report", "report:finance"],
        "widgets": [
            {"query_key": "credit_note_trend", "vis_index": 0, "width": 6},  # Trend chart
            {"query_key": "credit_note_trend", "vis_index": 1, "width": 3},  # CN Rate % line
            {"query_key": "credit_note_trend", "vis_index": 2, "width": 3},  # Reason pie
            {"query_key": "credit_note_detail", "vis_index": 0, "width": 6}, # Detail table
        ],
    },
    "payment_terms_dashboard": {
        "name": "Payment Terms Compliance",
        "tags": ["finance", "jrny-report", "report:finance"],
        "widgets": [
            {"query_key": "payment_terms_histogram", "vis_index": 0, "width": 6},  # Histogram
            {"query_key": "payment_terms_customer", "vis_index": 0, "width": 6},   # Customer table
        ],
    },
    "revenue_by_dimension_dashboard": {
        "name": "Revenue by Dimension",
        "tags": ["finance", "jrny-report", "report:finance"],
        "widgets": [
            {"query_key": "revenue_by_dimension", "vis_index": 0, "width": 6},      # Bar chart
            {"query_key": "revenue_dimension_trend", "vis_index": 0, "width": 6},    # Trend line
            {"query_key": "revenue_by_dimension", "vis_index": 1, "width": 6},       # Table
        ],
    },
    "vat_summary_dashboard": {
        "name": "Tax/VAT Summary",
        "tags": ["finance", "jrny-report", "report:finance"],
        "widgets": [
            {"query_key": "vat_liability_trend", "vis_index": 0, "width": 6},  # Monthly VAT trend chart
            {"query_key": "vat_summary", "vis_index": 0, "width": 6},          # VAT summary table
        ],
    },
}


# ---------------------------------------------------------------------------
# Seed logic
# ---------------------------------------------------------------------------

def find_data_source_id(client):
    """Auto-detect the first jrny_pg data source."""
    sources = client.get("/api/data_sources")
    for ds in sources:
        if ds.get("type") == "jrny_pg":
            return ds["id"]
    # Fall back to first available data source
    if sources:
        return sources[0]["id"]
    return None


def check_existing_reports(client):
    """Check if seed reports already exist (idempotent guard)."""
    result = client.get("/api/queries?page_size=250")
    existing_names = {q["name"] for q in result.get("results", [])}
    return existing_names


def create_query(client, data_source_id, query_key, query_def):
    """Create a query via the API and return the response (includes id)."""
    payload = {
        "name": query_def["name"],
        "description": query_def.get("description", ""),
        "query": query_def["query"],
        "data_source_id": data_source_id,
        "options": query_def.get("options", {}),
        "tags": query_def.get("tags", []),
    }
    result = client.post("/api/queries", payload)
    logger.info("  Created query: '%s' (id=%s)", result["name"], result["id"])
    return result


def create_visualization(client, query_id, vis_def):
    """Create a visualization for a query."""
    payload = {
        "query_id": query_id,
        "name": vis_def["name"],
        "type": vis_def["type"],
        "description": vis_def.get("description", ""),
        "options": vis_def["options"],
    }
    result = client.post("/api/visualizations", payload)
    logger.info("    Created visualization: '%s' (id=%s, type=%s)",
                result["name"], result["id"], result["type"])
    return result


def create_dashboard(client, dash_def):
    """Create a dashboard and return its details."""
    payload = {"name": dash_def["name"]}
    result = client.post("/api/dashboards", payload)
    logger.info("  Created dashboard: '%s' (id=%s, slug=%s)",
                result["name"], result["id"], result.get("slug"))
    return result


def add_widget(client, dashboard_id, visualization_id, width=6, options=None):
    """Add a widget to a dashboard."""
    payload = {
        "dashboard_id": dashboard_id,
        "visualization_id": visualization_id,
        "width": width,
        "options": options or {"position": {"autoHeight": True}},
    }
    result = client.post("/api/widgets", payload)
    logger.info("    Added widget (id=%s) to dashboard %s",
                result.get("id"), dashboard_id)
    return result


def publish_dashboard(client, dashboard_id, tags=None):
    """Publish a dashboard (set is_draft=False) and optionally apply tags."""
    try:
        payload = {"is_draft": False}
        if tags:
            payload["tags"] = tags
        # Redash uses POST to update dashboard with is_draft flag
        result = client.post(f"/api/dashboards/{dashboard_id}", payload)
        logger.info("  Published dashboard (id=%s, tags=%s)", dashboard_id, tags)
        return result
    except Exception as e:
        logger.warning("  Could not publish dashboard %s: %s", dashboard_id, e)
        return None


def seed_reports(base_url=None, api_key=None, data_source_id=None):
    """Create all pre-built reports via the JRNYBI API.

    Args:
        base_url: JRNYBI server URL (default: http://localhost:5001)
        api_key: Admin API key for authentication
        data_source_id: Data source ID for queries (auto-detected if None)

    Returns:
        dict with created query IDs, visualization IDs, and dashboard IDs
    """
    base_url = base_url or os.environ.get("JRNYBI_BASE_URL", "http://localhost:5001")
    api_key = api_key or os.environ.get("JRNYBI_ADMIN_API_KEY", "")

    if not api_key:
        logger.error("No API key provided. Set JRNYBI_ADMIN_API_KEY or pass --api-key.")
        return None

    client = APIClient(base_url, api_key)

    # Verify connectivity
    try:
        client.get_text("/ping")
        logger.info("Connected to JRNYBI at %s", base_url)
    except Exception as e:
        logger.error("Cannot connect to JRNYBI at %s: %s", base_url, e)
        return None

    # Auto-detect data source if not provided
    if data_source_id is None:
        data_source_id = int(os.environ.get("JRNYBI_DATA_SOURCE_ID", "0")) or None
    if data_source_id is None:
        data_source_id = find_data_source_id(client)
    if data_source_id is None:
        logger.error("No data source found. Run 'manage ds seed_jrny' first.")
        return None

    logger.info("Using data source id=%s", data_source_id)

    # Check for existing reports (idempotent)
    existing_names = check_existing_reports(client)

    # Track created objects
    created = {
        "queries": {},       # query_key -> {id, name, vis_ids: []}
        "dashboards": {},    # dash_key -> {id, name, slug}
    }

    # ---- Step 1: Create queries ----
    logger.info("Creating report queries...")
    for query_key, query_def in QUERIES.items():
        if query_def["name"] in existing_names:
            logger.info("  Skipping existing query: '%s'", query_def["name"])
            # We need to find the existing query ID for visualizations/dashboards
            result = client.get(f"/api/queries?q={query_def['name']}")
            for q in result.get("results", []):
                if q["name"] == query_def["name"]:
                    created["queries"][query_key] = {
                        "id": q["id"],
                        "name": q["name"],
                        "vis_ids": [v["id"] for v in q.get("visualizations", [])],
                    }
                    break
            continue

        result = create_query(client, data_source_id, query_key, query_def)
        # Track only custom visualizations we create (not the default TABLE)
        created["queries"][query_key] = {
            "id": result["id"],
            "name": result["name"],
            "vis_ids": [],  # Will be populated with custom visualizations only
        }

    # ---- Step 2: Create visualizations ----
    logger.info("Creating visualizations...")
    for query_key, vis_defs in VISUALIZATIONS.items():
        query_info = created["queries"].get(query_key)
        if not query_info:
            logger.warning("  Skipping visualizations for missing query: %s", query_key)
            continue

        query_id = query_info["id"]

        # If this query was already existing with visualizations, skip creating new ones
        if query_info["name"] in existing_names and len(query_info["vis_ids"]) > 1:
            logger.info("  Skipping visualizations for existing query: '%s'", query_info["name"])
            continue

        for vis_def in vis_defs:
            result = create_visualization(client, query_id, vis_def)
            query_info["vis_ids"].append(result["id"])

    # ---- Step 3: Create dashboards with widgets ----
    logger.info("Creating dashboards and widgets...")
    for dash_key, dash_def in DASHBOARDS.items():
        # Check if dashboard already exists
        existing_dashboards = client.get(f"/api/dashboards?q={dash_def['name']}")
        dash_exists = False
        for d in existing_dashboards.get("results", []):
            if d["name"] == dash_def["name"]:
                logger.info("  Skipping existing dashboard: '%s'", dash_def["name"])
                created["dashboards"][dash_key] = {
                    "id": d["id"],
                    "name": d["name"],
                    "slug": d.get("slug"),
                }
                dash_exists = True
                break

        if dash_exists:
            continue

        result = create_dashboard(client, dash_def)
        dashboard_id = result["id"]
        created["dashboards"][dash_key] = {
            "id": dashboard_id,
            "name": result["name"],
            "slug": result.get("slug"),
        }

        # Add widgets
        for widget_def in dash_def["widgets"]:
            query_key = widget_def["query_key"]
            vis_index = widget_def["vis_index"]
            width = widget_def.get("width", 6)

            query_info = created["queries"].get(query_key)
            if not query_info:
                logger.warning("    Skipping widget - query '%s' not found", query_key)
                continue

            vis_ids = query_info["vis_ids"]
            if vis_index >= len(vis_ids):
                logger.warning(
                    "    Skipping widget - vis index %d out of range for query '%s' (has %d)",
                    vis_index, query_key, len(vis_ids),
                )
                continue

            visualization_id = vis_ids[vis_index]
            add_widget(client, dashboard_id, visualization_id, width=width)

        # Publish the dashboard (with tags if defined)
        publish_dashboard(client, dashboard_id, tags=dash_def.get("tags"))

    # ---- Summary ----
    total_queries = len(created["queries"])
    total_vis = sum(len(q["vis_ids"]) for q in created["queries"].values())
    total_dashboards = len(created["dashboards"])

    logger.info("=" * 60)
    logger.info("Seed complete!")
    logger.info("  Queries:        %d", total_queries)
    logger.info("  Visualizations: %d", total_vis)
    logger.info("  Dashboards:     %d", total_dashboards)
    logger.info("=" * 60)

    return created


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Seed JRNYBI pre-built reports")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("JRNYBI_BASE_URL", "http://localhost:5001"),
        help="JRNYBI server URL (default: http://localhost:5001)",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("JRNYBI_ADMIN_API_KEY", ""),
        help="Admin API key (or set JRNYBI_ADMIN_API_KEY env var)",
    )
    parser.add_argument(
        "--data-source-id",
        type=int,
        default=None,
        help="Data source ID for queries (auto-detected if omitted)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    result = seed_reports(
        base_url=args.base_url,
        api_key=args.api_key,
        data_source_id=args.data_source_id,
    )

    if result is None:
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
