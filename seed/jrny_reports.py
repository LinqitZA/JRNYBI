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


def publish_dashboard(client, dashboard_id):
    """Publish a dashboard (set is_draft=False)."""
    try:
        # Redash uses POST to update dashboard with is_draft flag
        result = client.post(f"/api/dashboards/{dashboard_id}", {"is_draft": False})
        logger.info("  Published dashboard (id=%s)", dashboard_id)
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

        # Publish the dashboard
        publish_dashboard(client, dashboard_id)

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
