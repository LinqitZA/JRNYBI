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
    # ---- Inventory: Reorder Recommendations ----
    "reorder_recommendations": {
        "name": "Reorder Recommendations",
        "description": "Products at or below reorder point with suggested order quantities, estimated cost, and preferred supplier. Actionable report that can drive PO creation.",
        "query": """
WITH preferred_suppliers AS (
    SELECT DISTINCT ON (pol.product_id)
        pol.product_id,
        s.supplier_name,
        po.supplier_id
    FROM procurement.purchase_order_lines pol
    JOIN procurement.purchase_orders po ON po.id = pol.po_id
    JOIN reporting.v_suppliers s ON s.id = po.supplier_id
    ORDER BY pol.product_id, po.order_date DESC
)
SELECT
    il.product_code,
    il.product_name,
    il.warehouse,
    il.quantity_on_hand,
    il.reorder_point,
    il.reorder_point - il.quantity_on_hand AS shortfall,
    GREATEST(il.reorder_point - il.quantity_on_hand, il.reorder_point) AS suggested_order_qty,
    il.unit_cost,
    (GREATEST(il.reorder_point - il.quantity_on_hand, il.reorder_point) * il.unit_cost)::NUMERIC(12,2) AS estimated_reorder_cost,
    COALESCE(ps.supplier_name, 'No Supplier on File') AS preferred_supplier
FROM reporting.v_inventory_levels il
LEFT JOIN preferred_suppliers ps ON ps.product_id = il.product_id
WHERE il.quantity_on_hand <= il.reorder_point
ORDER BY shortfall DESC;
""".strip(),
        "options": {"parameters": []},
        "tags": ["inventory", "jrny-report", "report:inventory"],
    },
    "reorder_recommendations_kpi": {
        "name": "Reorder Recommendations - KPIs",
        "description": "Summary KPIs for reorder recommendations: total items below reorder and total estimated reorder cost.",
        "query": """
SELECT
    COUNT(*) AS items_below_reorder,
    COALESCE(SUM(
        GREATEST(il.reorder_point - il.quantity_on_hand, il.reorder_point) * il.unit_cost
    ), 0)::NUMERIC(12,2) AS total_reorder_cost
FROM reporting.v_inventory_levels il
WHERE il.quantity_on_hand <= il.reorder_point;
""".strip(),
        "options": {"parameters": []},
        "tags": ["inventory", "jrny-report", "report:inventory"],
    },
    # ---- Inventory: Turnover Analysis ----
    "inventory_turnover": {
        "name": "Inventory Turnover Analysis",
        "description": "Stock turn ratio by product/category showing days-of-stock-on-hand. Identifies fast movers (might need more stock) and slow movers (too much capital tied up).",
        "query": """
WITH period_usage AS (
    SELECT
        sm.product_id,
        sm.warehouse_id,
        SUM(ABS(sm.quantity))                                    AS total_issued,
        SUM(ABS(sm.quantity) * COALESCE(p.unit_cost, 0))         AS cogs_value,
        COUNT(DISTINCT DATE_TRUNC('day', sm.movement_date))      AS active_days
    FROM inventory.stock_movements sm
    LEFT JOIN inventory.products p ON p.id = sm.product_id
    WHERE sm.movement_type = 'issue'
      AND sm.movement_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY sm.product_id, sm.warehouse_id
)
SELECT
    p.product_code,
    p.product_name,
    p.category,
    w.warehouse_name                                             AS warehouse,
    sl.quantity                                                   AS current_stock,
    COALESCE(sl.unit_cost, p.unit_cost, 0)                       AS unit_cost,
    (sl.quantity * COALESCE(sl.unit_cost, p.unit_cost, 0))::NUMERIC(12,2) AS stock_value,
    COALESCE(pu.total_issued, 0)                                 AS total_issued,
    COALESCE(pu.cogs_value, 0)                                   AS cogs_value,
    CASE
        WHEN (sl.quantity * COALESCE(sl.unit_cost, p.unit_cost, 0)) > 0
          THEN ROUND(COALESCE(pu.cogs_value, 0) / (sl.quantity * COALESCE(sl.unit_cost, p.unit_cost, 0)), 2)
        ELSE 0
    END                                                          AS turnover_ratio,
    CASE
        WHEN COALESCE(pu.active_days, 0) > 0
          THEN ROUND(pu.total_issued / pu.active_days, 2)
        ELSE 0
    END                                                          AS avg_daily_usage,
    CASE
        WHEN COALESCE(pu.active_days, 0) > 0 AND pu.total_issued > 0
          THEN ROUND(sl.quantity / (pu.total_issued / pu.active_days), 0)
        ELSE NULL
    END                                                          AS days_of_stock,
    CASE
        WHEN COALESCE(pu.active_days, 0) = 0 THEN 'No Movement'
        WHEN COALESCE(pu.cogs_value, 0) /
             NULLIF(sl.quantity * COALESCE(sl.unit_cost, p.unit_cost, 0), 0) >= 4
          THEN 'Fast Mover'
        WHEN COALESCE(pu.cogs_value, 0) /
             NULLIF(sl.quantity * COALESCE(sl.unit_cost, p.unit_cost, 0), 0) >= 1
          THEN 'Normal'
        ELSE 'Slow Mover'
    END                                                          AS turnover_class
FROM inventory.stock_levels sl
LEFT JOIN inventory.products p ON p.id = sl.product_id
LEFT JOIN inventory.warehouses w ON w.id = sl.warehouse_id
LEFT JOIN period_usage pu ON pu.product_id = sl.product_id
                          AND pu.warehouse_id = sl.warehouse_id
WHERE sl.quantity > 0
  AND ('{{ category }}' = '' OR p.category = '{{ category }}')
ORDER BY turnover_ratio DESC;
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "category",
                    "title": "Product Category",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["inventory", "jrny-report"],
    },
    # ---- Inventory: ABC Analysis ----
    "abc_analysis_detail": {
        "name": "ABC Analysis - Product Detail",
        "description": "Products classified A/B/C by revenue contribution (Pareto principle). A-items = top 80% revenue, B-items = 80-95%, C-items = 95-100%.",
        "query": """
WITH product_revenue AS (
    SELECT
        p.id AS product_id,
        p.product_code,
        p.product_name,
        p.category,
        SUM(sol.quantity) AS total_qty_sold,
        SUM(sol.line_total) AS total_revenue
    FROM sales.sales_order_lines sol
    JOIN sales.sales_orders so ON so.id = sol.order_id
    JOIN inventory.products p ON p.id = sol.product_id
    WHERE so.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY p.id, p.product_code, p.product_name, p.category
),
ranked AS (
    SELECT
        pr.*,
        SUM(pr.total_revenue) OVER () AS grand_total,
        ROUND(100.0 * pr.total_revenue / NULLIF(SUM(pr.total_revenue) OVER (), 0), 2) AS revenue_pct,
        ROUND(100.0 * SUM(pr.total_revenue) OVER (ORDER BY pr.total_revenue DESC
            ROWS UNBOUNDED PRECEDING) / NULLIF(SUM(pr.total_revenue) OVER (), 0), 2) AS cumulative_pct,
        ROW_NUMBER() OVER (ORDER BY pr.total_revenue DESC) AS rank
    FROM product_revenue pr
),
with_stock AS (
    SELECT
        r.*,
        COALESCE(sl_agg.current_stock, 0) AS current_stock,
        COALESCE(sl_agg.stock_value, 0) AS stock_value,
        CASE
            WHEN r.cumulative_pct <= 80 THEN 'A'
            WHEN r.cumulative_pct <= 95 THEN 'B'
            ELSE 'C'
        END AS abc_class
    FROM ranked r
    LEFT JOIN LATERAL (
        SELECT
            SUM(sl.quantity) AS current_stock,
            SUM(sl.quantity * COALESCE(sl.unit_cost, 0))::NUMERIC(12,2) AS stock_value
        FROM inventory.stock_levels sl
        WHERE sl.product_id = r.product_id
          AND sl.quantity > 0
    ) sl_agg ON TRUE
)
SELECT
    rank,
    product_code,
    product_name,
    category,
    abc_class,
    total_qty_sold,
    total_revenue,
    revenue_pct,
    cumulative_pct,
    current_stock,
    stock_value
FROM with_stock
ORDER BY rank;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["inventory", "jrny-report"],
    },
    "abc_analysis_summary": {
        "name": "ABC Analysis - Summary",
        "description": "ABC classification summary: item count, revenue percentage, and stock value per class.",
        "query": """
WITH product_revenue AS (
    SELECT
        p.id AS product_id,
        SUM(sol.line_total) AS total_revenue
    FROM sales.sales_order_lines sol
    JOIN sales.sales_orders so ON so.id = sol.order_id
    JOIN inventory.products p ON p.id = sol.product_id
    WHERE so.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY p.id
),
ranked AS (
    SELECT
        pr.*,
        ROUND(100.0 * SUM(pr.total_revenue) OVER (ORDER BY pr.total_revenue DESC
            ROWS UNBOUNDED PRECEDING) / NULLIF(SUM(pr.total_revenue) OVER (), 0), 2) AS cumulative_pct
    FROM product_revenue pr
),
classified AS (
    SELECT
        r.*,
        CASE
            WHEN r.cumulative_pct <= 80 THEN 'A'
            WHEN r.cumulative_pct <= 95 THEN 'B'
            ELSE 'C'
        END AS abc_class
    FROM ranked r
)
SELECT
    c.abc_class AS class,
    COUNT(*) AS item_count,
    ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS item_pct,
    SUM(c.total_revenue) AS total_revenue,
    ROUND(100.0 * SUM(c.total_revenue) / NULLIF(SUM(SUM(c.total_revenue)) OVER (), 0), 1) AS revenue_pct,
    COALESCE(SUM(sl_agg.stock_value), 0) AS stock_value
FROM classified c
LEFT JOIN LATERAL (
    SELECT SUM(sl.quantity * COALESCE(sl.unit_cost, 0))::NUMERIC(12,2) AS stock_value
    FROM inventory.stock_levels sl
    WHERE sl.product_id = c.product_id AND sl.quantity > 0
) sl_agg ON TRUE
GROUP BY c.abc_class
ORDER BY c.abc_class;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["inventory", "jrny-report"],
    },
    # ---- Inventory: Pick & Pack Performance ----
    "pick_pack_kpi": {
        "name": "Pick & Pack Performance - KPIs",
        "description": "Operational KPIs: picks per hour, accuracy/fill rate, average fulfilment time.",
        "query": """
SELECT
    COUNT(*) AS total_deliveries,
    ROUND(AVG(pp.shipped_qty), 1) AS avg_lines_per_order,
    CASE
        WHEN SUM(pp.pick_duration_mins) > 0
          THEN ROUND(SUM(pp.shipped_qty) / (SUM(pp.pick_duration_mins) / 60.0), 1)
        ELSE 0
    END AS picks_per_hour,
    ROUND(AVG(pp.fill_rate_pct), 1) AS avg_fill_rate_pct,
    ROUND(AVG(pp.total_fulfilment_mins), 1) AS avg_fulfilment_mins,
    ROUND(AVG(pp.pick_duration_mins), 1) AS avg_pick_mins,
    ROUND(AVG(pp.pack_duration_mins), 1) AS avg_pack_mins
FROM reporting.v_pick_pack_performance pp
WHERE pp.delivery_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND pp.status != 'cancelled';
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["inventory", "jrny-report"],
    },
    "pick_pack_trend": {
        "name": "Pick & Pack Performance - Daily Trend",
        "description": "Daily trends: picks per hour, fill rate, and fulfilment time over the selected period.",
        "query": """
SELECT
    pp.delivery_date AS date,
    COUNT(*) AS deliveries,
    ROUND(AVG(pp.shipped_qty), 1) AS avg_lines_per_order,
    CASE
        WHEN SUM(pp.pick_duration_mins) > 0
          THEN ROUND(SUM(pp.shipped_qty) / (SUM(pp.pick_duration_mins) / 60.0), 1)
        ELSE 0
    END AS picks_per_hour,
    ROUND(AVG(pp.fill_rate_pct), 1) AS avg_fill_rate_pct,
    ROUND(AVG(pp.total_fulfilment_mins), 1) AS avg_fulfilment_mins
FROM reporting.v_pick_pack_performance pp
WHERE pp.delivery_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND pp.status != 'cancelled'
GROUP BY pp.delivery_date
ORDER BY pp.delivery_date;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["inventory", "jrny-report"],
    },
    "pick_pack_detail": {
        "name": "Pick & Pack Performance - Detail",
        "description": "Per-delivery pick and pack performance metrics.",
        "query": """
SELECT
    pp.delivery_number,
    pp.order_number,
    pp.delivery_date,
    pp.status,
    pp.ordered_qty,
    pp.shipped_qty,
    pp.fill_rate_pct,
    ROUND(pp.pick_duration_mins, 1) AS pick_mins,
    ROUND(pp.pack_duration_mins, 1) AS pack_mins,
    ROUND(pp.total_fulfilment_mins, 1) AS total_mins,
    CASE
        WHEN pp.pick_duration_mins > 0
          THEN ROUND(pp.shipped_qty / (pp.pick_duration_mins / 60.0), 1)
        ELSE NULL
    END AS picks_per_hour
FROM reporting.v_pick_pack_performance pp
WHERE pp.delivery_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND pp.status != 'cancelled'
ORDER BY pp.delivery_date DESC, pp.delivery_number;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
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
    # ---- Procurement: OTIF ----
    "otif_kpi": {
        "name": "OTIF - KPI Summary",
        "description": "Overall On-Time In-Full (OTIF) KPI scores for supplier delivery performance.",
        "query": """
SELECT
    COUNT(*) AS total_lines,
    ROUND(100.0 * SUM(CASE WHEN is_on_time THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS on_time_pct,
    ROUND(100.0 * SUM(CASE WHEN is_in_full THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS in_full_pct,
    ROUND(100.0 * SUM(CASE WHEN is_otif THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS otif_pct,
    ROUND(AVG(CASE WHEN days_late > 0 THEN days_late ELSE 0 END), 1) AS avg_days_late
FROM reporting.v_procurement_otif
WHERE receipt_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR supplier_name ILIKE '%' || '{{ supplier_name }}' || '%');
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "text", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    "otif_by_supplier": {
        "name": "OTIF - Supplier Ranking",
        "description": "Supplier OTIF scores ranked by delivery performance.",
        "query": """
SELECT
    supplier_name,
    COUNT(*) AS total_lines,
    SUM(CASE WHEN is_on_time THEN 1 ELSE 0 END) AS on_time_count,
    ROUND(100.0 * SUM(CASE WHEN is_on_time THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS on_time_pct,
    SUM(CASE WHEN is_in_full THEN 1 ELSE 0 END) AS in_full_count,
    ROUND(100.0 * SUM(CASE WHEN is_in_full THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS in_full_pct,
    SUM(CASE WHEN is_otif THEN 1 ELSE 0 END) AS otif_count,
    ROUND(100.0 * SUM(CASE WHEN is_otif THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS otif_pct,
    ROUND(AVG(CASE WHEN days_late > 0 THEN days_late ELSE 0 END), 1) AS avg_days_late
FROM reporting.v_procurement_otif
WHERE receipt_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR supplier_name ILIKE '%' || '{{ supplier_name }}' || '%')
GROUP BY supplier_name
ORDER BY otif_pct DESC;
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "text", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    "otif_trend": {
        "name": "OTIF - Monthly Trend",
        "description": "Monthly OTIF trend showing on-time, in-full, and combined OTIF percentages over time.",
        "query": """
SELECT
    DATE_TRUNC('month', receipt_date)::date AS month,
    COUNT(*) AS total_lines,
    ROUND(100.0 * SUM(CASE WHEN is_on_time THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS on_time_pct,
    ROUND(100.0 * SUM(CASE WHEN is_in_full THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS in_full_pct,
    ROUND(100.0 * SUM(CASE WHEN is_otif THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS otif_pct
FROM reporting.v_procurement_otif
WHERE receipt_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR supplier_name ILIKE '%' || '{{ supplier_name }}' || '%')
GROUP BY DATE_TRUNC('month', receipt_date)
ORDER BY month;
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "text", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    # ---- Procurement: Vendor Scorecard ----
    "vendor_scorecard": {
        "name": "Vendor Scorecard - Performance Rankings",
        "description": "Composite vendor performance scores combining OTIF, quality (inspection pass rate), price variance, and delivery timeliness. Supports vendor rationalization and negotiation.",
        "query": """
SELECT
    supplier_name,
    supplier_code,
    vendor_group,
    period_label,
    total_pos,
    total_lines,
    otif_pct,
    quality_pct,
    ROUND(100 - ABS(price_variance_pct), 2) AS price_score,
    delivery_score,
    composite_score,
    composite_rank,
    COALESCE(prior_composite_score, 0) AS prior_composite_score,
    COALESCE(score_trend, 0) AS score_trend,
    CASE
        WHEN composite_score >= 90 THEN 'Preferred'
        WHEN composite_score >= 70 THEN 'Approved'
        WHEN composite_score >= 50 THEN 'Conditional'
        ELSE 'Under Review'
    END AS vendor_tier,
    avg_lead_time_days
FROM reporting.v_vendor_scorecards
WHERE period BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ vendor_group }}' = '' OR vendor_group = '{{ vendor_group }}')
ORDER BY composite_score DESC;
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "vendor_group",
                    "title": "Vendor Group",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["procurement", "jrny-report", "report:procurement"],
    },
    "vendor_scorecard_dimensions": {
        "name": "Vendor Scorecard - Dimension Comparison",
        "description": "Vendor scores across individual performance dimensions for radar-style comparison.",
        "query": """
SELECT
    supplier_name,
    'OTIF' AS dimension,
    otif_pct AS score
FROM reporting.v_vendor_scorecards
WHERE period BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ vendor_group }}' = '' OR vendor_group = '{{ vendor_group }}')

UNION ALL

SELECT
    supplier_name,
    'Quality' AS dimension,
    quality_pct AS score
FROM reporting.v_vendor_scorecards
WHERE period BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ vendor_group }}' = '' OR vendor_group = '{{ vendor_group }}')

UNION ALL

SELECT
    supplier_name,
    'Price' AS dimension,
    ROUND(100 - ABS(price_variance_pct), 2) AS score
FROM reporting.v_vendor_scorecards
WHERE period BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ vendor_group }}' = '' OR vendor_group = '{{ vendor_group }}')

UNION ALL

SELECT
    supplier_name,
    'Delivery' AS dimension,
    delivery_score AS score
FROM reporting.v_vendor_scorecards
WHERE period BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ vendor_group }}' = '' OR vendor_group = '{{ vendor_group }}')

ORDER BY supplier_name, dimension;
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "vendor_group",
                    "title": "Vendor Group",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["procurement", "jrny-report", "report:procurement"],
    },
    "vendor_scorecard_kpi": {
        "name": "Vendor Scorecard - KPIs",
        "description": "Summary KPIs for vendor scorecard: average composite score, best vendor, worst vendor.",
        "query": """
SELECT
    COUNT(DISTINCT supplier_id) AS total_vendors,
    ROUND(AVG(composite_score), 1) AS avg_composite_score,
    MAX(composite_score) AS best_score,
    MIN(composite_score) AS worst_score
FROM reporting.v_vendor_scorecards
WHERE period BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ vendor_group }}' = '' OR vendor_group = '{{ vendor_group }}');
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "vendor_group",
                    "title": "Vendor Group",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["procurement", "jrny-report", "report:procurement"],
    },
    # ---- Procurement: RFQ Response Analysis ----
    "rfq_response_analysis": {
        "name": "RFQ Response Analysis - Vendor Metrics",
        "description": "Request for Quote response rates, average response time, and price competitiveness across vendors. Supports sourcing strategy and vendor pool management.",
        "query": """
WITH rfq_invites AS (
    -- Each RFQ is assumed sent to all 3 suppliers (or we count actual responses + declines)
    SELECT
        r.rfq_id,
        r.supplier_id,
        s.supplier_name,
        s.supplier_code,
        rfq.rfq_number,
        rfq.title AS rfq_title,
        rfq.rfq_date,
        r.response_date,
        r.status AS response_status,
        CASE WHEN r.status = 'received' THEN 1 ELSE 0 END AS responded,
        CASE WHEN r.status = 'declined' THEN 1 ELSE 0 END AS declined,
        CASE WHEN r.response_date IS NOT NULL
             THEN (r.response_date - rfq.rfq_date)
             ELSE NULL
        END AS response_days
    FROM procurement.rfq_responses r
    JOIN procurement.rfq_requests rfq ON rfq.id = r.rfq_id
    JOIN reporting.v_suppliers s ON s.id = r.supplier_id
    WHERE rfq.rfq_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
)
SELECT
    supplier_name,
    supplier_code,
    COUNT(*) AS rfqs_received,
    SUM(responded) AS rfqs_responded,
    SUM(declined) AS rfqs_declined,
    ROUND(100.0 * SUM(responded) / NULLIF(COUNT(*), 0), 1) AS response_rate_pct,
    ROUND(AVG(CASE WHEN responded = 1 THEN response_days END), 1) AS avg_response_days,
    MIN(CASE WHEN responded = 1 THEN response_days END) AS min_response_days,
    MAX(CASE WHEN responded = 1 THEN response_days END) AS max_response_days
FROM rfq_invites
GROUP BY supplier_name, supplier_code
ORDER BY response_rate_pct DESC, avg_response_days ASC;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["procurement", "jrny-report", "report:procurement"],
    },
    "rfq_price_comparison": {
        "name": "RFQ Response Analysis - Price Comparison",
        "description": "Compare quoted prices across respondents for the same items to identify best-value suppliers.",
        "query": """
SELECT
    rfq.rfq_number,
    rfq.title AS rfq_title,
    rl.description AS item_description,
    rl.quantity,
    rl.target_price,
    s.supplier_name,
    rrl.quoted_price,
    rrl.lead_time_days,
    ROUND(100.0 * (rrl.quoted_price - rl.target_price) / NULLIF(rl.target_price, 0), 1) AS price_vs_target_pct,
    CASE
        WHEN rrl.quoted_price <= rl.target_price THEN 'Below Target'
        WHEN rrl.quoted_price <= rl.target_price * 1.1 THEN 'Near Target'
        ELSE 'Above Target'
    END AS price_bracket
FROM procurement.rfq_response_lines rrl
JOIN procurement.rfq_responses r ON r.id = rrl.response_id
JOIN procurement.rfq_lines rl ON rl.id = rrl.rfq_line_id
JOIN procurement.rfq_requests rfq ON rfq.id = r.rfq_id
JOIN reporting.v_suppliers s ON s.id = r.supplier_id
WHERE rfq.rfq_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND r.status = 'received'
ORDER BY rfq.rfq_number, rl.description, rrl.quoted_price;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["procurement", "jrny-report", "report:procurement"],
    },
    "rfq_response_kpi": {
        "name": "RFQ Response Analysis - KPIs",
        "description": "Summary KPIs for RFQ response analysis: total RFQs, overall response rate, average response time.",
        "query": """
SELECT
    COUNT(DISTINCT rfq.id) AS total_rfqs,
    COUNT(r.id) AS total_invitations,
    SUM(CASE WHEN r.status = 'received' THEN 1 ELSE 0 END) AS total_responses,
    ROUND(100.0 * SUM(CASE WHEN r.status = 'received' THEN 1 ELSE 0 END)
        / NULLIF(COUNT(r.id), 0), 1) AS overall_response_rate,
    ROUND(AVG(CASE WHEN r.status = 'received'
        THEN (r.response_date - rfq.rfq_date) END), 1) AS avg_response_days
FROM procurement.rfq_requests rfq
LEFT JOIN procurement.rfq_responses r ON r.rfq_id = rfq.id
WHERE rfq.rfq_date BETWEEN '{{ start_date }}' AND '{{ end_date }}';
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["procurement", "jrny-report", "report:procurement"],
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
    # ---- Cashbook ----
    "bank_reconciliation_status": {
        "name": "Bank Reconciliation Status",
        "description": "Reconciliation progress per bank account showing matched vs unmatched lines and values.",
        "query": """
SELECT
    account_name,
    bank_name,
    current_balance,
    total_lines,
    matched_count,
    unmatched_count,
    pct_reconciled,
    matched_value,
    unmatched_value,
    oldest_unmatched_date,
    oldest_unmatched_days,
    last_reconciliation_date,
    last_reconciliation_status
FROM reporting.v_bank_reconciliation_status
ORDER BY unmatched_count DESC, account_name;
""".strip(),
        "options": {"parameters": []},
        "tags": ["cashbook", "jrny-report"],
    },
    "bank_recon_unmatched_detail": {
        "name": "Bank Reconciliation - Unmatched Items Detail",
        "description": "Detail of unmatched statement lines sorted by age, for reconciliation follow-up.",
        "query": """
SELECT
    bank_account,
    statement_date,
    description,
    amount,
    reference,
    days_outstanding,
    aging_bucket,
    direction
FROM reporting.v_unmatched_statement_lines
ORDER BY days_outstanding DESC, bank_account;
""".strip(),
        "options": {"parameters": []},
        "tags": ["cashbook", "jrny-report"],
    },
    "cash_position_summary": {
        "name": "Cash Position Summary",
        "description": "Current cash position across all bank accounts with projected inflows and outflows over 30/60/90 days.",
        "query": """
SELECT
    account_name,
    bank_name,
    current_balance,
    projected_inflows,
    projected_outflows,
    projected_balance,
    inflows_30d,
    outflows_30d,
    balance_30d,
    inflows_60d,
    outflows_60d,
    balance_60d,
    inflows_90d,
    outflows_90d,
    balance_90d
FROM reporting.v_cash_position
ORDER BY current_balance DESC;
""".strip(),
        "options": {"parameters": []},
        "tags": ["cashbook", "jrny-report"],
    },
    "cash_position_projection": {
        "name": "Cash Position - 30/60/90 Day Projection",
        "description": "Projected cash balance over next 30, 60, and 90 days for treasury planning.",
        "query": """
SELECT
    period,
    SUM(balance) AS projected_balance,
    SUM(inflows) AS total_inflows,
    SUM(outflows) AS total_outflows
FROM (
    SELECT 'Now' AS period, 0 AS sort_order,
           SUM(current_balance) AS balance,
           0 AS inflows, 0 AS outflows
    FROM reporting.v_cash_position
    UNION ALL
    SELECT '30 Days' AS period, 1 AS sort_order,
           SUM(balance_30d) AS balance,
           SUM(inflows_30d) AS inflows,
           SUM(outflows_30d) AS outflows
    FROM reporting.v_cash_position
    UNION ALL
    SELECT '60 Days' AS period, 2 AS sort_order,
           SUM(balance_60d) AS balance,
           SUM(inflows_60d) AS inflows,
           SUM(outflows_60d) AS outflows
    FROM reporting.v_cash_position
    UNION ALL
    SELECT '90 Days' AS period, 3 AS sort_order,
           SUM(balance_90d) AS balance,
           SUM(inflows_90d) AS inflows,
           SUM(outflows_90d) AS outflows
    FROM reporting.v_cash_position
) sub
GROUP BY period, sort_order
ORDER BY sort_order;
""".strip(),
        "options": {"parameters": []},
        "tags": ["cashbook", "jrny-report"],
    },
    "unmatched_transactions": {
        "name": "Unmatched Transactions",
        "description": "Bank statement lines not yet matched to any source document, sorted by oldest first.",
        "query": """
SELECT
    bank_account,
    bank_name,
    statement_date,
    description,
    amount,
    reference,
    days_outstanding,
    aging_bucket,
    direction
FROM reporting.v_unmatched_statement_lines
WHERE ('{{ bank_account }}' = '' OR bank_account = '{{ bank_account }}')
ORDER BY days_outstanding DESC;
""".strip(),
        "options": {"parameters": [
            {
                "name": "bank_account",
                "title": "Bank Account",
                "type": "text",
                "value": "",
            },
        ]},
        "tags": ["cashbook", "jrny-report"],
    },
    "unmatched_by_account_summary": {
        "name": "Unmatched Transactions - Summary by Account",
        "description": "Summary of unmatched transaction value grouped by bank account.",
        "query": """
SELECT
    bank_account,
    COUNT(*) AS unmatched_count,
    SUM(ABS(amount)) AS total_unmatched_value,
    SUM(CASE WHEN amount >= 0 THEN amount ELSE 0 END) AS unmatched_credits,
    SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS unmatched_debits,
    MIN(statement_date) AS oldest_item_date,
    CURRENT_DATE - MIN(statement_date) AS oldest_item_age
FROM reporting.v_unmatched_statement_lines
GROUP BY bank_account
ORDER BY total_unmatched_value DESC;
""".strip(),
        "options": {"parameters": []},
        "tags": ["cashbook", "jrny-report"],
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
    "reorder_recommendations": [
        {
            "name": "Reorder Recommendations Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "product_code", "title": "Product Code", "visible": True},
                    {"name": "product_name", "title": "Product", "visible": True},
                    {"name": "warehouse", "title": "Warehouse", "visible": True},
                    {"name": "quantity_on_hand", "title": "Qty on Hand", "visible": True, "alignContent": "right"},
                    {"name": "reorder_point", "title": "Reorder Point", "visible": True, "alignContent": "right"},
                    {"name": "shortfall", "title": "Shortfall", "visible": True, "alignContent": "right"},
                    {"name": "suggested_order_qty", "title": "Suggested Order Qty", "visible": True, "alignContent": "right"},
                    {"name": "unit_cost", "title": "Unit Cost", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "estimated_reorder_cost", "title": "Est. Reorder Cost", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "preferred_supplier", "title": "Preferred Supplier", "visible": True},
                ],
            },
        },
    ],
    "reorder_recommendations_kpi": [
        {
            "name": "Items Below Reorder",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Items Below Reorder Point",
                "counterColName": "items_below_reorder",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 0,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "defaultColumns": 2,
                "defaultRows": 5,
            },
        },
        {
            "name": "Total Reorder Cost",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Total Estimated Reorder Cost",
                "counterColName": "total_reorder_cost",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "defaultColumns": 2,
                "defaultRows": 5,
                "formatTargetValue": True,
            },
        },
    ],
    "inventory_turnover": [
        {
            "name": "Turnover vs Stock Value (Scatter)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "scatter",
                "columnMapping": {
                    "stock_value": "x",
                    "turnover_ratio": "y",
                    "product_name": "series",
                },
                "xAxis": {
                    "type": "linear",
                    "title": {"text": "Stock Value"},
                    "labels": {"enabled": True},
                },
                "yAxis": [
                    {
                        "type": "linear",
                        "title": {"text": "Turnover Ratio"},
                    },
                ],
                "legend": {"enabled": False},
                "series": {"stacking": None},
                "numberFormat": "0,0.00",
                "showDataLabels": False,
                "sortX": True,
            },
        },
        {
            "name": "Inventory Turnover Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "product_code", "title": "Product Code", "visible": True},
                    {"name": "product_name", "title": "Product Name", "visible": True},
                    {"name": "category", "title": "Category", "visible": True},
                    {"name": "warehouse", "title": "Warehouse", "visible": True},
                    {"name": "current_stock", "title": "Current Stock", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0"},
                    {"name": "avg_daily_usage", "title": "Avg Daily Usage", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0.00"},
                    {"name": "turnover_ratio", "title": "Turnover Ratio", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0.00"},
                    {"name": "days_of_stock", "title": "Days of Stock", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0"},
                    {"name": "stock_value", "title": "Stock Value", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0.00"},
                    {"name": "turnover_class", "title": "Classification", "visible": True},
                ],
            },
        },
    ],
    "abc_analysis_detail": [
        {
            "name": "Pareto Chart",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "product_name": "x",
                    "total_revenue": "y",
                    "cumulative_pct": "y",
                },
                "seriesOptions": {
                    "total_revenue": {"type": "column", "yAxis": 0, "name": "Revenue", "color": "#2563eb"},
                    "cumulative_pct": {"type": "line", "yAxis": 1, "name": "Cumulative %", "color": "#dc2626"},
                },
                "xAxis": {"type": "category", "labels": {"enabled": True}},
                "yAxis": [
                    {"type": "linear", "title": {"text": "Revenue"}},
                    {"type": "linear", "title": {"text": "Cumulative %"}, "opposite": True, "rangeMax": 100},
                ],
                "sortX": False,
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
        {
            "name": "ABC Detail Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "rank", "title": "#", "visible": True, "alignContent": "right"},
                    {"name": "product_code", "title": "Product Code", "visible": True},
                    {"name": "product_name", "title": "Product Name", "visible": True},
                    {"name": "category", "title": "Category", "visible": True},
                    {"name": "abc_class", "title": "ABC Class", "visible": True},
                    {"name": "total_qty_sold", "title": "Qty Sold", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0"},
                    {"name": "total_revenue", "title": "Revenue", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0.00"},
                    {"name": "revenue_pct", "title": "Rev %", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0.00"},
                    {"name": "cumulative_pct", "title": "Cum %", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0.00"},
                    {"name": "current_stock", "title": "Stock", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0"},
                    {"name": "stock_value", "title": "Stock Value", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0.00"},
                ],
            },
        },
    ],
    "abc_analysis_summary": [
        {
            "name": "ABC Summary Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 10,
                "columns": [
                    {"name": "class", "title": "Class", "visible": True},
                    {"name": "item_count", "title": "Item Count", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0"},
                    {"name": "item_pct", "title": "Items %", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0.0"},
                    {"name": "total_revenue", "title": "Revenue", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0.00"},
                    {"name": "revenue_pct", "title": "Revenue %", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0.0"},
                    {"name": "stock_value", "title": "Stock Value", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0.00"},
                ],
            },
        },
    ],
    "pick_pack_kpi": [
        {
            "name": "Picks per Hour",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Picks / Hour",
                "counterColName": "picks_per_hour",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 1,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.0",
            },
        },
        {
            "name": "Fill Rate %",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Fill Rate %",
                "counterColName": "avg_fill_rate_pct",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 1,
                "stringSuffix": "%",
                "tooltipFormat": "0.0",
            },
        },
        {
            "name": "Avg Fulfilment Time",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Avg Fulfilment (mins)",
                "counterColName": "avg_fulfilment_mins",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 1,
                "stringSuffix": " min",
                "tooltipFormat": "0,0.0",
            },
        },
    ],
    "pick_pack_trend": [
        {
            "name": "Performance Trend",
            "type": "CHART",
            "options": {
                "globalSeriesType": "line",
                "columnMapping": {
                    "date": "x",
                    "picks_per_hour": "y",
                    "avg_fill_rate_pct": "y",
                },
                "seriesOptions": {
                    "picks_per_hour": {"type": "line", "yAxis": 0, "name": "Picks/Hour", "color": "#2563eb"},
                    "avg_fill_rate_pct": {"type": "line", "yAxis": 1, "name": "Fill Rate %", "color": "#16a34a"},
                },
                "xAxis": {"type": "datetime", "labels": {"enabled": True}},
                "yAxis": [
                    {"type": "linear", "title": {"text": "Picks per Hour"}},
                    {"type": "linear", "title": {"text": "Fill Rate %"}, "opposite": True},
                ],
                "sortX": True,
                "legend": {"enabled": True},
                "series": {"stacking": None},
            },
        },
    ],
    "pick_pack_detail": [
        {
            "name": "Delivery Performance Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "delivery_number", "title": "Delivery #", "visible": True},
                    {"name": "order_number", "title": "Order #", "visible": True},
                    {"name": "delivery_date", "title": "Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "status", "title": "Status", "visible": True},
                    {"name": "ordered_qty", "title": "Ordered", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0"},
                    {"name": "shipped_qty", "title": "Shipped", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0,0"},
                    {"name": "fill_rate_pct", "title": "Fill %", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0.0"},
                    {"name": "pick_mins", "title": "Pick (min)", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0.0"},
                    {"name": "pack_mins", "title": "Pack (min)", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0.0"},
                    {"name": "total_mins", "title": "Total (min)", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0.0"},
                    {"name": "picks_per_hour", "title": "Picks/Hr", "visible": True, "alignContent": "right", "displayAs": "number", "numberFormat": "0.0"},
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
    "otif_kpi": [
        {
            "name": "OTIF Score",
            "type": "COUNTER",
            "options": {
                "counterLabel": "OTIF Score %",
                "counterColName": "otif_pct",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 1,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.0",
                "stringSuffix": "%",
            },
        },
        {
            "name": "On-Time %",
            "type": "COUNTER",
            "options": {
                "counterLabel": "On-Time Delivery %",
                "counterColName": "on_time_pct",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 1,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.0",
                "stringSuffix": "%",
            },
        },
        {
            "name": "In-Full %",
            "type": "COUNTER",
            "options": {
                "counterLabel": "In-Full Delivery %",
                "counterColName": "in_full_pct",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 1,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.0",
                "stringSuffix": "%",
            },
        },
    ],
    "otif_by_supplier": [
        {
            "name": "Supplier OTIF Ranking (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "bar",
                "columnMapping": {
                    "supplier_name": "x",
                    "otif_pct": "y",
                    "on_time_pct": "y",
                    "in_full_pct": "y",
                },
                "seriesOptions": {
                    "otif_pct": {"type": "bar", "yAxis": 0, "name": "OTIF %", "color": "#2563eb"},
                    "on_time_pct": {"type": "bar", "yAxis": 0, "name": "On-Time %", "color": "#16a34a"},
                    "in_full_pct": {"type": "bar", "yAxis": 0, "name": "In-Full %", "color": "#d97706"},
                },
                "sortX": True,
                "legend": {"enabled": True},
                "xAxis": {"type": "category"},
                "yAxis": [{"type": "linear", "title": {"text": "Percentage (%)"}}],
                "series": {"stacking": None},
            },
        },
        {
            "name": "Supplier OTIF Detail Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "supplier_name", "title": "Supplier", "visible": True},
                    {"name": "total_lines", "title": "Total Lines", "visible": True, "alignContent": "right"},
                    {"name": "on_time_pct", "title": "On-Time %", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "in_full_pct", "title": "In-Full %", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "otif_pct", "title": "OTIF %", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "avg_days_late", "title": "Avg Days Late", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                ],
            },
        },
    ],
    "otif_trend": [
        {
            "name": "OTIF Trend Over Time",
            "type": "CHART",
            "options": {
                "globalSeriesType": "line",
                "columnMapping": {
                    "month": "x",
                    "otif_pct": "y",
                    "on_time_pct": "y",
                    "in_full_pct": "y",
                },
                "seriesOptions": {
                    "otif_pct": {"type": "line", "yAxis": 0, "name": "OTIF %", "color": "#2563eb"},
                    "on_time_pct": {"type": "line", "yAxis": 0, "name": "On-Time %", "color": "#16a34a"},
                    "in_full_pct": {"type": "line", "yAxis": 0, "name": "In-Full %", "color": "#d97706"},
                },
                "xAxis": {"type": "datetime", "labels": {"enabled": True}},
                "yAxis": [{"type": "linear", "title": {"text": "Percentage (%)"}}],
                "series": {"stacking": None},
                "sortX": True,
                "legend": {"enabled": True},
            },
        },
    ],
    "vendor_scorecard": [
        {
            "name": "Vendor Performance Rankings (Table)",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "composite_rank", "title": "Rank", "visible": True, "alignContent": "center"},
                    {"name": "supplier_name", "title": "Vendor", "visible": True},
                    {"name": "supplier_code", "title": "Code", "visible": True},
                    {"name": "vendor_group", "title": "Group", "visible": True},
                    {"name": "vendor_tier", "title": "Tier", "visible": True},
                    {"name": "otif_pct", "title": "OTIF %", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "quality_pct", "title": "Quality %", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "price_score", "title": "Price Score", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "delivery_score", "title": "Delivery", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "composite_score", "title": "Composite", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "score_trend", "title": "Trend", "visible": True, "displayAs": "number", "numberFormat": "+0,0.0;-0,0.0", "alignContent": "right"},
                    {"name": "avg_lead_time_days", "title": "Lead Time (d)", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "period_label", "title": "Period", "visible": True},
                ],
            },
        },
    ],
    "vendor_scorecard_dimensions": [
        {
            "name": "Vendor Dimension Comparison (Grouped Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "dimension": "x",
                    "score": "y",
                    "supplier_name": "series",
                },
                "seriesOptions": {},
                "xAxis": {"type": "category", "labels": {"enabled": True}},
                "yAxis": [{"type": "linear", "title": {"text": "Score (%)"}, "rangeMin": 0, "rangeMax": 100}],
                "series": {"stacking": None},
                "sortX": True,
                "legend": {"enabled": True},
            },
        },
    ],
    "vendor_scorecard_kpi": [
        {
            "name": "Total Vendors",
            "type": "COUNTER",
            "options": {
                "counterColName": "total_vendors",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 0,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0",
            },
        },
        {
            "name": "Avg Composite Score",
            "type": "COUNTER",
            "options": {
                "counterColName": "avg_composite_score",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 1,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.0",
            },
        },
        {
            "name": "Best Score",
            "type": "COUNTER",
            "options": {
                "counterColName": "best_score",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 1,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.0",
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
    # ---- Cashbook: Bank Reconciliation Status ----
    "bank_reconciliation_status": [
        {
            "name": "Reconciliation Status Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "account_name", "title": "Account", "visible": True},
                    {"name": "bank_name", "title": "Bank", "visible": True},
                    {"name": "current_balance", "title": "Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_lines", "title": "Total Lines", "visible": True, "alignContent": "right"},
                    {"name": "matched_count", "title": "Matched", "visible": True, "alignContent": "right"},
                    {"name": "unmatched_count", "title": "Unmatched", "visible": True, "alignContent": "right"},
                    {"name": "pct_reconciled", "title": "% Reconciled", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                    {"name": "unmatched_value", "title": "Unmatched Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "oldest_unmatched_days", "title": "Oldest (Days)", "visible": True, "alignContent": "right"},
                    {"name": "last_reconciliation_date", "title": "Last Recon Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                ],
            },
        },
        {
            "name": "Matched vs Unmatched Value by Account",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "account_name": "x",
                    "matched_value": "y",
                    "unmatched_value": "y",
                },
                "seriesOptions": {
                    "matched_value": {"type": "column", "yAxis": 0, "name": "Matched Value", "color": "#2ecc71"},
                    "unmatched_value": {"type": "column", "yAxis": 0, "name": "Unmatched Value", "color": "#e74c3c"},
                },
                "yAxis": [
                    {"type": "linear", "title": {"text": "Value"}},
                ],
                "xAxis": {"type": "category", "labels": {"enabled": True}},
                "series": {"stacking": "normal"},
                "legend": {"enabled": True},
            },
        },
    ],
    "bank_recon_unmatched_detail": [
        {
            "name": "Unmatched Items Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "bank_account", "title": "Bank Account", "visible": True},
                    {"name": "statement_date", "title": "Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "description", "title": "Description", "visible": True},
                    {"name": "amount", "title": "Amount", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "reference", "title": "Reference", "visible": True},
                    {"name": "days_outstanding", "title": "Days Outstanding", "visible": True, "alignContent": "right"},
                    {"name": "aging_bucket", "title": "Age Bucket", "visible": True},
                    {"name": "direction", "title": "Direction", "visible": True},
                ],
            },
        },
    ],
    # ---- Cashbook: Cash Position Summary ----
    "cash_position_summary": [
        {
            "name": "Cash Position Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "account_name", "title": "Account", "visible": True},
                    {"name": "bank_name", "title": "Bank", "visible": True},
                    {"name": "current_balance", "title": "Current Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "projected_inflows", "title": "AR Inflows", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "projected_outflows", "title": "AP Outflows", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "projected_balance", "title": "Projected Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "balance_30d", "title": "30-Day Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "balance_60d", "title": "60-Day Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "balance_90d", "title": "90-Day Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                ],
            },
        },
    ],
    "cash_position_projection": [
        {
            "name": "Cash Projection Chart",
            "type": "CHART",
            "options": {
                "globalSeriesType": "area",
                "columnMapping": {
                    "period": "x",
                    "projected_balance": "y",
                    "total_inflows": "y",
                    "total_outflows": "y",
                },
                "seriesOptions": {
                    "projected_balance": {"type": "area", "yAxis": 0, "name": "Projected Balance", "color": "#2563eb"},
                    "total_inflows": {"type": "line", "yAxis": 0, "name": "Inflows (AR)", "color": "#2ecc71"},
                    "total_outflows": {"type": "line", "yAxis": 0, "name": "Outflows (AP)", "color": "#e74c3c"},
                },
                "yAxis": [
                    {"type": "linear", "title": {"text": "Amount"}},
                ],
                "xAxis": {"type": "category", "labels": {"enabled": True}},
                "series": {"stacking": None},
                "legend": {"enabled": True},
                "sortX": True,
            },
        },
        {
            "name": "Total Cash Now",
            "type": "COUNTER",
            "options": {
                "counterColName": "projected_balance",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
                "defaultColumns": 2,
                "counterLabel": "Total Cash Now",
            },
        },
        {
            "name": "Projected Balance (30 Days)",
            "type": "COUNTER",
            "options": {
                "counterColName": "projected_balance",
                "rowNumber": 2,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
                "defaultColumns": 2,
                "counterLabel": "Projected in 30 Days",
            },
        },
    ],
    # ---- Cashbook: Unmatched Transactions ----
    "unmatched_transactions": [
        {
            "name": "Unmatched Transactions Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "bank_account", "title": "Bank Account", "visible": True},
                    {"name": "bank_name", "title": "Bank", "visible": True},
                    {"name": "statement_date", "title": "Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "description", "title": "Description", "visible": True},
                    {"name": "amount", "title": "Amount", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "reference", "title": "Reference", "visible": True},
                    {"name": "days_outstanding", "title": "Days", "visible": True, "alignContent": "right"},
                    {"name": "aging_bucket", "title": "Age Bucket", "visible": True},
                    {"name": "direction", "title": "Direction", "visible": True},
                ],
            },
        },
    ],
    "unmatched_by_account_summary": [
        {
            "name": "Unmatched by Account Chart",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "bank_account": "x",
                    "unmatched_credits": "y",
                    "unmatched_debits": "y",
                },
                "seriesOptions": {
                    "unmatched_credits": {"type": "column", "yAxis": 0, "name": "Unmatched Credits", "color": "#2ecc71"},
                    "unmatched_debits": {"type": "column", "yAxis": 0, "name": "Unmatched Debits", "color": "#e74c3c"},
                },
                "yAxis": [
                    {"type": "linear", "title": {"text": "Value"}},
                ],
                "xAxis": {"type": "category", "labels": {"enabled": True}},
                "series": {"stacking": "normal"},
                "legend": {"enabled": True},
            },
        },
        {
            "name": "Total Unmatched Value",
            "type": "COUNTER",
            "options": {
                "counterColName": "total_unmatched_value",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
                "defaultColumns": 2,
                "counterLabel": "Total Unmatched Value",
            },
        },
        {
            "name": "Oldest Item Age",
            "type": "COUNTER",
            "options": {
                "counterColName": "oldest_item_age",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 0,
                "tooltipFormat": "0,0",
                "defaultColumns": 2,
                "counterLabel": "Oldest Item (Days)",
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
    "inventory_turnover_dashboard": {
        "name": "Inventory Turnover",
        "tags": ["inventory", "jrny-report", "report:inventory"],
        "widgets": [
            {"query_key": "inventory_turnover", "vis_index": 0, "width": 6},  # Scatter plot
            {"query_key": "inventory_turnover", "vis_index": 1, "width": 6},  # Detail table
        ],
    },
    "abc_analysis_dashboard": {
        "name": "ABC Analysis",
        "tags": ["inventory", "jrny-report", "report:inventory"],
        "widgets": [
            {"query_key": "abc_analysis_summary", "vis_index": 0, "width": 3},    # Summary table
            {"query_key": "abc_analysis_detail", "vis_index": 0, "width": 6},      # Pareto chart
            {"query_key": "abc_analysis_detail", "vis_index": 1, "width": 6},      # Detail table
        ],
    },
    "reorder_recommendations_dashboard": {
        "name": "Reorder Recommendations",
        "tags": ["inventory", "jrny-report", "report:inventory"],
        "widgets": [
            {"query_key": "reorder_recommendations_kpi", "vis_index": 0, "width": 2},  # Items Below Reorder KPI
            {"query_key": "reorder_recommendations_kpi", "vis_index": 1, "width": 2},  # Total Reorder Cost KPI
            {"query_key": "reorder_recommendations", "vis_index": 0, "width": 6},       # Detail Table
        ],
    },
    "pick_pack_dashboard": {
        "name": "Pick & Pack Performance",
        "tags": ["inventory", "jrny-report", "report:inventory"],
        "widgets": [
            {"query_key": "pick_pack_kpi", "vis_index": 0, "width": 2},      # Picks/Hour KPI
            {"query_key": "pick_pack_kpi", "vis_index": 1, "width": 2},      # Fill Rate KPI
            {"query_key": "pick_pack_kpi", "vis_index": 2, "width": 2},      # Fulfilment Time KPI
            {"query_key": "pick_pack_trend", "vis_index": 0, "width": 6},    # Trend chart
            {"query_key": "pick_pack_detail", "vis_index": 0, "width": 6},   # Detail table
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
    "otif_dashboard": {
        "name": "On-Time In-Full (OTIF)",
        "tags": ["procurement", "jrny-report", "report:procurement"],
        "widgets": [
            {"query_key": "otif_kpi", "vis_index": 0, "width": 2},          # OTIF Score KPI
            {"query_key": "otif_kpi", "vis_index": 1, "width": 2},          # On-Time % KPI
            {"query_key": "otif_kpi", "vis_index": 2, "width": 2},          # In-Full % KPI
            {"query_key": "otif_by_supplier", "vis_index": 0, "width": 6},  # Supplier ranking bar chart
            {"query_key": "otif_trend", "vis_index": 0, "width": 6},        # OTIF trend line chart
            {"query_key": "otif_by_supplier", "vis_index": 1, "width": 6},  # Supplier detail table
        ],
    },
    "vendor_scorecard_dashboard": {
        "name": "Vendor Scorecard",
        "tags": ["procurement", "jrny-report", "report:procurement"],
        "widgets": [
            {"query_key": "vendor_scorecard_kpi", "vis_index": 0, "width": 2},           # Total Vendors KPI
            {"query_key": "vendor_scorecard_kpi", "vis_index": 1, "width": 2},           # Avg Composite Score KPI
            {"query_key": "vendor_scorecard_kpi", "vis_index": 2, "width": 2},           # Best Score KPI
            {"query_key": "vendor_scorecard_dimensions", "vis_index": 0, "width": 6},    # Dimension comparison bar chart
            {"query_key": "vendor_scorecard", "vis_index": 0, "width": 6},               # Rankings table
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
    # ---- Cashbook Dashboards ----
    "bank_reconciliation_dashboard": {
        "name": "Bank Reconciliation Status",
        "tags": ["cashbook", "jrny-report", "report:cashbook"],
        "widgets": [
            {"query_key": "bank_reconciliation_status", "vis_index": 1, "width": 6},  # Matched vs Unmatched chart
            {"query_key": "bank_reconciliation_status", "vis_index": 0, "width": 6},  # Summary table
            {"query_key": "bank_recon_unmatched_detail", "vis_index": 0, "width": 6},  # Unmatched detail table
        ],
    },
    "cash_position_dashboard": {
        "name": "Cash Position Summary",
        "tags": ["cashbook", "jrny-report", "report:cashbook"],
        "widgets": [
            {"query_key": "cash_position_projection", "vis_index": 1, "width": 3},  # KPI: Total Cash Now
            {"query_key": "cash_position_projection", "vis_index": 2, "width": 3},  # KPI: Projected 30 Days
            {"query_key": "cash_position_projection", "vis_index": 0, "width": 6},  # Area chart projection
            {"query_key": "cash_position_summary", "vis_index": 0, "width": 6},     # Per-account table
        ],
    },
    "unmatched_transactions_dashboard": {
        "name": "Unmatched Transactions",
        "tags": ["cashbook", "jrny-report", "report:cashbook"],
        "widgets": [
            {"query_key": "unmatched_by_account_summary", "vis_index": 1, "width": 3},  # KPI: Total Unmatched Value
            {"query_key": "unmatched_by_account_summary", "vis_index": 2, "width": 3},  # KPI: Oldest Item Age
            {"query_key": "unmatched_by_account_summary", "vis_index": 0, "width": 6},  # Chart by account
            {"query_key": "unmatched_transactions", "vis_index": 0, "width": 6},         # Detail table
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
