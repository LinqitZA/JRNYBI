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
    - Procurement OTIF (supplier delivery on-time in-full metrics)
    - Purchase Price Variance (PPV KPI, by supplier/product, line detail)
    - Open PO Aging (overdue PO backlog, aging buckets, supplier breakdown)

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
import copy
import json
import logging
import os
import sys
import time
from urllib.parse import urlencode

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

# Default reporting window for the seeded reports.
#
# These MUST fall inside the range of the JRNY demo seed's data or every
# parameterised dashboard opens on a window that predates every row and renders
# an empty chart — which is exactly what happened: the defaults were
# 2024-01-01..2024-12-31 while the demo data runs 2025-04-06..2026-05-02, so
# correct queries against sound views produced nothing and the dashboards looked
# broken.
#
# Aligned to FY2026 (finance.fiscal_years: FY2026 = 2025-03-01..2026-02-28), the
# fiscal year the demo seed is built around, so the date window and DEMO_FISCAL_YEAR
# below describe the same period.
#
# Redash dynamic dates (d_now, d_yesterday) are NOT usable here: only those two
# exist for single-date parameters, and they are resolved CLIENT-side —
# redash/utils/parameterized_query.py has no dynamic handling — so a `d_` value
# would break the server-side first execution this seeder performs. Update these
# constants if the JRNY demo seed's fiscal window moves.
DEMO_PERIOD_START = "2025-03-01"
DEMO_PERIOD_END = "2026-02-28"
DEMO_FISCAL_YEAR = "FY2026"

DATE_PARAMS = [
    {
        "name": "start_date",
        "title": "Start Date",
        "type": "date",
        "value": DEMO_PERIOD_START,
    },
    {
        "name": "end_date",
        "title": "End Date",
        "type": "date",
        "value": DEMO_PERIOD_END,
    },
]

STATUS_PARAM = {
    "name": "status",
    "title": "Status",
    "type": "query",
    "queryId": "po_status_lookup",
    "value": "",
}

# ---------------------------------------------------------------------------
# Lookup queries — small helper queries that populate dropdown parameters.
# Created BEFORE report queries; their IDs are injected into report parameter
# definitions at seed time.
# ---------------------------------------------------------------------------
LOOKUP_QUERIES = {
    "supplier_lookup": {
        "name": "Lookup: Suppliers",
        "description": "Distinct active supplier names for dropdown parameters.",
        "query": "SELECT DISTINCT supplier_name AS supplier_name FROM reporting.v_purchase_orders WHERE supplier_name IS NOT NULL ORDER BY supplier_name",
        "options": {"parameters": []},
        "tags": ["jrny-lookup"],
    },
    "warehouse_lookup": {
        "name": "Lookup: Warehouses",
        "description": "Distinct warehouse names for dropdown parameters.",
        "query": "SELECT DISTINCT warehouse_name FROM reporting.v_inventory_levels WHERE warehouse_name IS NOT NULL ORDER BY warehouse_name",
        "options": {"parameters": []},
        "tags": ["jrny-lookup"],
    },
    "category_lookup": {
        "name": "Lookup: Product Categories",
        "description": "Distinct product categories for dropdown parameters.",
        "query": "SELECT DISTINCT product_category AS category FROM reporting.v_inventory_levels WHERE product_category IS NOT NULL ORDER BY product_category",
        "options": {"parameters": []},
        "tags": ["jrny-lookup"],
    },
    "account_code_lookup": {
        "name": "Lookup: GL Account Codes",
        "description": "Distinct GL account codes for dropdown parameters.",
        "query": "SELECT DISTINCT account_code || ' - ' || account_name AS account_code FROM reporting.v_general_ledger WHERE account_code IS NOT NULL ORDER BY 1",
        "options": {"parameters": []},
        "tags": ["jrny-lookup"],
    },
    "bank_account_lookup": {
        "name": "Lookup: Bank Accounts",
        "description": "Distinct bank account names for dropdown parameters.",
        "query": "SELECT DISTINCT account_name AS bank_account FROM reporting.v_cash_position WHERE account_name IS NOT NULL ORDER BY account_name",
        "options": {"parameters": []},
        "tags": ["jrny-lookup"],
    },
    "po_status_lookup": {
        "name": "Lookup: PO Statuses",
        "description": "Distinct purchase order statuses for dropdown parameters.",
        "query": "SELECT DISTINCT po_status AS status FROM reporting.v_purchase_orders WHERE po_status IS NOT NULL ORDER BY po_status",
        "options": {"parameters": []},
        "tags": ["jrny-lookup"],
    },
    "product_lookup": {
        "name": "Lookup: Products",
        "description": "Distinct product codes for dropdown parameters.",
        "query": "SELECT DISTINCT product_code || ' - ' || product_name AS product_code FROM reporting.v_grn_summary WHERE product_code IS NOT NULL ORDER BY 1",
        "options": {"parameters": []},
        "tags": ["jrny-lookup"],
    },
    "vendor_group_lookup": {
        "name": "Lookup: Vendor Groups",
        "description": "Distinct vendor groups for dropdown parameters.",
        "query": "SELECT DISTINCT supplier_name AS vendor_group FROM reporting.v_purchase_orders WHERE supplier_name IS NOT NULL ORDER BY supplier_name",
        "options": {"parameters": []},
        "tags": ["jrny-lookup"],
    },
    "customer_group_lookup": {
        "name": "Lookup: Customer Groups",
        "description": "Distinct customer type groups for dropdown parameters.",
        "query": "SELECT DISTINCT COALESCE(customer_type, 'Ungrouped') AS customer_group FROM reporting.v_customers WHERE is_active = true ORDER BY 1",
        "options": {"parameters": []},
        "tags": ["jrny-lookup"],
    },
    "movement_type_lookup": {
        "name": "Lookup: Stock Movement Types",
        "description": "Distinct stock movement types for dropdown parameters.",
        "query": "SELECT DISTINCT movement_type FROM reporting.v_stock_movements WHERE movement_type IS NOT NULL ORDER BY movement_type",
        "options": {"parameters": []},
        "tags": ["jrny-lookup"],
    },
}


QUERIES = {
    # ---- Sales ----
    "sales_summary": {
        "name": "Sales Summary - Monthly Revenue",
        "description": "Monthly revenue totals and order counts for the selected date range.",
        "query": """
SELECT
    DATE_TRUNC('month', order_date)::date AS month,
    COUNT(DISTINCT order_id) AS order_count,
    SUM(line_total) AS revenue,
    SUM(line_total) / NULLIF(COUNT(DISTINCT order_id), 0) AS avg_order_value
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
    customer_name,
    customer_code,
    COUNT(DISTINCT order_id) AS order_count,
    SUM(line_total) AS total_revenue,
    MAX(order_date) AS last_order_date
FROM reporting.v_sales_orders
WHERE order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY customer_name, customer_code
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
    product_name,
    product_code,
    product_category AS category,
    SUM(quantity) AS total_qty_sold,
    SUM(line_total) AS total_revenue,
    COUNT(DISTINCT order_id) AS num_orders
FROM reporting.v_sales_orders
WHERE order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY product_name, product_code, product_category
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
    inv.customer_name,
    inv.invoice_number,
    inv.invoice_date,
    inv.due_date,
    inv.invoice_total,
    inv.invoice_balance,
    CASE
        WHEN CURRENT_DATE - inv.due_date <= 0 THEN 'Current'
        WHEN CURRENT_DATE - inv.due_date BETWEEN 1 AND 30 THEN '1-30 Days'
        WHEN CURRENT_DATE - inv.due_date BETWEEN 31 AND 60 THEN '31-60 Days'
        WHEN CURRENT_DATE - inv.due_date BETWEEN 61 AND 90 THEN '61-90 Days'
        ELSE '90+ Days'
    END AS aging_bucket
FROM reporting.v_invoices inv
WHERE inv.invoice_status = 'outstanding'
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
    SUM(COALESCE(debit, 0)) AS inflows,
    SUM(COALESCE(credit, 0)) AS outflows,
    SUM(COALESCE(debit, 0)) - SUM(COALESCE(credit, 0)) AS net_cash_flow
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
    SUM(gl.debit) AS debit,
    SUM(gl.credit) AS credit,
    SUM(gl.net_amount) AS balance
FROM reporting.v_general_ledger gl
WHERE gl.entry_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
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
    il.cost_price,
    il.stock_value_at_cost AS total_value,
    il.reorder_point,
    CASE
        WHEN il.below_reorder_point THEN 'Low Stock'
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
    il.cost_price,
    (il.reorder_point - il.quantity_on_hand) * il.cost_price AS reorder_value
FROM reporting.v_inventory_levels il
WHERE il.below_reorder_point
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
SELECT
    r.product_code,
    r.product_name,
    r.warehouse_name,
    r.quantity_on_hand,
    r.reorder_level,
    r.quantity_shortfall AS shortfall,
    r.reorder_quantity AS suggested_order_qty,
    r.cost_price,
    r.reorder_cost AS estimated_reorder_cost,
    COALESCE(r.last_supplier_name, 'No Supplier on File') AS preferred_supplier
FROM reporting.v_reorder_recommendations r
ORDER BY r.quantity_shortfall DESC;
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
    COALESCE(SUM(r.reorder_cost), 0)::NUMERIC(12,2) AS total_reorder_cost
FROM reporting.v_reorder_recommendations r;
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
        SUM(sm.quantity_out)                                     AS total_issued,
        SUM(sm.quantity_out * sm.unit_cost)                      AS cogs_value,
        COUNT(DISTINCT DATE_TRUNC('day', sm.transaction_date))   AS active_days
    FROM reporting.v_stock_movements sm
    WHERE sm.quantity_out > 0
      AND sm.transaction_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY sm.product_id, sm.warehouse_id
)
SELECT
    il.product_code,
    il.product_name,
    il.product_category                                          AS category,
    il.warehouse_name                                            AS warehouse,
    il.quantity_on_hand                                           AS current_stock,
    il.cost_price                                                AS unit_cost,
    il.stock_value_at_cost                                       AS stock_value,
    COALESCE(pu.total_issued, 0)                                 AS total_issued,
    COALESCE(pu.cogs_value, 0)                                   AS cogs_value,
    CASE
        WHEN il.stock_value_at_cost > 0
          THEN ROUND(COALESCE(pu.cogs_value, 0) / il.stock_value_at_cost, 2)
        ELSE 0
    END                                                          AS turnover_ratio,
    CASE
        WHEN COALESCE(pu.active_days, 0) > 0
          THEN ROUND(pu.total_issued / pu.active_days, 2)
        ELSE 0
    END                                                          AS avg_daily_usage,
    CASE
        WHEN COALESCE(pu.active_days, 0) > 0 AND pu.total_issued > 0
          THEN ROUND(il.quantity_on_hand / (pu.total_issued / pu.active_days), 0)
        ELSE NULL
    END                                                          AS days_of_stock,
    CASE
        WHEN COALESCE(pu.active_days, 0) = 0 THEN 'No Movement'
        WHEN COALESCE(pu.cogs_value, 0) /
             NULLIF(il.stock_value_at_cost, 0) >= 4
          THEN 'Fast Mover'
        WHEN COALESCE(pu.cogs_value, 0) /
             NULLIF(il.stock_value_at_cost, 0) >= 1
          THEN 'Normal'
        ELSE 'Slow Mover'
    END                                                          AS turnover_class
FROM reporting.v_inventory_levels il
LEFT JOIN period_usage pu ON pu.product_id = il.product_id
                          AND pu.warehouse_id = il.warehouse_id
WHERE il.quantity_on_hand > 0
  AND ('{{ category }}' = '' OR il.product_category = '{{ category }}')
ORDER BY turnover_ratio DESC;
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "category",
                    "title": "Product Category",
                    "type": "query",
                    "queryId": "category_lookup",
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
        so.product_id,
        so.product_code,
        so.product_name,
        so.product_category AS category,
        SUM(so.quantity) AS total_qty_sold,
        SUM(so.line_total) AS total_revenue
    FROM reporting.v_sales_orders so
    WHERE so.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY so.product_id, so.product_code, so.product_name, so.product_category
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
        COALESCE(il_agg.current_stock, 0) AS current_stock,
        COALESCE(il_agg.stock_value, 0) AS stock_value,
        CASE
            WHEN r.cumulative_pct <= 80 THEN 'A'
            WHEN r.cumulative_pct <= 95 THEN 'B'
            ELSE 'C'
        END AS abc_class
    FROM ranked r
    LEFT JOIN LATERAL (
        SELECT
            SUM(il.quantity_on_hand) AS current_stock,
            SUM(il.stock_value_at_cost)::NUMERIC(12,2) AS stock_value
        FROM reporting.v_inventory_levels il
        WHERE il.product_id = r.product_id
          AND il.quantity_on_hand > 0
    ) il_agg ON TRUE
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
        so.product_id,
        SUM(so.line_total) AS total_revenue
    FROM reporting.v_sales_orders so
    WHERE so.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY so.product_id
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
    COALESCE(SUM(il_agg.stock_value), 0) AS stock_value
FROM classified c
LEFT JOIN LATERAL (
    SELECT SUM(il.stock_value_at_cost)::NUMERIC(12,2) AS stock_value
    FROM reporting.v_inventory_levels il
    WHERE il.product_id = c.product_id AND il.quantity_on_hand > 0
) il_agg ON TRUE
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
    ROUND(AVG(pp.total_qty_picked), 1) AS avg_lines_per_order,
    CASE
        WHEN SUM(pp.pick_duration_minutes) > 0
          THEN ROUND(SUM(pp.total_qty_picked) / (SUM(pp.pick_duration_minutes) / 60.0), 1)
        ELSE 0
    END AS picks_per_hour,
    ROUND(AVG(100.0 * pp.total_qty_picked / NULLIF(pp.total_quantity, 0)), 1) AS avg_fill_rate_pct,
    ROUND(AVG(COALESCE(pp.pick_duration_minutes, 0) + COALESCE(pp.pack_duration_minutes, 0)), 1) AS avg_fulfilment_mins,
    ROUND(AVG(pp.pick_duration_minutes), 1) AS avg_pick_mins,
    ROUND(AVG(pp.pack_duration_minutes), 1) AS avg_pack_mins
FROM reporting.v_pick_pack_performance pp
WHERE pp.pick_created_at::DATE BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND pp.pick_status != 'cancelled';
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["inventory", "jrny-report"],
    },
    "pick_pack_trend": {
        "name": "Pick & Pack Performance - Daily Trend",
        "description": "Daily trends: picks per hour, fill rate, and fulfilment time over the selected period.",
        "query": """
SELECT
    pp.pick_created_at::DATE AS date,
    COUNT(*) AS deliveries,
    ROUND(AVG(pp.total_qty_picked), 1) AS avg_lines_per_order,
    CASE
        WHEN SUM(pp.pick_duration_minutes) > 0
          THEN ROUND(SUM(pp.total_qty_picked) / (SUM(pp.pick_duration_minutes) / 60.0), 1)
        ELSE 0
    END AS picks_per_hour,
    ROUND(AVG(100.0 * pp.total_qty_picked / NULLIF(pp.total_quantity, 0)), 1) AS avg_fill_rate_pct,
    ROUND(AVG(COALESCE(pp.pick_duration_minutes, 0) + COALESCE(pp.pack_duration_minutes, 0)), 1) AS avg_fulfilment_mins
FROM reporting.v_pick_pack_performance pp
WHERE pp.pick_created_at::DATE BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND pp.pick_status != 'cancelled'
GROUP BY pp.pick_created_at::DATE
ORDER BY pp.pick_created_at::DATE;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["inventory", "jrny-report"],
    },
    "pick_pack_detail": {
        "name": "Pick & Pack Performance - Detail",
        "description": "Per-delivery pick and pack performance metrics.",
        "query": """
SELECT
    pp.pick_number AS delivery_number,
    pp.sales_order_number AS order_number,
    pp.pick_created_at::DATE AS delivery_date,
    pp.pick_status AS status,
    pp.total_quantity AS ordered_qty,
    pp.total_qty_picked AS shipped_qty,
    ROUND(100.0 * pp.total_qty_picked / NULLIF(pp.total_quantity, 0), 1) AS fill_rate_pct,
    ROUND(pp.pick_duration_minutes, 1) AS pick_mins,
    ROUND(pp.pack_duration_minutes, 1) AS pack_mins,
    ROUND(COALESCE(pp.pick_duration_minutes, 0) + COALESCE(pp.pack_duration_minutes, 0), 1) AS total_mins,
    CASE
        WHEN pp.pick_duration_minutes > 0
          THEN ROUND(pp.total_qty_picked / (pp.pick_duration_minutes / 60.0), 1)
        ELSE NULL
    END AS picks_per_hour
FROM reporting.v_pick_pack_performance pp
WHERE pp.pick_created_at::DATE BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND pp.pick_status != 'cancelled'
ORDER BY pp.pick_created_at DESC, pp.pick_number;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["inventory", "jrny-report"],
    },
    "purchase_order_status": {
        "name": "Purchase Order Status",
        "description": "Purchase order pipeline grouped by status.",
        "query": """
SELECT
    po.po_status AS status,
    COUNT(DISTINCT po.po_id) AS po_count,
    SUM(po.po_total)::numeric(12,2) AS total_value,
    MIN(po.po_date) AS earliest_order,
    MAX(po.po_date) AS latest_order
FROM reporting.v_purchase_orders po
WHERE po.po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ status }}' = '' OR po.po_status = '{{ status }}')
GROUP BY po.po_status
ORDER BY po.po_status;
""".strip(),
        "options": {"parameters": DATE_PARAMS + [STATUS_PARAM]},
        "tags": ["procurement", "jrny-report"],
    },
    "supplier_spend_analysis": {
        "name": "Supplier Spend Analysis",
        "description": "Supplier spending ranked by total purchase value.",
        "query": """
SELECT
    po.supplier_name,
    po.supplier_code,
    COUNT(DISTINCT po.po_id) AS po_count,
    SUM(po.po_total)::numeric(12,2) AS total_spend,
    AVG(po.po_total)::numeric(12,2) AS avg_po_value,
    MAX(po.po_date) AS last_order_date
FROM reporting.v_purchase_orders po
WHERE po.po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY po.supplier_name, po.supplier_code
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
    ROUND(AVG(CASE WHEN last_received_date > expected_delivery_date
        THEN (last_received_date - expected_delivery_date)
        ELSE 0 END), 1) AS avg_days_late
FROM reporting.v_otif
WHERE po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR vendor_name ILIKE '%' || '{{ supplier_name }}' || '%');
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "query", "queryId": "supplier_lookup", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    "otif_by_supplier": {
        "name": "OTIF - Supplier Ranking",
        "description": "Supplier OTIF scores ranked by delivery performance.",
        "query": """
SELECT
    vendor_name AS supplier_name,
    COUNT(*) AS total_lines,
    SUM(CASE WHEN is_on_time THEN 1 ELSE 0 END) AS on_time_count,
    ROUND(100.0 * SUM(CASE WHEN is_on_time THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS on_time_pct,
    SUM(CASE WHEN is_in_full THEN 1 ELSE 0 END) AS in_full_count,
    ROUND(100.0 * SUM(CASE WHEN is_in_full THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS in_full_pct,
    SUM(CASE WHEN is_otif THEN 1 ELSE 0 END) AS otif_count,
    ROUND(100.0 * SUM(CASE WHEN is_otif THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS otif_pct,
    ROUND(AVG(CASE WHEN last_received_date > expected_delivery_date
        THEN (last_received_date - expected_delivery_date)
        ELSE 0 END), 1) AS avg_days_late
FROM reporting.v_otif
WHERE po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR vendor_name ILIKE '%' || '{{ supplier_name }}' || '%')
GROUP BY vendor_name
ORDER BY otif_pct DESC;
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "query", "queryId": "supplier_lookup", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    "otif_trend": {
        "name": "OTIF - Monthly Trend",
        "description": "Monthly OTIF trend showing on-time, in-full, and combined OTIF percentages over time.",
        "query": """
SELECT
    DATE_TRUNC('month', po_date)::date AS month,
    COUNT(*) AS total_lines,
    ROUND(100.0 * SUM(CASE WHEN is_on_time THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS on_time_pct,
    ROUND(100.0 * SUM(CASE WHEN is_in_full THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS in_full_pct,
    ROUND(100.0 * SUM(CASE WHEN is_otif THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS otif_pct
FROM reporting.v_otif
WHERE po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR vendor_name ILIKE '%' || '{{ supplier_name }}' || '%')
GROUP BY DATE_TRUNC('month', po_date)
ORDER BY month;
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "query", "queryId": "supplier_lookup", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    # ---- Procurement: Purchase Price Variance (PPV) ----
    "ppv_kpi": {
        "name": "PPV - KPI Summary",
        "description": "Purchase Price Variance KPI summary: total PPV, average %, favourable vs unfavourable breakdown.",
        "query": """
SELECT
    COUNT(*) AS total_lines,
    ROUND(SUM((grn.unit_cost - po.unit_cost) * grn.received_quantity), 2) AS total_ppv,
    ROUND(AVG(CASE WHEN po.unit_cost > 0 THEN 100.0 * (grn.unit_cost - po.unit_cost) / po.unit_cost ELSE 0 END), 2) AS avg_ppv_pct,
    SUM(CASE WHEN grn.unit_cost > po.unit_cost THEN (grn.unit_cost - po.unit_cost) * grn.received_quantity ELSE 0 END)::numeric(12,2) AS unfavourable_total,
    SUM(CASE WHEN grn.unit_cost < po.unit_cost THEN (po.unit_cost - grn.unit_cost) * grn.received_quantity ELSE 0 END)::numeric(12,2) AS favourable_total,
    SUM(po.unit_cost * grn.received_quantity)::numeric(12,2) AS total_po_value,
    SUM(grn.unit_cost * grn.received_quantity)::numeric(12,2) AS total_grn_value
FROM reporting.v_grn_summary grn
JOIN reporting.v_purchase_orders po
  ON po.po_id = grn.po_id AND po.product_id = grn.product_id
WHERE grn.received_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR grn.vendor_name ILIKE '%' || '{{ supplier_name }}' || '%')
  AND ('{{ product_code }}' = '' OR grn.product_code ILIKE '%' || '{{ product_code }}' || '%')
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "query", "queryId": "supplier_lookup", "value": ""},
            {"name": "product_code", "title": "Product Code", "type": "query", "queryId": "product_lookup", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    "ppv_by_supplier": {
        "name": "PPV - By Supplier",
        "description": "Purchase Price Variance breakdown by supplier showing favourable and unfavourable variances.",
        "query": """
SELECT
    grn.vendor_name AS supplier_name,
    COUNT(*) AS receipt_lines,
    SUM(po.unit_cost * grn.received_quantity)::numeric(12,2) AS total_po_value,
    SUM(grn.unit_cost * grn.received_quantity)::numeric(12,2) AS total_grn_value,
    ROUND(SUM((grn.unit_cost - po.unit_cost) * grn.received_quantity), 2) AS total_ppv,
    ROUND(AVG(CASE WHEN po.unit_cost > 0 THEN 100.0 * (grn.unit_cost - po.unit_cost) / po.unit_cost ELSE 0 END), 2) AS avg_ppv_pct,
    SUM(CASE WHEN grn.unit_cost > po.unit_cost THEN (grn.unit_cost - po.unit_cost) * grn.received_quantity ELSE 0 END)::numeric(12,2) AS unfavourable,
    SUM(CASE WHEN grn.unit_cost < po.unit_cost THEN (po.unit_cost - grn.unit_cost) * grn.received_quantity ELSE 0 END)::numeric(12,2) AS favourable
FROM reporting.v_grn_summary grn
JOIN reporting.v_purchase_orders po
  ON po.po_id = grn.po_id AND po.product_id = grn.product_id
WHERE grn.received_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR grn.vendor_name ILIKE '%' || '{{ supplier_name }}' || '%')
  AND ('{{ product_code }}' = '' OR grn.product_code ILIKE '%' || '{{ product_code }}' || '%')
GROUP BY grn.vendor_name
ORDER BY ABS(SUM((grn.unit_cost - po.unit_cost) * grn.received_quantity)) DESC
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "query", "queryId": "supplier_lookup", "value": ""},
            {"name": "product_code", "title": "Product Code", "type": "query", "queryId": "product_lookup", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    "ppv_by_product": {
        "name": "PPV - By Product",
        "description": "Purchase Price Variance breakdown by product showing average PO vs GRN prices and total variance.",
        "query": """
SELECT
    grn.product_code,
    grn.product_name,
    COUNT(*) AS receipt_lines,
    ROUND(AVG(po.unit_cost), 2) AS avg_po_price,
    ROUND(AVG(grn.unit_cost), 2) AS avg_grn_price,
    ROUND(AVG(grn.unit_cost - po.unit_cost), 2) AS avg_ppv_per_unit,
    ROUND(SUM((grn.unit_cost - po.unit_cost) * grn.received_quantity), 2) AS total_ppv,
    ROUND(AVG(CASE WHEN po.unit_cost > 0 THEN 100.0 * (grn.unit_cost - po.unit_cost) / po.unit_cost ELSE 0 END), 2) AS avg_ppv_pct,
    SUM(grn.received_quantity)::numeric(12,2) AS total_received_qty
FROM reporting.v_grn_summary grn
JOIN reporting.v_purchase_orders po
  ON po.po_id = grn.po_id AND po.product_id = grn.product_id
WHERE grn.received_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR grn.vendor_name ILIKE '%' || '{{ supplier_name }}' || '%')
  AND ('{{ product_code }}' = '' OR grn.product_code ILIKE '%' || '{{ product_code }}' || '%')
GROUP BY grn.product_code, grn.product_name
ORDER BY ABS(SUM((grn.unit_cost - po.unit_cost) * grn.received_quantity)) DESC
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "query", "queryId": "supplier_lookup", "value": ""},
            {"name": "product_code", "title": "Product Code", "type": "query", "queryId": "product_lookup", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    "ppv_detail": {
        "name": "PPV - Line Detail",
        "description": "Purchase Price Variance at individual receipt line level showing PO vs GRN unit costs.",
        "query": """
SELECT
    po.po_number,
    grn.grn_number,
    grn.vendor_name AS supplier_name,
    grn.product_code,
    grn.product_name,
    grn.received_date,
    grn.ordered_quantity,
    grn.received_quantity,
    po.unit_cost AS po_unit_cost,
    grn.unit_cost AS grn_unit_cost,
    ROUND(grn.unit_cost - po.unit_cost, 2) AS ppv_per_unit,
    ROUND((grn.unit_cost - po.unit_cost) * grn.received_quantity, 2) AS ppv_amount,
    CASE WHEN po.unit_cost > 0
        THEN ROUND(100.0 * (grn.unit_cost - po.unit_cost) / po.unit_cost, 2)
        ELSE 0
    END AS ppv_pct,
    CASE
        WHEN grn.unit_cost > po.unit_cost THEN 'Unfavourable'
        WHEN grn.unit_cost < po.unit_cost THEN 'Favourable'
        ELSE 'No Variance'
    END AS variance_type
FROM reporting.v_grn_summary grn
JOIN reporting.v_purchase_orders po
  ON po.po_id = grn.po_id AND po.product_id = grn.product_id
WHERE grn.received_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR grn.vendor_name ILIKE '%' || '{{ supplier_name }}' || '%')
  AND ('{{ product_code }}' = '' OR grn.product_code ILIKE '%' || '{{ product_code }}' || '%')
ORDER BY ABS((grn.unit_cost - po.unit_cost) * grn.received_quantity) DESC
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "query", "queryId": "supplier_lookup", "value": ""},
            {"name": "product_code", "title": "Product Code", "type": "query", "queryId": "product_lookup", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    # ---- Procurement: Open PO Aging ----
    "open_po_kpi": {
        "name": "Open PO - KPI Summary",
        "description": "Key metrics for outstanding purchase orders: count, value, overdue percentage.",
        "query": """
SELECT
    COUNT(*) AS open_po_count,
    SUM(po_total)::numeric(12,2) AS total_open_value,
    SUM(CASE WHEN days_overdue > 0 THEN 1 ELSE 0 END) AS overdue_count,
    SUM(CASE WHEN days_overdue > 0 THEN po_total ELSE 0 END)::numeric(12,2) AS overdue_value,
    ROUND(100.0 * SUM(CASE WHEN days_overdue > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS overdue_pct,
    ROUND(AVG(CURRENT_DATE - po_date), 0) AS avg_days_open
FROM reporting.v_open_po_aging
WHERE po_date >= '{{ start_date }}'
  AND po_date <= '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR supplier_name ILIKE '%' || '{{ supplier_name }}' || '%')
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "query", "queryId": "supplier_lookup", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    "open_po_aging": {
        "name": "Open PO - Aging Buckets",
        "description": "Outstanding PO value and count by overdue aging bucket.",
        "query": """
SELECT
    aging_bucket,
    COUNT(*) AS po_count,
    SUM(po_total)::numeric(12,2) AS total_value
FROM reporting.v_open_po_aging
WHERE po_date >= '{{ start_date }}'
  AND po_date <= '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR supplier_name ILIKE '%' || '{{ supplier_name }}' || '%')
GROUP BY aging_bucket
ORDER BY
  CASE aging_bucket
    WHEN 'No Date' THEN 0
    WHEN 'Not Due' THEN 1
    WHEN '1-7 Days' THEN 2
    WHEN '8-14 Days' THEN 3
    WHEN '15-30 Days' THEN 4
    WHEN '31-60 Days' THEN 5
    WHEN '61-90 Days' THEN 6
    WHEN '90+ Days' THEN 7
  END
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "query", "queryId": "supplier_lookup", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    "open_po_detail": {
        "name": "Open PO - Detail",
        "description": "Detailed list of all open purchase orders with supplier, value, aging, and delivery status.",
        "query": """
SELECT
    po_number,
    supplier_name,
    po_status AS status,
    po_date,
    expected_delivery_date,
    po_total,
    days_overdue,
    aging_bucket
FROM reporting.v_open_po_aging
WHERE po_date >= '{{ start_date }}'
  AND po_date <= '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR supplier_name ILIKE '%' || '{{ supplier_name }}' || '%')
ORDER BY days_overdue DESC, po_total DESC
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "query", "queryId": "supplier_lookup", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    "open_po_by_supplier": {
        "name": "Open PO - By Supplier",
        "description": "Open PO summary by supplier showing total value, overdue value, and average days open.",
        "query": """
SELECT
    supplier_name,
    COUNT(*) AS po_count,
    SUM(po_total)::numeric(12,2) AS total_value,
    SUM(CASE WHEN days_overdue > 0 THEN po_total ELSE 0 END)::numeric(12,2) AS overdue_value,
    ROUND(AVG(CURRENT_DATE - po_date), 0) AS avg_days_open,
    MAX(days_overdue) AS max_days_overdue
FROM reporting.v_open_po_aging
WHERE po_date >= '{{ start_date }}'
  AND po_date <= '{{ end_date }}'
  AND ('{{ supplier_name }}' = '' OR supplier_name ILIKE '%' || '{{ supplier_name }}' || '%')
GROUP BY supplier_name
ORDER BY SUM(po_total) DESC
""".strip(),
        "options": {"parameters": DATE_PARAMS + [
            {"name": "supplier_name", "title": "Supplier Name", "type": "query", "queryId": "supplier_lookup", "value": ""},
        ]},
        "tags": ["procurement", "jrny-report"],
    },
    # ---- Procurement: Vendor Scorecard ----
    "vendor_scorecard": {
        "name": "Vendor Scorecard - Performance Rankings",
        "description": "Composite vendor performance scores combining OTIF, quality (inspection pass rate), price variance, and delivery timeliness. Supports vendor rationalization and negotiation.",
        "query": """
WITH otif_scores AS (
    SELECT
        vendor_id,
        vendor_name,
        COUNT(*) AS total_lines,
        ROUND(100.0 * SUM(CASE WHEN is_otif THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS otif_pct,
        ROUND(100.0 * SUM(CASE WHEN is_on_time THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS delivery_score
    FROM reporting.v_otif
    WHERE po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY vendor_id, vendor_name
),
lead_times AS (
    SELECT
        vendor_id,
        supplier_name,
        supplier_code,
        COUNT(*) AS total_receipts,
        ROUND(AVG(lead_time_days), 1) AS avg_lead_time_days
    FROM reporting.v_procurement_lead_time
    WHERE po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY vendor_id, supplier_name, supplier_code
),
quality_scores AS (
    SELECT
        vendor_id,
        COUNT(*) AS total_grn_lines,
        ROUND(100.0 * SUM(CASE WHEN quantity_variance >= 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS quality_pct
    FROM reporting.v_grn_summary
    WHERE received_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY vendor_id
),
price_scores AS (
    SELECT
        grn.vendor_id,
        ROUND(AVG(CASE WHEN po.unit_cost > 0 THEN 100.0 * (grn.unit_cost - po.unit_cost) / po.unit_cost ELSE 0 END), 2) AS price_variance_pct
    FROM reporting.v_grn_summary grn
    JOIN reporting.v_purchase_orders po ON po.po_id = grn.po_id AND po.product_id = grn.product_id
    WHERE grn.received_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY grn.vendor_id
)
SELECT
    COALESCE(o.vendor_name, lt.supplier_name) AS supplier_name,
    COALESCE(lt.supplier_code, '') AS supplier_code,
    COALESCE(o.total_lines, 0) AS total_lines,
    COALESCE(o.otif_pct, 0) AS otif_pct,
    COALESCE(q.quality_pct, 100) AS quality_pct,
    ROUND(100 - ABS(COALESCE(ps.price_variance_pct, 0)), 2) AS price_score,
    COALESCE(o.delivery_score, 0) AS delivery_score,
    ROUND((COALESCE(o.otif_pct, 0) * 0.35
         + COALESCE(q.quality_pct, 100) * 0.25
         + (100 - ABS(COALESCE(ps.price_variance_pct, 0))) * 0.20
         + COALESCE(o.delivery_score, 0) * 0.20), 1) AS composite_score,
    CASE
        WHEN ROUND((COALESCE(o.otif_pct, 0) * 0.35 + COALESCE(q.quality_pct, 100) * 0.25 + (100 - ABS(COALESCE(ps.price_variance_pct, 0))) * 0.20 + COALESCE(o.delivery_score, 0) * 0.20), 1) >= 90 THEN 'Preferred'
        WHEN ROUND((COALESCE(o.otif_pct, 0) * 0.35 + COALESCE(q.quality_pct, 100) * 0.25 + (100 - ABS(COALESCE(ps.price_variance_pct, 0))) * 0.20 + COALESCE(o.delivery_score, 0) * 0.20), 1) >= 70 THEN 'Approved'
        WHEN ROUND((COALESCE(o.otif_pct, 0) * 0.35 + COALESCE(q.quality_pct, 100) * 0.25 + (100 - ABS(COALESCE(ps.price_variance_pct, 0))) * 0.20 + COALESCE(o.delivery_score, 0) * 0.20), 1) >= 50 THEN 'Conditional'
        ELSE 'Under Review'
    END AS vendor_tier,
    COALESCE(lt.avg_lead_time_days, 0) AS avg_lead_time_days
FROM otif_scores o
FULL OUTER JOIN lead_times lt ON lt.vendor_id = o.vendor_id
LEFT JOIN quality_scores q ON q.vendor_id = COALESCE(o.vendor_id, lt.vendor_id)
LEFT JOIN price_scores ps ON ps.vendor_id = COALESCE(o.vendor_id, lt.vendor_id)
WHERE ('{{ vendor_group }}' = '' OR TRUE)
ORDER BY composite_score DESC;
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "vendor_group",
                    "title": "Vendor Group",
                    "type": "query",
                    "queryId": "vendor_group_lookup",
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
WITH vendor_scores AS (
    SELECT
        o.vendor_name AS supplier_name,
        o.vendor_id,
        ROUND(100.0 * SUM(CASE WHEN o.is_otif THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS otif_pct,
        ROUND(100.0 * SUM(CASE WHEN o.is_on_time THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS delivery_score
    FROM reporting.v_otif o
    WHERE o.po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY o.vendor_name, o.vendor_id
),
quality AS (
    SELECT vendor_id,
        ROUND(100.0 * SUM(CASE WHEN quantity_variance >= 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS quality_pct
    FROM reporting.v_grn_summary
    WHERE received_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY vendor_id
),
price AS (
    SELECT grn.vendor_id,
        ROUND(100 - ABS(AVG(CASE WHEN po.unit_cost > 0 THEN 100.0 * (grn.unit_cost - po.unit_cost) / po.unit_cost ELSE 0 END)), 2) AS price_score
    FROM reporting.v_grn_summary grn
    JOIN reporting.v_purchase_orders po ON po.po_id = grn.po_id AND po.product_id = grn.product_id
    WHERE grn.received_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY grn.vendor_id
)
SELECT supplier_name, 'OTIF' AS dimension, otif_pct AS score FROM vendor_scores
UNION ALL
SELECT vs.supplier_name, 'Quality', COALESCE(q.quality_pct, 100) FROM vendor_scores vs LEFT JOIN quality q ON q.vendor_id = vs.vendor_id
UNION ALL
SELECT vs.supplier_name, 'Price', COALESCE(p.price_score, 100) FROM vendor_scores vs LEFT JOIN price p ON p.vendor_id = vs.vendor_id
UNION ALL
SELECT supplier_name, 'Delivery', delivery_score FROM vendor_scores
ORDER BY supplier_name, dimension;
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "vendor_group",
                    "title": "Vendor Group",
                    "type": "query",
                    "queryId": "vendor_group_lookup",
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
WITH otif_scores AS (
    SELECT vendor_id,
        ROUND(100.0 * SUM(CASE WHEN is_otif THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS otif_pct,
        ROUND(100.0 * SUM(CASE WHEN is_on_time THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS delivery_score
    FROM reporting.v_otif
    WHERE po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY vendor_id
),
quality_scores AS (
    SELECT vendor_id,
        ROUND(100.0 * SUM(CASE WHEN quantity_variance >= 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS quality_pct
    FROM reporting.v_grn_summary
    WHERE received_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY vendor_id
),
price_scores AS (
    SELECT grn.vendor_id,
        ROUND(AVG(CASE WHEN po.unit_cost > 0 THEN 100.0 * (grn.unit_cost - po.unit_cost) / po.unit_cost ELSE 0 END), 2) AS price_variance_pct
    FROM reporting.v_grn_summary grn
    JOIN reporting.v_purchase_orders po ON po.po_id = grn.po_id AND po.product_id = grn.product_id
    WHERE grn.received_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY grn.vendor_id
),
composites AS (
    SELECT
        o.vendor_id,
        ROUND((o.otif_pct * 0.35 + COALESCE(q.quality_pct, 100) * 0.25 + (100 - ABS(COALESCE(ps.price_variance_pct, 0))) * 0.20 + o.delivery_score * 0.20), 1) AS composite_score
    FROM otif_scores o
    LEFT JOIN quality_scores q ON q.vendor_id = o.vendor_id
    LEFT JOIN price_scores ps ON ps.vendor_id = o.vendor_id
)
SELECT
    COUNT(DISTINCT vendor_id) AS total_vendors,
    ROUND(AVG(composite_score), 1) AS avg_composite_score,
    MAX(composite_score) AS best_score,
    MIN(composite_score) AS worst_score
FROM composites;
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "vendor_group",
                    "title": "Vendor Group",
                    "type": "query",
                    "queryId": "vendor_group_lookup",
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
    JOIN reporting.v_suppliers s ON s.supplier_id = r.supplier_id
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
JOIN reporting.v_suppliers s ON s.supplier_id = r.supplier_id
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
    # ---- Procurement: Lead Time Analysis ----
    "procurement_lead_time_vendor": {
        "name": "Procurement Lead Time - By Vendor",
        "description": "Average, min, and max lead time (PO order date to goods receipt date) by vendor. Identifies slow suppliers and on-time delivery performance.",
        "query": """
SELECT
    supplier_name,
    supplier_code,
    COUNT(*) AS total_receipts,
    ROUND(AVG(lead_time_days), 1) AS avg_lead_time_days,
    MIN(lead_time_days) AS min_lead_time_days,
    MAX(lead_time_days) AS max_lead_time_days,
    ROUND(STDDEV(lead_time_days::numeric), 1) AS stddev_lead_time
FROM reporting.v_procurement_lead_time
WHERE po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY supplier_name, supplier_code
ORDER BY avg_lead_time_days DESC;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["procurement", "jrny-report", "report:procurement"],
    },
    "procurement_lead_time_category": {
        "name": "Procurement Lead Time - By Product Category",
        "description": "Lead time statistics by product category to identify which categories take longest to receive and support safety stock calculations.",
        "query": """
SELECT
    product_category,
    COUNT(*) AS total_receipts,
    ROUND(AVG(lead_time_days), 1) AS avg_lead_time_days,
    MIN(lead_time_days) AS min_lead_time_days,
    MAX(lead_time_days) AS max_lead_time_days,
    ROUND(STDDEV(lead_time_days::numeric), 1) AS stddev_lead_time,
    ROUND(AVG(lead_time_days) + 2 * COALESCE(STDDEV(lead_time_days::numeric), 0), 0) AS safety_lead_time_days
FROM reporting.v_procurement_lead_time
WHERE po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY product_category
ORDER BY avg_lead_time_days DESC;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["procurement", "jrny-report", "report:procurement"],
    },
    "procurement_lead_time_trend": {
        "name": "Procurement Lead Time - Monthly Trend",
        "description": "Monthly trend of average lead time by vendor, showing how delivery performance changes over time.",
        "query": """
SELECT
    TO_CHAR(DATE_TRUNC('month', po_date), 'YYYY-MM') AS order_month,
    supplier_name,
    COUNT(*) AS receipts,
    ROUND(AVG(lead_time_days), 1) AS avg_lead_time_days
FROM reporting.v_procurement_lead_time
WHERE po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY DATE_TRUNC('month', po_date), TO_CHAR(DATE_TRUNC('month', po_date), 'YYYY-MM'), supplier_name
ORDER BY order_month, supplier_name;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["procurement", "jrny-report", "report:procurement"],
    },
    "procurement_lead_time_kpi": {
        "name": "Procurement Lead Time - KPIs",
        "description": "Summary KPIs for procurement lead times: overall average, on-time delivery rate, total receipts.",
        "query": """
SELECT
    COUNT(*) AS total_receipts,
    ROUND(AVG(lead_time_days), 1) AS avg_lead_time_days,
    MIN(lead_time_days) AS fastest_lead_time,
    MAX(lead_time_days) AS slowest_lead_time,
    COUNT(DISTINCT vendor_id) AS total_vendors
FROM reporting.v_procurement_lead_time
WHERE po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}';
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
      AND gl.entry_date < '{{ start_date }}'
),
activity AS (
    SELECT
        gl.entry_date,
        gl.account_code,
        gl.account_name,
        gl.account_type,
        gl.debit,
        gl.credit,
        gl.net_amount
    FROM reporting.v_general_ledger gl
    WHERE gl.account_code = '{{ account_code }}'
      AND gl.entry_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
)
SELECT
    a.entry_date,
    a.account_code,
    a.account_name,
    a.account_type,
    a.debit,
    a.credit,
    a.net_amount,
    (SELECT opening_balance FROM opening)
        + SUM(a.net_amount) OVER (ORDER BY a.entry_date, a.debit DESC ROWS UNBOUNDED PRECEDING)
        AS running_balance
FROM activity a
ORDER BY a.entry_date, a.debit DESC;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "account_code",
                    "title": "Account Code",
                    "type": "query",
                    "queryId": "account_code_lookup",
                    "value": "",
                },
                {
                    "name": "start_date",
                    "title": "Start Date",
                    "type": "date",
                    "value": DEMO_PERIOD_START,
                },
                {
                    "name": "end_date",
                    "title": "End Date",
                    "type": "date",
                    "value": DEMO_PERIOD_END,
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
      AND entry_date < '{{ start_date }}'
) ob ON TRUE
LEFT JOIN LATERAL (
    SELECT
        SUM(debit) AS total_debit,
        SUM(credit) AS total_credit,
        SUM(debit - credit) AS total_net,
        COUNT(*) AS transaction_count
    FROM reporting.v_general_ledger
    WHERE account_code = '{{ account_code }}'
      AND entry_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
) act ON TRUE;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "account_code",
                    "title": "Account Code",
                    "type": "query",
                    "queryId": "account_code_lookup",
                    "value": "",
                },
                {
                    "name": "start_date",
                    "title": "Start Date",
                    "type": "date",
                    "value": DEMO_PERIOD_START,
                },
                {
                    "name": "end_date",
                    "title": "End Date",
                    "type": "date",
                    "value": DEMO_PERIOD_END,
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
    ap.vendor_name,
    ap.invoice_number,
    ap.invoice_date,
    ap.due_date,
    ap.total_oc,
    ap.amount_paid_oc,
    ap.balance_oc,
    ap.invoice_status,
    ap.aging_bucket,
    ap.days_overdue
FROM reporting.v_ap_aging ap
WHERE ap.due_date <= '{{ as_at_date }}'
   OR ap.invoice_status = 'open'
ORDER BY ap.days_overdue DESC, ap.balance_oc DESC;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "as_at_date",
                    "title": "As-At Date",
                    "type": "date",
                    "value": DEMO_PERIOD_END,
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
    DATE_TRUNC('month', cn.credit_note_date)::DATE    AS month,
    cn.reason,
    COUNT(DISTINCT cn.credit_note_id)                AS credit_note_count,
    SUM(cn.line_total)                               AS credit_note_value,
    COALESCE(rev.gross_revenue, 0)                   AS gross_revenue,
    CASE
        WHEN COALESCE(rev.gross_revenue, 0) > 0
        THEN ROUND(100.0 * SUM(cn.line_total) / rev.gross_revenue, 2)
        ELSE 0
    END                                              AS cn_rate_pct
FROM reporting.v_credit_notes cn
LEFT JOIN (
    SELECT
        DATE_TRUNC('month', order_date)::DATE AS month,
        SUM(line_total)                       AS gross_revenue
    FROM reporting.v_sales_orders
    WHERE order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
    GROUP BY DATE_TRUNC('month', order_date)
) rev ON rev.month = DATE_TRUNC('month', cn.credit_note_date)::DATE
WHERE cn.credit_note_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY DATE_TRUNC('month', cn.credit_note_date)::DATE, cn.reason, rev.gross_revenue
ORDER BY month, cn.reason;
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
    cn.line_description,
    cn.quantity,
    cn.unit_price,
    cn.line_total,
    cn.invoice_number,
    cn.credit_note_status
FROM reporting.v_credit_notes cn
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
        WHEN ptc.days_late <= 7 THEN '0-7 days'
        WHEN ptc.days_late <= 14 THEN '8-14 days'
        WHEN ptc.days_late <= 21 THEN '15-21 days'
        WHEN ptc.days_late <= 30 THEN '22-30 days'
        WHEN ptc.days_late <= 45 THEN '31-45 days'
        WHEN ptc.days_late <= 60 THEN '46-60 days'
        WHEN ptc.days_late <= 90 THEN '61-90 days'
        ELSE '90+ days'
    END                                        AS days_to_pay_bucket,
    ptc.compliance_status,
    COUNT(*)                                   AS invoice_count,
    SUM(ptc.total)                             AS total_value,
    ROUND(AVG(ptc.days_late), 1)               AS avg_days_to_pay
FROM reporting.v_payment_compliance ptc
WHERE ptc.invoice_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
  AND ptc.compliance_status != 'Unpaid'
GROUP BY 1, ptc.compliance_status
-- Ordered by the smallest days_late in each bucket rather than by repeating the
-- CASE: an output column name is only usable as a bare ORDER BY item, not inside
-- an expression, so `CASE WHEN days_to_pay_bucket = ...` raised
-- `column "days_to_pay_bucket" does not exist`. The buckets are monotonic in
-- days_late, so this yields exactly the same order.
ORDER BY MIN(ptc.days_late);
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
    COUNT(DISTINCT CASE WHEN ptc.compliance_status = 'On Time' THEN ptc.invoice_id END)  AS on_time_count,
    COUNT(DISTINCT CASE WHEN ptc.compliance_status = 'Late' THEN ptc.invoice_id END)     AS late_count,
    COUNT(DISTINCT CASE WHEN ptc.compliance_status = 'Unpaid' THEN ptc.invoice_id END)   AS unpaid_count,
    ROUND(
        100.0 * COUNT(DISTINCT CASE WHEN ptc.compliance_status = 'On Time' THEN ptc.invoice_id END)
        / NULLIF(COUNT(DISTINCT CASE WHEN ptc.compliance_status != 'Unpaid' THEN ptc.invoice_id END), 0),
        1
    )                                                                        AS on_time_pct,
    ROUND(AVG(ptc.days_late), 1)                                             AS avg_days_to_pay,
    ROUND(AVG(GREATEST(ptc.days_late, 0)), 1)                                AS avg_days_late,
    SUM(ptc.total)                                                           AS total_invoiced,
    SUM(ptc.balance)                                                         AS total_outstanding
FROM reporting.v_payment_compliance ptc
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
WITH dim_entries AS (
    SELECT
        gl.line_id,
        gl.net_amount,
        UNNEST(ARRAY['Entity', 'Function', 'Project']) AS dimension_type,
        UNNEST(ARRAY[
            gl.dim_entity_id::TEXT,
            gl.dim_function_id::TEXT,
            gl.dim_project_id::TEXT
        ]) AS dimension_code
    FROM reporting.v_general_ledger gl
    WHERE gl.entry_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
      AND gl.account_type = 'revenue'
)
SELECT
    de.dimension_type,
    de.dimension_code,
    de.dimension_code                                                    AS dimension_name,
    SUM(de.net_amount)                                                   AS revenue,
    ROUND(
        100.0 * SUM(de.net_amount)
        / NULLIF(SUM(SUM(de.net_amount)) OVER (), 0),
        2
    )                                                                    AS pct_of_total,
    COUNT(DISTINCT de.line_id)                                           AS entry_count
FROM dim_entries de
WHERE de.dimension_code IS NOT NULL
  AND ('{{ dimension_type }}' = '' OR de.dimension_type = '{{ dimension_type }}')
GROUP BY de.dimension_type, de.dimension_code
ORDER BY revenue DESC;
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "dimension_type",
                    "title": "Dimension Type",
                    "type": "enum",
                    "enumOptions": "Entity\nFunction\nProject",
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
WITH dim_entries AS (
    SELECT
        DATE_TRUNC('month', gl.entry_date)::DATE AS month,
        gl.net_amount,
        UNNEST(ARRAY['Entity', 'Function', 'Project']) AS dimension_type,
        UNNEST(ARRAY[
            gl.dim_entity_id::TEXT,
            gl.dim_function_id::TEXT,
            gl.dim_project_id::TEXT
        ]) AS dimension_code
    FROM reporting.v_general_ledger gl
    WHERE gl.entry_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
      AND gl.account_type = 'revenue'
)
SELECT
    de.month,
    de.dimension_code                                      AS dimension_name,
    SUM(de.net_amount)                                     AS revenue
FROM dim_entries de
WHERE de.dimension_code IS NOT NULL
  AND ('{{ dimension_type }}' = '' OR de.dimension_type = '{{ dimension_type }}')
GROUP BY de.month, de.dimension_code
ORDER BY de.month, de.dimension_code;
""".strip(),
        "options": {
            "parameters": DATE_PARAMS + [
                {
                    "name": "dimension_type",
                    "title": "Dimension Type",
                    "type": "enum",
                    "enumOptions": "Entity\nFunction\nProject",
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
    bv.gl_account_code,
    bv.gl_account_name,
    bv.account_type,
    bv.account_group,
    bv.fiscal_year_label,
    bv.period_number,
    bv.budget_amount,
    bv.actual_net_oc,
    bv.variance_amount,
    bv.variance_percentage,
    CASE WHEN bv.variance_amount >= 0 THEN 'Under Budget' ELSE 'Over Budget' END AS budget_status
FROM reporting.v_budget_variance bv
WHERE bv.fiscal_year_label = '{{ fiscal_year }}'
  AND ('{{ department }}' = '' OR bv.account_group = '{{ department }}')
  AND ({{ fiscal_period }} = 0 OR bv.period_number::int = {{ fiscal_period }})
ORDER BY bv.account_type, bv.gl_account_code, bv.period_number;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "fiscal_year",
                    "title": "Fiscal Year",
                    "type": "text",
                    "value": DEMO_FISCAL_YEAR,
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
    bv.account_group,
    SUM(bv.budget_amount) AS total_budget,
    SUM(bv.actual_net_oc) AS total_actual,
    SUM(bv.variance_amount) AS total_variance,
    CASE
        WHEN SUM(bv.budget_amount) <> 0
            THEN ROUND(((SUM(bv.actual_net_oc) - SUM(bv.budget_amount)) / ABS(SUM(bv.budget_amount))) * 100, 2)
        ELSE 0
    END AS variance_pct,
    COUNT(*) FILTER (WHERE bv.variance_amount < 0) AS over_budget_count,
    COUNT(*) FILTER (WHERE bv.variance_amount >= 0) AS under_budget_count,
    COUNT(*) FILTER (WHERE ABS(bv.variance_percentage) > 10) AS significant_variances
FROM reporting.v_budget_variance bv
WHERE bv.fiscal_year_label = '{{ fiscal_year }}'
  AND ({{ fiscal_period }} = 0 OR bv.period_number::int = {{ fiscal_period }})
GROUP BY bv.account_type, bv.account_group
ORDER BY bv.account_type, bv.account_group;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "fiscal_year",
                    "title": "Fiscal Year",
                    "type": "text",
                    "value": DEMO_FISCAL_YEAR,
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
    SUM(ap.balance_oc) AS total_balance_due,
    SUM(ap.total_oc) AS total_invoiced,
    SUM(ap.amount_paid_oc) AS total_paid,
    ROUND(AVG(ap.days_overdue), 0) AS avg_days_overdue
FROM reporting.v_ap_aging ap
WHERE ap.due_date <= '{{ as_at_date }}'
   OR ap.invoice_status = 'open'
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
                    "value": DEMO_PERIOD_END,
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
WITH vat_data AS (
    SELECT
        DATE_TRUNC('month', inv.invoice_date)::DATE AS tax_period,
        inv.tax_code,
        inv.line_vat_rate AS tax_rate,
        'output' AS vat_type,
        inv.line_total AS taxable_amount,
        inv.line_vat_amount AS vat_amount
    FROM reporting.v_invoices inv
    WHERE inv.invoice_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
      AND inv.line_vat_amount IS NOT NULL
    UNION ALL
    SELECT
        DATE_TRUNC('month', po.po_date)::DATE AS tax_period,
        -- Purchase orders carry no tax code: procurement.purchase_order_items has
        -- vat_rate and vat_amount only, so v_purchase_orders cannot expose one.
        -- NULL keeps the shape of the union with the invoice branch, which does.
        NULL::VARCHAR AS tax_code,
        po.line_vat_rate AS tax_rate,
        'input' AS vat_type,
        po.line_total AS taxable_amount,
        po.line_vat_amount AS vat_amount
    FROM reporting.v_purchase_orders po
    WHERE po.po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
      AND po.line_vat_amount IS NOT NULL
)
SELECT
    vd.tax_period                                                            AS period,
    vd.tax_code,
    vd.tax_rate,
    SUM(CASE WHEN vd.vat_type = 'output' THEN vd.taxable_amount ELSE 0 END) AS output_taxable,
    SUM(CASE WHEN vd.vat_type = 'output' THEN vd.vat_amount ELSE 0 END)     AS output_vat,
    SUM(CASE WHEN vd.vat_type = 'input' THEN vd.taxable_amount ELSE 0 END)  AS input_taxable,
    SUM(CASE WHEN vd.vat_type = 'input' THEN vd.vat_amount ELSE 0 END)      AS input_vat,
    SUM(CASE WHEN vd.vat_type = 'output' THEN vd.vat_amount ELSE 0 END)
      - SUM(CASE WHEN vd.vat_type = 'input' THEN vd.vat_amount ELSE 0 END)  AS net_vat_payable,
    COUNT(*)                                                                 AS total_lines
FROM vat_data vd
GROUP BY vd.tax_period, vd.tax_code, vd.tax_rate
ORDER BY vd.tax_period, vd.tax_code;
""".strip(),
        "options": {"parameters": DATE_PARAMS},
        "tags": ["finance", "jrny-report"],
    },
    "vat_liability_trend": {
        "name": "Tax/VAT Summary - Monthly Liability Trend",
        "description": "Monthly VAT liability trend showing output VAT, input VAT, and net payable over time.",
        "query": """
WITH vat_data AS (
    SELECT
        DATE_TRUNC('month', inv.invoice_date)::DATE AS month,
        'output' AS vat_type,
        inv.line_vat_amount AS vat_amount
    FROM reporting.v_invoices inv
    WHERE inv.invoice_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
      AND inv.line_vat_amount IS NOT NULL
    UNION ALL
    SELECT
        DATE_TRUNC('month', po.po_date)::DATE AS month,
        'input' AS vat_type,
        po.line_vat_amount AS vat_amount
    FROM reporting.v_purchase_orders po
    WHERE po.po_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
      AND po.line_vat_amount IS NOT NULL
)
SELECT
    vd.month,
    SUM(CASE WHEN vd.vat_type = 'output' THEN vd.vat_amount ELSE 0 END) AS output_vat,
    SUM(CASE WHEN vd.vat_type = 'input' THEN vd.vat_amount ELSE 0 END)  AS input_vat,
    SUM(CASE WHEN vd.vat_type = 'output' THEN vd.vat_amount ELSE 0 END)
      - SUM(CASE WHEN vd.vat_type = 'input' THEN vd.vat_amount ELSE 0 END)  AS net_vat_payable
FROM vat_data vd
GROUP BY vd.month
ORDER BY vd.month;
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
    COUNT(*) AS total_lines,
    COUNT(*) FILTER (WHERE match_status = 'Matched') AS matched_count,
    COUNT(*) FILTER (WHERE match_status != 'Matched') AS unmatched_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE match_status = 'Matched') / NULLIF(COUNT(*), 0), 1) AS pct_reconciled,
    SUM(COALESCE(debit, 0) + COALESCE(credit, 0)) FILTER (WHERE match_status = 'Matched') AS matched_value,
    SUM(COALESCE(debit, 0) + COALESCE(credit, 0)) FILTER (WHERE match_status != 'Matched') AS unmatched_value,
    MIN(transaction_date) FILTER (WHERE match_status != 'Matched') AS oldest_unmatched_date,
    CURRENT_DATE - MIN(transaction_date) FILTER (WHERE match_status != 'Matched') AS oldest_unmatched_days
FROM reporting.v_bank_reconciliation_status
GROUP BY bank_account_id, account_name, bank_name
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
    account_name AS bank_account,
    transaction_date,
    description,
    COALESCE(debit, 0) - COALESCE(credit, 0) AS amount,
    reference,
    days_unmatched,
    aging_bucket,
    CASE WHEN debit > 0 THEN 'Debit' ELSE 'Credit' END AS direction
FROM reporting.v_unmatched_transactions
ORDER BY days_unmatched DESC, account_name;
""".strip(),
        "options": {"parameters": []},
        "tags": ["cashbook", "jrny-report"],
    },
    "cash_position_summary": {
        "name": "Cash Position Summary",
        "description": "Current cash position across all active bank accounts showing opening and current balances.",
        "query": """
SELECT
    account_name,
    bank_name,
    account_type,
    currency,
    opening_balance,
    current_balance
FROM reporting.v_cash_position
ORDER BY current_balance DESC;
""".strip(),
        "options": {"parameters": []},
        "tags": ["cashbook", "jrny-report"],
    },
    "cash_position_projection": {
        "name": "Cash Position - Current Totals",
        "description": "Total cash position across all active bank accounts. v_cash_position provides current snapshot only (no projection data available).",
        "query": """
SELECT
    'Current' AS period,
    SUM(current_balance) AS total_balance,
    SUM(opening_balance) AS total_opening_balance,
    SUM(current_balance) - SUM(opening_balance) AS net_change,
    COUNT(*) AS account_count
FROM reporting.v_cash_position;
""".strip(),
        "options": {"parameters": []},
        "tags": ["cashbook", "jrny-report"],
    },
    "unmatched_transactions": {
        "name": "Unmatched Transactions",
        "description": "Bank statement lines not yet matched to any source document, sorted by oldest first.",
        "query": """
SELECT
    account_name AS bank_account,
    bank_name,
    transaction_date,
    description,
    COALESCE(debit, 0) - COALESCE(credit, 0) AS amount,
    reference,
    days_unmatched,
    aging_bucket,
    CASE WHEN debit > 0 THEN 'Debit' ELSE 'Credit' END AS direction
FROM reporting.v_unmatched_transactions
WHERE ('{{ bank_account }}' = '' OR account_name = '{{ bank_account }}')
ORDER BY days_unmatched DESC;
""".strip(),
        "options": {"parameters": [
            {
                "name": "bank_account",
                "title": "Bank Account",
                "type": "query",
                "queryId": "bank_account_lookup",
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
    account_name AS bank_account,
    COUNT(*) AS unmatched_count,
    SUM(COALESCE(debit, 0) + COALESCE(credit, 0)) AS total_unmatched_value,
    SUM(COALESCE(credit, 0)) AS unmatched_credits,
    SUM(COALESCE(debit, 0)) AS unmatched_debits,
    MIN(transaction_date) AS oldest_item_date,
    CURRENT_DATE - MIN(transaction_date) AS oldest_item_age
FROM reporting.v_unmatched_transactions
GROUP BY account_name
ORDER BY total_unmatched_value DESC;
""".strip(),
        "options": {"parameters": []},
        "tags": ["cashbook", "jrny-report"],
    },
    # ---- CRM / Sales ----
    "customer_master_summary": {
        "name": "Customer Master Summary",
        "description": "Active customers with credit limit utilization, payment behavior, and account health using v_customers and v_payment_compliance views.",
        "query": """
SELECT
    cust.customer_name,
    COALESCE(cust.customer_type, 'Ungrouped') AS customer_group,
    COALESCE(cust.credit_limit, 0) AS credit_limit,
    COALESCE(cust.outstanding_balance, 0) AS total_outstanding,
    CASE
        WHEN COALESCE(cust.credit_limit, 0) > 0
        THEN ROUND(100.0 * COALESCE(cust.outstanding_balance, 0) / cust.credit_limit, 1)
        ELSE 0
    END AS credit_utilization_pct,
    COALESCE(pc_agg.payment_count, 0) AS payment_count,
    ROUND(COALESCE(pc_agg.avg_days_late, 0), 0) AS avg_days_to_pay,
    pc_agg.last_payment_date,
    COALESCE(cust.total_orders, 0) AS order_count,
    COALESCE(cust.total_order_value, 0) AS total_order_value,
    cust.last_order_date,
    CASE
        WHEN COALESCE(cust.outstanding_balance, 0) > COALESCE(NULLIF(cust.credit_limit, 0), cust.outstanding_balance + 1)
             OR COALESCE(pc_agg.max_days_late, 0) > 60
            THEN 'Risk'
        WHEN (cust.credit_limit > 0 AND cust.outstanding_balance > cust.credit_limit * 0.8)
             OR COALESCE(pc_agg.avg_days_late, 0) > 45
             OR COALESCE(pc_agg.max_days_late, 0) > 30
            THEN 'Watch'
        ELSE 'Good'
    END AS account_health
FROM reporting.v_customers cust
LEFT JOIN (
    SELECT
        customer_id,
        SUM(total_payments) AS payment_count,
        AVG(days_late) FILTER (WHERE days_late IS NOT NULL) AS avg_days_late,
        MAX(days_late) AS max_days_late,
        MAX(last_payment_date) AS last_payment_date
    FROM reporting.v_payment_compliance
    GROUP BY customer_id
) pc_agg ON pc_agg.customer_id = cust.customer_id
WHERE cust.is_active = true
  AND (COALESCE(cust.total_orders, 0) > 0 OR COALESCE(cust.total_invoices, 0) > 0)
  AND ('{{ customer_group }}' = '' OR COALESCE(cust.customer_type, 'Ungrouped') = '{{ customer_group }}')
  AND ('{{ health_status }}' = '' OR
    CASE
        WHEN COALESCE(cust.outstanding_balance, 0) > COALESCE(NULLIF(cust.credit_limit, 0), cust.outstanding_balance + 1)
             OR COALESCE(pc_agg.max_days_late, 0) > 60
            THEN 'Risk'
        WHEN (cust.credit_limit > 0 AND cust.outstanding_balance > cust.credit_limit * 0.8)
             OR COALESCE(pc_agg.avg_days_late, 0) > 45
             OR COALESCE(pc_agg.max_days_late, 0) > 30
            THEN 'Watch'
        ELSE 'Good'
    END = '{{ health_status }}'
  )
ORDER BY total_outstanding DESC NULLS LAST;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "customer_group",
                    "title": "Customer Group",
                    "type": "query",
                    "queryId": "customer_group_lookup",
                    "value": "",
                },
                {
                    "name": "health_status",
                    "title": "Health Status",
                    "type": "enum",
                    "enumOptions": "Good\nWatch\nRisk",
                    "value": "",
                },
            ]
        },
        "tags": ["sales", "jrny-report", "report:sales"],
    },
    # ---- Sales Pipeline / Opportunity Funnel ----
    "pipeline_funnel": {
        "name": "Sales Pipeline - Funnel by Stage",
        "description": "Opportunity funnel showing count and total value per pipeline stage, ordered from prospecting to negotiation (excludes closed). Note: requires CRM module (crm.opportunities table).",
        "query": """
SELECT
    stage,
    COUNT(*) AS opportunity_count,
    SUM(amount) AS total_value,
    ROUND(AVG(amount), 2) AS avg_deal_size,
    ROUND(SUM(amount) * CASE stage
        WHEN 'prospecting' THEN 0.10
        WHEN 'qualification' THEN 0.25
        WHEN 'proposal' THEN 0.50
        WHEN 'negotiation' THEN 0.75
    END, 2) AS weighted_value
FROM crm.opportunities
WHERE stage NOT IN ('won', 'lost')
  AND (NULLIF('{{ start_date }}', '') IS NULL OR close_date >= NULLIF('{{ start_date }}', '')::date)
  AND (NULLIF('{{ end_date }}', '') IS NULL OR close_date <= NULLIF('{{ end_date }}', '')::date)
  AND (NULLIF('{{ assigned_to }}', '') IS NULL OR assigned_to::text = '{{ assigned_to }}')
GROUP BY stage
ORDER BY CASE stage
    WHEN 'prospecting' THEN 1
    WHEN 'qualification' THEN 2
    WHEN 'proposal' THEN 3
    WHEN 'negotiation' THEN 4
END;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "start_date",
                    "title": "Close Date From",
                    "type": "date",
                    "value": DEMO_PERIOD_START,
                },
                {
                    "name": "end_date",
                    "title": "Close Date To",
                    "type": "date",
                    "value": DEMO_PERIOD_END,
                },
                {
                    "name": "assigned_to",
                    "title": "Assigned Rep (UUID)",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["sales", "jrny-report", "report:sales"],
    },
    "pipeline_detail": {
        "name": "Sales Pipeline - Opportunity Detail",
        "description": "Full detail of all open opportunities with stage, amount, close date, and assigned rep. Note: requires CRM module (crm.opportunities table).",
        "query": """
SELECT
    o.opportunity_name,
    o.stage,
    o.amount,
    o.close_date,
    o.created_at::date AS created_date,
    (o.close_date - CURRENT_DATE) AS days_to_close,
    c.first_name || ' ' || c.last_name AS contact_name,
    rep.first_name || ' ' || rep.last_name AS assigned_rep
FROM crm.opportunities o
LEFT JOIN core.contacts c ON c.id = o.contact_id
LEFT JOIN core.contacts rep ON rep.id = o.assigned_to
WHERE stage NOT IN ('won', 'lost')
  AND (NULLIF('{{ start_date }}', '') IS NULL OR o.close_date >= NULLIF('{{ start_date }}', '')::date)
  AND (NULLIF('{{ end_date }}', '') IS NULL OR o.close_date <= NULLIF('{{ end_date }}', '')::date)
  AND (NULLIF('{{ assigned_to }}', '') IS NULL OR o.assigned_to::text = '{{ assigned_to }}')
ORDER BY
    CASE o.stage
        WHEN 'negotiation' THEN 1
        WHEN 'proposal' THEN 2
        WHEN 'qualification' THEN 3
        WHEN 'prospecting' THEN 4
    END,
    o.amount DESC;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "start_date",
                    "title": "Close Date From",
                    "type": "date",
                    "value": DEMO_PERIOD_START,
                },
                {
                    "name": "end_date",
                    "title": "Close Date To",
                    "type": "date",
                    "value": DEMO_PERIOD_END,
                },
                {
                    "name": "assigned_to",
                    "title": "Assigned Rep (UUID)",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["sales", "jrny-report", "report:sales"],
    },
    "pipeline_win_loss": {
        "name": "Sales Pipeline - Win/Loss Summary",
        "description": "Summary of closed opportunities showing win rate, total won/lost value, and average deal size. Note: requires CRM module (crm.opportunities table).",
        "query": """
SELECT
    stage AS outcome,
    COUNT(*) AS deal_count,
    SUM(amount) AS total_value,
    ROUND(AVG(amount), 2) AS avg_deal_size,
    ROUND(AVG(close_date - created_at::date), 0) AS avg_days_to_close
FROM crm.opportunities
WHERE stage IN ('won', 'lost')
  AND (NULLIF('{{ start_date }}', '') IS NULL OR close_date >= NULLIF('{{ start_date }}', '')::date)
  AND (NULLIF('{{ end_date }}', '') IS NULL OR close_date <= NULLIF('{{ end_date }}', '')::date)
  AND (NULLIF('{{ assigned_to }}', '') IS NULL OR assigned_to::text = '{{ assigned_to }}')
GROUP BY stage
ORDER BY stage DESC;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "start_date",
                    "title": "Close Date From",
                    "type": "date",
                    "value": DEMO_PERIOD_START,
                },
                {
                    "name": "end_date",
                    "title": "Close Date To",
                    "type": "date",
                    "value": DEMO_PERIOD_END,
                },
                {
                    "name": "assigned_to",
                    "title": "Assigned Rep (UUID)",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["sales", "jrny-report", "report:sales"],
    },
    # ---- Customer Activity Log ----
    "activity_customer_summary": {
        "name": "Customer Activity Log - Account Summary",
        "description": "Summary of customer engagement showing last activity date, activity counts by type, and dormancy status (no activity in 30+ days). Note: requires CRM module (crm.activities table).",
        "query": """
SELECT
    c.first_name || ' ' || c.last_name AS customer_name,
    MAX(a.activity_date)::date AS last_activity_date,
    (CURRENT_DATE - MAX(a.activity_date)::date) AS days_since_last_activity,
    COUNT(*) AS total_activities,
    COUNT(*) FILTER (WHERE a.activity_type = 'call') AS calls,
    COUNT(*) FILTER (WHERE a.activity_type = 'email') AS emails,
    COUNT(*) FILTER (WHERE a.activity_type = 'meeting') AS meetings,
    rep.first_name || ' ' || rep.last_name AS assigned_rep,
    CASE
        WHEN (CURRENT_DATE - MAX(a.activity_date)::date) > 30 THEN 'Dormant'
        WHEN (CURRENT_DATE - MAX(a.activity_date)::date) > 14 THEN 'At Risk'
        ELSE 'Active'
    END AS engagement_status
FROM crm.activities a
JOIN core.contacts c ON c.id = a.contact_id
LEFT JOIN core.contacts rep ON rep.id = a.performed_by
WHERE (NULLIF('{{ start_date }}', '') IS NULL OR a.activity_date >= NULLIF('{{ start_date }}', '')::date)
  AND (NULLIF('{{ end_date }}', '') IS NULL OR a.activity_date <= NULLIF('{{ end_date }}', '')::date)
  AND (NULLIF('{{ assigned_to }}', '') IS NULL OR a.performed_by::text = '{{ assigned_to }}')
GROUP BY c.id, c.first_name, c.last_name, rep.first_name, rep.last_name
ORDER BY days_since_last_activity DESC;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "start_date",
                    "title": "Activity Date From",
                    "type": "date",
                    "value": DEMO_PERIOD_START,
                },
                {
                    "name": "end_date",
                    "title": "Activity Date To",
                    "type": "date",
                    "value": DEMO_PERIOD_END,
                },
                {
                    "name": "assigned_to",
                    "title": "Sales Rep (UUID)",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["sales", "jrny-report", "report:sales"],
    },
    "activity_volume_by_type": {
        "name": "Customer Activity Log - Volume by Type",
        "description": "Activity count grouped by week and type for trend visualization. Note: requires CRM module (crm.activities table).",
        "query": """
SELECT
    DATE_TRUNC('week', a.activity_date)::date AS week_start,
    a.activity_type,
    COUNT(*) AS activity_count
FROM crm.activities a
WHERE (NULLIF('{{ start_date }}', '') IS NULL OR a.activity_date >= NULLIF('{{ start_date }}', '')::date)
  AND (NULLIF('{{ end_date }}', '') IS NULL OR a.activity_date <= NULLIF('{{ end_date }}', '')::date)
  AND (NULLIF('{{ assigned_to }}', '') IS NULL OR a.performed_by::text = '{{ assigned_to }}')
GROUP BY DATE_TRUNC('week', a.activity_date)::date, a.activity_type
ORDER BY week_start;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "start_date",
                    "title": "Activity Date From",
                    "type": "date",
                    "value": DEMO_PERIOD_START,
                },
                {
                    "name": "end_date",
                    "title": "Activity Date To",
                    "type": "date",
                    "value": DEMO_PERIOD_END,
                },
                {
                    "name": "assigned_to",
                    "title": "Sales Rep (UUID)",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["sales", "jrny-report", "report:sales"],
    },
    "activity_detail": {
        "name": "Customer Activity Log - Detail",
        "description": "Full activity log showing all interactions with customer, type, subject, and notes. Note: requires CRM module (crm.activities table).",
        "query": """
SELECT
    a.activity_date::date AS activity_date,
    a.activity_type,
    c.first_name || ' ' || c.last_name AS customer_name,
    a.subject,
    a.notes,
    o.opportunity_name,
    rep.first_name || ' ' || rep.last_name AS performed_by
FROM crm.activities a
JOIN core.contacts c ON c.id = a.contact_id
LEFT JOIN crm.opportunities o ON o.id = a.opportunity_id
LEFT JOIN core.contacts rep ON rep.id = a.performed_by
WHERE (NULLIF('{{ start_date }}', '') IS NULL OR a.activity_date >= NULLIF('{{ start_date }}', '')::date)
  AND (NULLIF('{{ end_date }}', '') IS NULL OR a.activity_date <= NULLIF('{{ end_date }}', '')::date)
  AND (NULLIF('{{ assigned_to }}', '') IS NULL OR a.performed_by::text = '{{ assigned_to }}')
ORDER BY a.activity_date DESC;
""".strip(),
        "options": {
            "parameters": [
                {
                    "name": "start_date",
                    "title": "Activity Date From",
                    "type": "date",
                    "value": DEMO_PERIOD_START,
                },
                {
                    "name": "end_date",
                    "title": "Activity Date To",
                    "type": "date",
                    "value": DEMO_PERIOD_END,
                },
                {
                    "name": "assigned_to",
                    "title": "Sales Rep (UUID)",
                    "type": "text",
                    "value": "",
                },
            ]
        },
        "tags": ["sales", "jrny-report", "report:sales"],
    },
    "customer_master_health_summary": {
        "name": "Customer Master Summary - Health Distribution",
        "description": "Aggregated customer count by health status using v_customers and v_payment_compliance views.",
        "query": """
WITH customer_health AS (
    SELECT
        cust.customer_id,
        CASE
            WHEN COALESCE(cust.outstanding_balance, 0) > COALESCE(NULLIF(cust.credit_limit, 0), cust.outstanding_balance + 1)
                 OR COALESCE(pc_agg.max_days_late, 0) > 60
                THEN 'Risk'
            WHEN (cust.credit_limit > 0 AND cust.outstanding_balance > cust.credit_limit * 0.8)
                 OR COALESCE(pc_agg.avg_days_late, 0) > 45
                 OR COALESCE(pc_agg.max_days_late, 0) > 30
                THEN 'Watch'
            ELSE 'Good'
        END AS account_health
    FROM reporting.v_customers cust
    LEFT JOIN (
        SELECT
            customer_id,
            AVG(days_late) FILTER (WHERE days_late IS NOT NULL) AS avg_days_late,
            MAX(days_late) AS max_days_late
        FROM reporting.v_payment_compliance
        GROUP BY customer_id
    ) pc_agg ON pc_agg.customer_id = cust.customer_id
    WHERE cust.is_active = true
      AND (COALESCE(cust.total_orders, 0) > 0 OR COALESCE(cust.total_invoices, 0) > 0)
)
SELECT
    account_health,
    COUNT(*) AS customer_count
FROM customer_health
GROUP BY account_health
ORDER BY
    CASE account_health
        WHEN 'Good' THEN 1
        WHEN 'Watch' THEN 2
        WHEN 'Risk' THEN 3
    END;
""".strip(),
        "options": {"parameters": []},
        "tags": ["sales", "jrny-report", "report:sales"],
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
                    "invoice_balance": "y",
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
                    {"name": "invoice_total", "title": "Amount", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "invoice_balance", "title": "Balance Due", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
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
                    {"name": "cost_price", "title": "Unit Cost", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
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
                    {"name": "warehouse_name", "title": "Warehouse", "visible": True},
                    {"name": "quantity_on_hand", "title": "Qty on Hand", "visible": True, "alignContent": "right"},
                    {"name": "reorder_level", "title": "Reorder Level", "visible": True, "alignContent": "right"},
                    {"name": "shortfall", "title": "Shortfall", "visible": True, "alignContent": "right"},
                    {"name": "suggested_order_qty", "title": "Suggested Order Qty", "visible": True, "alignContent": "right"},
                    {"name": "cost_price", "title": "Unit Cost", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
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
    "ppv_kpi": [
        {
            "name": "Total PPV",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Total Price Variance",
                "counterColName": "total_ppv",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
                "stringPrefix": "R ",
            },
        },
        {
            "name": "Avg PPV %",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Average Variance %",
                "counterColName": "avg_ppv_pct",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
                "stringSuffix": "%",
            },
        },
        {
            "name": "Unfavourable PPV",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Unfavourable (Cost Up)",
                "counterColName": "unfavourable_total",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
                "stringPrefix": "R ",
            },
        },
    ],
    "ppv_by_supplier": [
        {
            "name": "PPV by Supplier (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "bar",
                "columnMapping": {
                    "supplier_name": "x",
                    "unfavourable": "y",
                    "favourable": "y",
                },
                "seriesOptions": {
                    "unfavourable": {"type": "bar", "yAxis": 0, "name": "Unfavourable", "color": "#dc2626"},
                    "favourable": {"type": "bar", "yAxis": 0, "name": "Favourable", "color": "#16a34a"},
                },
                "sortX": True,
                "legend": {"enabled": True},
                "xAxis": {"type": "category"},
                "yAxis": [{"type": "linear", "title": {"text": "Amount (R)"}}],
                "series": {"stacking": None},
            },
        },
        {
            "name": "PPV Supplier Detail Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "supplier_name", "title": "Supplier", "visible": True},
                    {"name": "receipt_lines", "title": "Lines", "visible": True, "alignContent": "right"},
                    {"name": "total_po_value", "title": "PO Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_grn_value", "title": "GRN Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_ppv", "title": "Total PPV", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "avg_ppv_pct", "title": "Avg PPV %", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "unfavourable", "title": "Unfavourable", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "favourable", "title": "Favourable", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                ],
            },
        },
    ],
    "ppv_by_product": [
        {
            "name": "PPV by Product (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "bar",
                "columnMapping": {
                    "product_code": "x",
                    "total_ppv": "y",
                },
                "seriesOptions": {
                    "total_ppv": {"type": "bar", "yAxis": 0, "name": "Total PPV (R)", "color": "#7c3aed"},
                },
                "sortX": True,
                "legend": {"enabled": True},
                "xAxis": {"type": "category"},
                "yAxis": [{"type": "linear", "title": {"text": "PPV Amount (R)"}}],
                "series": {"stacking": None},
            },
        },
        {
            "name": "PPV Product Detail Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "product_code", "title": "Product Code", "visible": True},
                    {"name": "product_name", "title": "Product Name", "visible": True},
                    {"name": "receipt_lines", "title": "Lines", "visible": True, "alignContent": "right"},
                    {"name": "avg_po_price", "title": "Avg PO Price", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "avg_grn_price", "title": "Avg GRN Price", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "avg_ppv_per_unit", "title": "Avg PPV/Unit", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_ppv", "title": "Total PPV", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "avg_ppv_pct", "title": "Avg PPV %", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_received_qty", "title": "Total Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                ],
            },
        },
    ],
    "ppv_detail": [
        {
            "name": "PPV Line Detail Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "po_number", "title": "PO #", "visible": True},
                    {"name": "grn_number", "title": "GRN #", "visible": True},
                    {"name": "supplier_name", "title": "Supplier", "visible": True},
                    {"name": "product_code", "title": "Product", "visible": True},
                    {"name": "received_date", "title": "Receipt Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "received_quantity", "title": "Qty", "visible": True, "alignContent": "right"},
                    {"name": "po_unit_cost", "title": "PO Price", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "grn_unit_cost", "title": "GRN Price", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "ppv_per_unit", "title": "PPV/Unit", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "ppv_amount", "title": "PPV Total", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "ppv_pct", "title": "PPV %", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "variance_type", "title": "Type", "visible": True},
                ],
            },
        },
    ],
    "open_po_kpi": [
        {
            "name": "Open PO Count",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Open Purchase Orders",
                "counterColName": "open_po_count",
                "rowNumber": 1, "targetRowNumber": 1,
                "stringDecimal": 0, "stringDecChar": ".", "stringThouSep": ",",
                "tooltipFormat": "0,0",
            },
        },
        {
            "name": "Open PO Value",
            "type": "COUNTER",
            "options": {
                "counterLabel": "Total Open Value",
                "counterColName": "total_open_value",
                "rowNumber": 1, "targetRowNumber": 1,
                "stringDecimal": 2, "stringDecChar": ".", "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
                "stringPrefix": "R ",
            },
        },
        {
            "name": "Overdue %",
            "type": "COUNTER",
            "options": {
                "counterLabel": "% Overdue",
                "counterColName": "overdue_pct",
                "rowNumber": 1, "targetRowNumber": 1,
                "stringDecimal": 1, "stringDecChar": ".", "stringThouSep": ",",
                "tooltipFormat": "0,0.0",
                "stringSuffix": "%",
            },
        },
    ],
    "open_po_aging": [
        {
            "name": "Overdue PO Value by Bucket (Pie)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "pie",
                "columnMapping": {
                    "aging_bucket": "x",
                    "total_value": "y",
                },
                "seriesOptions": {},
                "legend": {"enabled": True, "placement": "auto"},
                "numberFormat": "0,0.00",
                "percentFormat": "0.0",
                "missingValuesAsZero": True,
            },
        },
        {
            "name": "Aging Bucket Summary Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "aging_bucket", "title": "Aging Bucket", "visible": True},
                    {"name": "po_count", "title": "PO Count", "visible": True, "alignContent": "right"},
                    {"name": "total_value", "title": "Total Value (R)", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                ],
            },
        },
    ],
    "open_po_detail": [
        {
            "name": "Open PO Detail Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "po_number", "title": "PO #", "visible": True},
                    {"name": "supplier_name", "title": "Supplier", "visible": True},
                    {"name": "status", "title": "Status", "visible": True},
                    {"name": "po_date", "title": "Order Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "expected_delivery_date", "title": "Expected Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "po_total", "title": "Value (R)", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "days_overdue", "title": "Days Overdue", "visible": True, "alignContent": "right"},
                    {"name": "aging_bucket", "title": "Aging Bucket", "visible": True},
                ],
            },
        },
    ],
    "open_po_by_supplier": [
        {
            "name": "Open PO Value by Supplier (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "bar",
                "columnMapping": {
                    "supplier_name": "x",
                    "total_value": "y",
                    "overdue_value": "y",
                },
                "seriesOptions": {
                    "total_value": {"type": "bar", "yAxis": 0, "name": "Total Value", "color": "#2563eb"},
                    "overdue_value": {"type": "bar", "yAxis": 0, "name": "Overdue Value", "color": "#dc2626"},
                },
                "sortX": True,
                "legend": {"enabled": True},
                "xAxis": {"type": "category"},
                "yAxis": [{"type": "linear", "title": {"text": "Value (R)"}}],
                "series": {"stacking": None},
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
        # Feature #197: Radar chart is the default viz for vendor scorecards —
        # multi-axis comparison reads at a glance and is the canonical shape
        # for supplier performance across delivery, quality, price, OTIF.
        {
            "name": "Vendor Dimension Comparison (Radar)",
            "type": "ECHARTS_RADAR",
            "options": {
                "title": "Vendor Performance Radar",
                "subtitle": "",
                "showLegend": True,
                "showTooltip": True,
                "theme": "jrny-light",
                "columnMapping": {
                    "series": "supplier_name",
                    "axes": [],
                    "dimension": "dimension_name",
                    "value": "score",
                },
                "scale": "0-100",
                "shape": "polygon",
                "fillOpacity": 0.25,
                "lineWidth": 2,
                "showSymbol": True,
                "showAxisLabels": True,
                "showAxisTicks": False,
            },
        },
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
    "rfq_response_analysis": [
        {
            "name": "Vendor Response Metrics (Table)",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "supplier_name", "title": "Vendor", "visible": True},
                    {"name": "supplier_code", "title": "Code", "visible": True},
                    {"name": "rfqs_received", "title": "RFQs Received", "visible": True, "alignContent": "right"},
                    {"name": "rfqs_responded", "title": "Responded", "visible": True, "alignContent": "right"},
                    {"name": "rfqs_declined", "title": "Declined", "visible": True, "alignContent": "right"},
                    {"name": "response_rate_pct", "title": "Response Rate %", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "avg_response_days", "title": "Avg Response (days)", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "min_response_days", "title": "Min Days", "visible": True, "alignContent": "right"},
                    {"name": "max_response_days", "title": "Max Days", "visible": True, "alignContent": "right"},
                ],
            },
        },
        {
            "name": "Response Rate by Vendor (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "supplier_name": "x",
                    "response_rate_pct": "y",
                    "avg_response_days": "y",
                },
                "seriesOptions": {
                    "response_rate_pct": {"type": "column", "yAxis": 0, "name": "Response Rate %", "color": "#2563eb"},
                    "avg_response_days": {"type": "line", "yAxis": 1, "name": "Avg Response Days", "color": "#d97706"},
                },
                "xAxis": {"type": "category", "labels": {"enabled": True}},
                "yAxis": [
                    {"type": "linear", "title": {"text": "Response Rate (%)"}},
                    {"type": "linear", "title": {"text": "Days"}, "opposite": True},
                ],
                "series": {"stacking": None},
                "sortX": True,
                "legend": {"enabled": True},
            },
        },
    ],
    "rfq_price_comparison": [
        {
            "name": "Price Comparison Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "rfq_number", "title": "RFQ #", "visible": True},
                    {"name": "rfq_title", "title": "RFQ Title", "visible": True},
                    {"name": "item_description", "title": "Item", "visible": True},
                    {"name": "quantity", "title": "Qty", "visible": True, "alignContent": "right"},
                    {"name": "target_price", "title": "Target Price", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "supplier_name", "title": "Supplier", "visible": True},
                    {"name": "quoted_price", "title": "Quoted Price", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "lead_time_days", "title": "Lead Time (d)", "visible": True, "alignContent": "right"},
                    {"name": "price_vs_target_pct", "title": "vs Target %", "visible": True, "displayAs": "number", "numberFormat": "+0,0.0;-0,0.0", "alignContent": "right"},
                    {"name": "price_bracket", "title": "Bracket", "visible": True},
                ],
            },
        },
        {
            "name": "Price Comparison by Item (Grouped Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "item_description": "x",
                    "quoted_price": "y",
                    "supplier_name": "series",
                },
                "seriesOptions": {},
                "xAxis": {"type": "category", "labels": {"enabled": True}},
                "yAxis": [{"type": "linear", "title": {"text": "Quoted Price"}}],
                "series": {"stacking": None},
                "sortX": True,
                "legend": {"enabled": True},
            },
        },
    ],
    "rfq_response_kpi": [
        {
            "name": "Total RFQs",
            "type": "COUNTER",
            "options": {
                "counterColName": "total_rfqs",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 0,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0",
            },
        },
        {
            "name": "Overall Response Rate",
            "type": "COUNTER",
            "options": {
                "counterColName": "overall_response_rate",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 1,
                "stringSuffix": "%",
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.0",
            },
        },
        {
            "name": "Avg Response Time",
            "type": "COUNTER",
            "options": {
                "counterColName": "avg_response_days",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 1,
                "stringSuffix": " days",
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.0",
            },
        },
    ],
    "procurement_lead_time_vendor": [
        {
            "name": "Lead Time by Vendor (Table)",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "supplier_name", "title": "Vendor", "visible": True},
                    {"name": "supplier_code", "title": "Code", "visible": True},
                    {"name": "total_receipts", "title": "Receipts", "visible": True, "alignContent": "right"},
                    {"name": "avg_lead_time_days", "title": "Avg Lead Time (d)", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "min_lead_time_days", "title": "Min (d)", "visible": True, "alignContent": "right"},
                    {"name": "max_lead_time_days", "title": "Max (d)", "visible": True, "alignContent": "right"},
                    {"name": "stddev_lead_time", "title": "Std Dev", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "on_time_count", "title": "On Time", "visible": True, "alignContent": "right"},
                    {"name": "late_count", "title": "Late", "visible": True, "alignContent": "right"},
                    {"name": "on_time_pct", "title": "On-Time %", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                ],
            },
        },
        {
            "name": "Avg Lead Time by Vendor (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "supplier_name": "x",
                    "avg_lead_time_days": "y",
                    "on_time_pct": "y",
                },
                "seriesOptions": {
                    "avg_lead_time_days": {"type": "column", "yAxis": 0, "name": "Avg Lead Time (days)", "color": "#2563eb"},
                    "on_time_pct": {"type": "line", "yAxis": 1, "name": "On-Time %", "color": "#16a34a"},
                },
                "xAxis": {"type": "category", "labels": {"enabled": True}},
                "yAxis": [
                    {"type": "linear", "title": {"text": "Days"}},
                    {"type": "linear", "title": {"text": "On-Time %"}, "opposite": True},
                ],
                "series": {"stacking": None},
                "sortX": True,
                "legend": {"enabled": True},
            },
        },
    ],
    "procurement_lead_time_category": [
        {
            "name": "Lead Time by Category (Table)",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "product_category", "title": "Category", "visible": True},
                    {"name": "total_receipts", "title": "Receipts", "visible": True, "alignContent": "right"},
                    {"name": "total_lines", "title": "Lines", "visible": True, "alignContent": "right"},
                    {"name": "avg_lead_time_days", "title": "Avg Lead Time (d)", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "min_lead_time_days", "title": "Min (d)", "visible": True, "alignContent": "right"},
                    {"name": "max_lead_time_days", "title": "Max (d)", "visible": True, "alignContent": "right"},
                    {"name": "stddev_lead_time", "title": "Std Dev", "visible": True, "displayAs": "number", "numberFormat": "0,0.0", "alignContent": "right"},
                    {"name": "safety_lead_time_days", "title": "Safety Lead Time (d)", "visible": True, "alignContent": "right"},
                ],
            },
        },
        {
            "name": "Lead Time by Category (Bar)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "product_category": "x",
                    "avg_lead_time_days": "y",
                    "safety_lead_time_days": "y",
                },
                "seriesOptions": {
                    "avg_lead_time_days": {"type": "column", "yAxis": 0, "name": "Avg Lead Time", "color": "#2563eb"},
                    "safety_lead_time_days": {"type": "column", "yAxis": 0, "name": "Safety Lead Time", "color": "#dc2626"},
                },
                "xAxis": {"type": "category", "labels": {"enabled": True}},
                "yAxis": [{"type": "linear", "title": {"text": "Days"}}],
                "series": {"stacking": None},
                "sortX": True,
                "legend": {"enabled": True},
            },
        },
    ],
    "procurement_lead_time_trend": [
        {
            "name": "Lead Time Trend by Vendor (Line)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "line",
                "columnMapping": {
                    "order_month": "x",
                    "avg_lead_time_days": "y",
                    "supplier_name": "series",
                },
                "seriesOptions": {},
                "xAxis": {"type": "category", "labels": {"enabled": True}},
                "yAxis": [{"type": "linear", "title": {"text": "Avg Lead Time (days)"}}],
                "series": {"stacking": None},
                "sortX": True,
                "legend": {"enabled": True},
            },
        },
    ],
    "procurement_lead_time_kpi": [
        {
            "name": "Total Receipts",
            "type": "COUNTER",
            "options": {
                "counterColName": "total_receipts",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 0,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0",
            },
        },
        {
            "name": "Avg Lead Time",
            "type": "COUNTER",
            "options": {
                "counterColName": "avg_lead_time_days",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 1,
                "stringSuffix": " days",
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.0",
            },
        },
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
                    {"name": "entry_date", "title": "Entry Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
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
                    {"name": "vendor_name", "title": "Vendor", "visible": True},
                    {"name": "invoice_number", "title": "Invoice #", "visible": True},
                    {"name": "invoice_date", "title": "Invoice Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "due_date", "title": "Due Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "total", "title": "Total Amount", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "amount_paid", "title": "Paid", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "balance", "title": "Balance Due", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "invoice_status", "title": "Status", "visible": True},
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
                    {"name": "total_lines", "title": "Total Lines", "visible": True, "alignContent": "right"},
                    {"name": "matched_count", "title": "Matched", "visible": True, "alignContent": "right"},
                    {"name": "unmatched_count", "title": "Unmatched", "visible": True, "alignContent": "right"},
                    {"name": "pct_reconciled", "title": "% Reconciled", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                    {"name": "unmatched_value", "title": "Unmatched Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "oldest_unmatched_days", "title": "Oldest (Days)", "visible": True, "alignContent": "right"},
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
                    {"name": "transaction_date", "title": "Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "description", "title": "Description", "visible": True},
                    {"name": "amount", "title": "Amount", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "reference", "title": "Reference", "visible": True},
                    {"name": "days_unmatched", "title": "Days Outstanding", "visible": True, "alignContent": "right"},
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
                    {"name": "account_type", "title": "Type", "visible": True},
                    {"name": "currency", "title": "Currency", "visible": True},
                    {"name": "opening_balance", "title": "Opening Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "current_balance", "title": "Current Balance", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                ],
            },
        },
    ],
    "cash_position_projection": [
        {
            "name": "Total Cash Position",
            "type": "COUNTER",
            "options": {
                "counterColName": "total_balance",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
                "defaultColumns": 2,
                "counterLabel": "Total Cash Position",
            },
        },
        {
            "name": "Net Change from Opening",
            "type": "COUNTER",
            "options": {
                "counterColName": "net_change",
                "rowNumber": 1,
                "targetRowNumber": 1,
                "stringDecimal": 2,
                "stringDecChar": ".",
                "stringThouSep": ",",
                "tooltipFormat": "0,0.00",
                "defaultColumns": 2,
                "counterLabel": "Net Change from Opening",
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
                    {"name": "transaction_date", "title": "Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "description", "title": "Description", "visible": True},
                    {"name": "amount", "title": "Amount", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "reference", "title": "Reference", "visible": True},
                    {"name": "days_unmatched", "title": "Days", "visible": True, "alignContent": "right"},
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
    "customer_master_summary": [
        {
            "name": "Customer Master Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "customer_name", "title": "Customer", "visible": True},
                    {"name": "customer_group", "title": "Group", "visible": True},
                    {"name": "credit_limit", "title": "Credit Limit", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "total_outstanding", "title": "Outstanding", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "credit_utilization_pct", "title": "Credit Util %", "visible": True, "displayAs": "number", "numberFormat": "0.0", "alignContent": "right"},
                    {"name": "avg_days_to_pay", "title": "Avg Days to Pay", "visible": True, "displayAs": "number", "numberFormat": "0", "alignContent": "right"},
                    {"name": "last_payment_date", "title": "Last Payment", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "order_count", "title": "Orders", "visible": True, "alignContent": "right"},
                    {"name": "total_order_value", "title": "Total Order Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "last_order_date", "title": "Last Order", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "account_health", "title": "Health", "visible": True},
                ],
            },
        },
    ],
    # ---- Customer Activity Log Visualizations ----
    "activity_customer_summary": [
        {
            "name": "Account Engagement Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "customer_name", "title": "Customer", "visible": True},
                    {"name": "last_activity_date", "title": "Last Activity", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "days_since_last_activity", "title": "Days Since", "visible": True, "alignContent": "right"},
                    {"name": "total_activities", "title": "Total", "visible": True, "alignContent": "right"},
                    {"name": "calls", "title": "Calls", "visible": True, "alignContent": "right"},
                    {"name": "emails", "title": "Emails", "visible": True, "alignContent": "right"},
                    {"name": "meetings", "title": "Meetings", "visible": True, "alignContent": "right"},
                    {"name": "assigned_rep", "title": "Rep", "visible": True},
                    {"name": "engagement_status", "title": "Status", "visible": True},
                ],
            },
        },
    ],
    "activity_volume_by_type": [
        {
            "name": "Activity Volume by Type (Stacked)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "week_start": "x",
                    "activity_count": "y",
                    "activity_type": "series",
                },
                "legend": {"enabled": True},
                "series": {"stacking": "stack"},
                "seriesOptions": {
                    "call": {"type": "column", "name": "Calls", "color": "#1890ff"},
                    "email": {"type": "column", "name": "Emails", "color": "#52c41a"},
                    "meeting": {"type": "column", "name": "Meetings", "color": "#fa8c16"},
                },
                "xAxis": {"type": "-", "labels": {"enabled": True}},
                "yAxis": [
                    {"type": "linear", "title": {"text": "Activity Count"}},
                ],
                "numberFormat": "0",
                "sortX": True,
            },
        },
    ],
    "activity_detail": [
        {
            "name": "Activity Log Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "activity_date", "title": "Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "activity_type", "title": "Type", "visible": True},
                    {"name": "customer_name", "title": "Customer", "visible": True},
                    {"name": "subject", "title": "Subject", "visible": True},
                    {"name": "notes", "title": "Notes", "visible": True},
                    {"name": "opportunity_name", "title": "Opportunity", "visible": True},
                    {"name": "performed_by", "title": "Rep", "visible": True},
                ],
            },
        },
    ],
    # ---- Sales Pipeline / Opportunity Funnel Visualizations ----
    "pipeline_funnel": [
        {
            "name": "Pipeline Funnel Chart",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "stage": "x",
                    "total_value": "y",
                    "weighted_value": "y",
                },
                "legend": {"enabled": True},
                "series": {"stacking": None},
                "seriesOptions": {
                    "total_value": {
                        "type": "column",
                        "name": "Total Value",
                        "yAxis": 0,
                        "color": "#1890ff",
                    },
                    "weighted_value": {
                        "type": "column",
                        "name": "Weighted Value",
                        "yAxis": 0,
                        "color": "#52c41a",
                    },
                },
                "xAxis": {"type": "-", "labels": {"enabled": True}},
                "yAxis": [
                    {"type": "linear", "title": {"text": "Value (R)"}},
                ],
                "numberFormat": "0,0",
                "sortX": False,
            },
        },
        {
            "name": "Pipeline Summary Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 10,
                "columns": [
                    {"name": "stage", "title": "Stage", "visible": True},
                    {"name": "opportunity_count", "title": "Deals", "visible": True, "alignContent": "right"},
                    {"name": "total_value", "title": "Total Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "avg_deal_size", "title": "Avg Deal Size", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "weighted_value", "title": "Weighted Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                ],
            },
        },
    ],
    "pipeline_detail": [
        {
            "name": "Opportunity Detail Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 25,
                "columns": [
                    {"name": "opportunity_name", "title": "Opportunity", "visible": True},
                    {"name": "stage", "title": "Stage", "visible": True},
                    {"name": "amount", "title": "Amount", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "close_date", "title": "Close Date", "visible": True, "displayAs": "datetime", "dateTimeFormat": "YYYY-MM-DD"},
                    {"name": "days_to_close", "title": "Days to Close", "visible": True, "alignContent": "right"},
                    {"name": "contact_name", "title": "Contact", "visible": True},
                    {"name": "assigned_rep", "title": "Assigned Rep", "visible": True},
                ],
            },
        },
    ],
    "pipeline_win_loss": [
        {
            "name": "Win/Loss Chart",
            "type": "CHART",
            "options": {
                "globalSeriesType": "column",
                "columnMapping": {
                    "outcome": "x",
                    "total_value": "y",
                },
                "legend": {"enabled": True},
                "series": {"stacking": None},
                "seriesOptions": {
                    "total_value": {
                        "type": "column",
                        "name": "Total Value",
                        "color": "#1890ff",
                    },
                },
                "xAxis": {"type": "-", "labels": {"enabled": True}},
                "yAxis": [
                    {"type": "linear", "title": {"text": "Value (R)"}},
                ],
                "numberFormat": "0,0",
                "sortX": False,
                "valuesOptions": {
                    "won": {"color": "#52c41a"},
                    "lost": {"color": "#ff4d4f"},
                },
            },
        },
        {
            "name": "Win/Loss Summary Table",
            "type": "TABLE",
            "options": {
                "itemsPerPage": 10,
                "columns": [
                    {"name": "outcome", "title": "Outcome", "visible": True},
                    {"name": "deal_count", "title": "Deals", "visible": True, "alignContent": "right"},
                    {"name": "total_value", "title": "Total Value", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "avg_deal_size", "title": "Avg Deal Size", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                    {"name": "avg_days_to_close", "title": "Avg Days to Close", "visible": True, "alignContent": "right"},
                ],
            },
        },
    ],
    "customer_master_health_summary": [
        {
            "name": "Health Distribution (Pie)",
            "type": "CHART",
            "options": {
                "globalSeriesType": "pie",
                "columnMapping": {
                    "account_health": "x",
                    "customer_count": "y",
                },
                "legend": {"enabled": True},
                "series": {"stacking": None},
                "seriesOptions": {
                    "customer_count": {
                        "type": "pie",
                        "name": "Customers",
                    },
                },
                "valuesOptions": {
                    "Good": {"color": "#16a34a"},
                    "Watch": {"color": "#d97706"},
                    "Risk": {"color": "#dc2626"},
                },
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
    "ppv_dashboard": {
        "name": "Purchase Price Variance (PPV)",
        "tags": ["procurement", "jrny-report", "report:procurement"],
        "widgets": [
            {"query_key": "ppv_kpi", "vis_index": 0, "width": 2},              # Total PPV KPI
            {"query_key": "ppv_kpi", "vis_index": 1, "width": 2},              # Avg PPV % KPI
            {"query_key": "ppv_kpi", "vis_index": 2, "width": 2},              # Unfavourable PPV KPI
            {"query_key": "ppv_by_supplier", "vis_index": 0, "width": 3},      # Supplier PPV bar chart
            {"query_key": "ppv_by_product", "vis_index": 0, "width": 3},       # Product PPV bar chart
            {"query_key": "ppv_by_supplier", "vis_index": 1, "width": 6},      # Supplier detail table
            {"query_key": "ppv_by_product", "vis_index": 1, "width": 6},       # Product detail table
            {"query_key": "ppv_detail", "vis_index": 0, "width": 6},           # Line detail table
        ],
    },
    "open_po_aging_dashboard": {
        "name": "Open PO Aging",
        "tags": ["procurement", "jrny-report", "report:procurement"],
        "widgets": [
            {"query_key": "open_po_kpi", "vis_index": 0, "width": 2},              # Open PO Count KPI
            {"query_key": "open_po_kpi", "vis_index": 1, "width": 2},              # Open PO Value KPI
            {"query_key": "open_po_kpi", "vis_index": 2, "width": 2},              # Overdue % KPI
            {"query_key": "open_po_aging", "vis_index": 0, "width": 3},            # Aging bucket pie chart
            {"query_key": "open_po_by_supplier", "vis_index": 0, "width": 3},      # Supplier bar chart
            {"query_key": "open_po_detail", "vis_index": 0, "width": 6},           # Detail table
        ],
    },
    "vendor_scorecard_dashboard": {
        "name": "Vendor Scorecard",
        "tags": ["procurement", "jrny-report", "report:procurement"],
        "widgets": [
            {"query_key": "vendor_scorecard_kpi", "vis_index": 0, "width": 2},           # Total Vendors KPI
            {"query_key": "vendor_scorecard_kpi", "vis_index": 1, "width": 2},           # Avg Composite Score KPI
            {"query_key": "vendor_scorecard_kpi", "vis_index": 2, "width": 2},           # Best Score KPI
            {"query_key": "vendor_scorecard_dimensions", "vis_index": 0, "width": 6},    # Dimension comparison radar (feature #197)
            {"query_key": "vendor_scorecard", "vis_index": 0, "width": 6},               # Rankings table
        ],
    },
    "rfq_response_dashboard": {
        "name": "RFQ Response Analysis",
        "tags": ["procurement", "jrny-report", "report:procurement"],
        "widgets": [
            {"query_key": "rfq_response_kpi", "vis_index": 0, "width": 2},           # Total RFQs KPI
            {"query_key": "rfq_response_kpi", "vis_index": 1, "width": 2},           # Response Rate KPI
            {"query_key": "rfq_response_kpi", "vis_index": 2, "width": 2},           # Avg Response Time KPI
            {"query_key": "rfq_response_analysis", "vis_index": 1, "width": 6},      # Response rate bar chart
            {"query_key": "rfq_price_comparison", "vis_index": 1, "width": 6},       # Price comparison grouped bar
            {"query_key": "rfq_response_analysis", "vis_index": 0, "width": 6},      # Vendor metrics table
            {"query_key": "rfq_price_comparison", "vis_index": 0, "width": 6},       # Price comparison table
        ],
    },
    "procurement_lead_time_dashboard": {
        "name": "Procurement Lead Time Analysis",
        "tags": ["procurement", "jrny-report", "report:procurement"],
        "widgets": [
            {"query_key": "procurement_lead_time_kpi", "vis_index": 0, "width": 2},              # Total Receipts KPI
            {"query_key": "procurement_lead_time_kpi", "vis_index": 1, "width": 2},              # Avg Lead Time KPI
            {"query_key": "procurement_lead_time_kpi", "vis_index": 2, "width": 2},              # Total Vendors KPI
            {"query_key": "procurement_lead_time_vendor", "vis_index": 1, "width": 6},           # Lead time by vendor bar chart
            {"query_key": "procurement_lead_time_category", "vis_index": 1, "width": 6},         # Lead time by category bar chart
            {"query_key": "procurement_lead_time_trend", "vis_index": 0, "width": 6},            # Monthly trend line chart
            {"query_key": "procurement_lead_time_vendor", "vis_index": 0, "width": 6},           # Vendor table
            {"query_key": "procurement_lead_time_category", "vis_index": 0, "width": 6},         # Category table
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
            {"query_key": "cash_position_projection", "vis_index": 0, "width": 3},  # KPI: Total Cash Position
            {"query_key": "cash_position_projection", "vis_index": 1, "width": 3},  # KPI: Net Change from Opening
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
    "customer_master_dashboard": {
        "name": "Customer Master Summary",
        "tags": ["sales", "jrny-report", "report:sales"],
        "widgets": [
            {"query_key": "customer_master_health_summary", "vis_index": 0, "width": 3},  # Health pie chart
            {"query_key": "customer_master_summary", "vis_index": 0, "width": 6},          # Customer detail table
        ],
    },
    # ---- Sales Pipeline Dashboard ----
    "sales_pipeline_dashboard": {
        "name": "Sales Pipeline / Opportunity Funnel",
        "tags": ["sales", "jrny-report", "report:sales"],
        "widgets": [
            {"query_key": "pipeline_funnel", "vis_index": 0, "width": 6},       # Funnel bar chart
            {"query_key": "pipeline_funnel", "vis_index": 1, "width": 6},       # Pipeline summary table
            {"query_key": "pipeline_detail", "vis_index": 0, "width": 6},       # Opportunity detail table
            {"query_key": "pipeline_win_loss", "vis_index": 0, "width": 3},     # Win/Loss chart
            {"query_key": "pipeline_win_loss", "vis_index": 1, "width": 3},     # Win/Loss summary table
        ],
    },
    # ---- Customer Activity Log Dashboard ----
    "customer_activity_dashboard": {
        "name": "Customer Activity Log",
        "tags": ["sales", "jrny-report", "report:sales"],
        "widgets": [
            {"query_key": "activity_volume_by_type", "vis_index": 0, "width": 6},      # Activity volume chart
            {"query_key": "activity_customer_summary", "vis_index": 0, "width": 6},     # Account engagement table
            {"query_key": "activity_detail", "vis_index": 0, "width": 6},               # Full activity log
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
    publish_query(client, result["id"])
    return result


def publish_query(client, query_id):
    """Publish a query (set is_draft=False).

    Redash creates queries as drafts. Dashboards were being published but their
    queries were not, which left every seeded query unpublished — invisible in
    the query list, and excluded from the scheduler that would otherwise have
    given the dashboards their first result.
    """
    try:
        result = client.post(f"/api/queries/{query_id}", {"is_draft": False})
        logger.info("  Published query (id=%s)", query_id)
        return result
    except Exception as e:
        logger.warning("  Could not publish query %s: %s", query_id, e)
        return None


def refresh_query(client, query_id, query_def=None):
    """Execute a query once so it has a stored result.

    A freshly seeded query has never run. Seeding that stops at "created" leaves
    every query without a result, which is how 32 dashboards came to look broken
    while the underlying views were fine.

    Parameter values are REQUIRED for a parameterised query and must go in the
    QUERY STRING with a `p_` prefix — QueryRefreshResource reads them via
    collect_parameters_from_request(request.args), not from the JSON body.
    Without them Redash rejects the run with "Missing parameter value for: ...".
    56 of the 77 seeded queries are parameterised, so omitting this fails most of
    them. The defaults declared on the query are used.
    """
    params = (query_def or {}).get("options", {}).get("parameters", []) or []
    suffix = ""
    if params:
        suffix = "?" + urlencode(
            {"p_" + p["name"]: (p.get("value") if p.get("value") is not None else "") for p in params}
        )

    try:
        client.post(f"/api/queries/{query_id}/refresh{suffix}", {})
        logger.info("  Queued first execution (query id=%s)", query_id)
        return True
    except Exception as e:
        logger.warning("  Could not queue execution for query %s: %s", query_id, e)
        return False


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

    # ---- Step 0: Create lookup queries for dropdown parameters ----
    lookup_ids = {}  # lookup_key -> query_id
    logger.info("Creating lookup queries for dropdown parameters...")
    for lookup_key, lookup_def in LOOKUP_QUERIES.items():
        if lookup_def["name"] in existing_names:
            logger.info("  Skipping existing lookup: '%s'", lookup_def["name"])
            result = client.get(f"/api/queries?q={lookup_def['name']}")
            for q in result.get("results", []):
                if q["name"] == lookup_def["name"]:
                    lookup_ids[lookup_key] = q["id"]
                    break
            continue

        result = create_query(client, data_source_id, lookup_key, lookup_def)
        lookup_ids[lookup_key] = result["id"]

    logger.info("  Lookup queries created: %d (IDs: %s)", len(lookup_ids), lookup_ids)

    # Resolve queryId string references in QUERIES parameters to actual IDs
    resolved_queries = copy.deepcopy(QUERIES)
    for query_key, query_def in resolved_queries.items():
        for param in query_def.get("options", {}).get("parameters", []):
            if param.get("type") == "query" and isinstance(param.get("queryId"), str):
                ref = param["queryId"]
                if ref in lookup_ids:
                    param["queryId"] = lookup_ids[ref]
                else:
                    logger.warning("  Lookup '%s' not found for param '%s' in query '%s' — falling back to text",
                                   ref, param.get("name"), query_def.get("name"))
                    param["type"] = "text"
                    param.pop("queryId", None)

    # ---- Step 1: Create queries ----
    logger.info("Creating report queries...")
    for query_key, query_def in resolved_queries.items():
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

    # ---- First execution ----
    # Widgets render the query's last stored result, so a seed that stops at
    # "created" leaves every dashboard blank. Queue one run per query; the worker
    # executes them and the dashboards come up populated.
    logger.info("Queueing first execution for %d queries...", len(created["queries"]))
    refreshed = 0
    for query_key, query_entry in created["queries"].items():
        query_def = QUERIES.get(query_key) or LOOKUP_QUERIES.get(query_key) or {}
        if refresh_query(client, query_entry["id"], query_def):
            refreshed += 1
    logger.info("Queued %d/%d query executions", refreshed, len(created["queries"]))

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
