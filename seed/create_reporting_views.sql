-- ============================================================================
-- JRNYBI Expanded Reporting Views Migration
-- ============================================================================
-- Creates comprehensive denormalized reporting views on the read replica
-- to support all standard reports. All views include org_id and branch_id
-- columns for RLS (Row-Level Security) filtering.
--
-- Usage:
--   psql -U postgres -d postgres -f seed/create_reporting_views.sql
--   OR via Docker:
--   docker compose exec -T postgres psql -U postgres postgres < seed/create_reporting_views.sql
--
-- Idempotent: Uses DROP VIEW IF EXISTS before every CREATE VIEW.
-- ============================================================================

-- ============================================================================
-- DROP all existing reporting views (clean slate)
-- ============================================================================
DROP VIEW IF EXISTS reporting.v_sales_orders CASCADE;
DROP VIEW IF EXISTS reporting.v_sales_by_branch CASCADE;
DROP VIEW IF EXISTS reporting.v_outstanding_orders CASCADE;
DROP VIEW IF EXISTS reporting.v_sales_summary CASCADE;
DROP VIEW IF EXISTS reporting.v_customer_orders CASCADE;
DROP VIEW IF EXISTS reporting.v_invoices CASCADE;
DROP VIEW IF EXISTS reporting.v_inventory_levels CASCADE;
DROP VIEW IF EXISTS reporting.v_inventory_aging CASCADE;
DROP VIEW IF EXISTS reporting.v_stock_movements CASCADE;
DROP VIEW IF EXISTS reporting.v_purchase_orders CASCADE;
DROP VIEW IF EXISTS reporting.v_cashbook_transactions CASCADE;
DROP VIEW IF EXISTS reporting.v_general_ledger CASCADE;
DROP VIEW IF EXISTS reporting.v_customers CASCADE;
DROP VIEW IF EXISTS reporting.v_suppliers CASCADE;
DROP VIEW IF EXISTS reporting.v_product_catalogue CASCADE;
DROP VIEW IF EXISTS reporting.v_pick_pack_performance CASCADE;
DROP VIEW IF EXISTS reporting.v_otif CASCADE;
DROP VIEW IF EXISTS reporting.v_ap_aging CASCADE;
DROP VIEW IF EXISTS reporting.v_budget_variance CASCADE;
DROP VIEW IF EXISTS reporting.v_pnl CASCADE;
DROP VIEW IF EXISTS reporting.v_balance_sheet CASCADE;

-- Also drop any legacy reporting tables (dev migration path)
DROP TABLE IF EXISTS reporting.v_sales_orders CASCADE;
DROP TABLE IF EXISTS reporting.v_invoices CASCADE;
DROP TABLE IF EXISTS reporting.v_inventory_levels CASCADE;
DROP TABLE IF EXISTS reporting.v_purchase_orders CASCADE;
DROP TABLE IF EXISTS reporting.v_cashbook_transactions CASCADE;
DROP TABLE IF EXISTS reporting.v_general_ledger CASCADE;
DROP TABLE IF EXISTS reporting.v_customers CASCADE;
DROP TABLE IF EXISTS reporting.v_suppliers CASCADE;
DROP TABLE IF EXISTS reporting.v_product_catalogue CASCADE;


-- ============================================================================
-- 1. v_sales_orders — Denormalized sales orders with customer details
-- ============================================================================
CREATE VIEW reporting.v_sales_orders AS
SELECT
  so.id,
  so.order_number,
  c.first_name || ' ' || c.last_name AS customer_name,
  so.customer_id,
  so.order_date,
  so.total_amount,
  so.status,
  COALESCE(sol_agg.line_count, 0)     AS line_count,
  COALESCE(sol_agg.total_qty, 0)      AS total_quantity,
  so.org_id,
  so.branch_id
FROM sales.sales_orders so
LEFT JOIN core.contacts c ON c.id = so.customer_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)          AS line_count,
    SUM(sol.quantity)  AS total_qty
  FROM sales.sales_order_lines sol
  WHERE sol.order_id = so.id
) sol_agg ON TRUE;

COMMENT ON VIEW  reporting.v_sales_orders IS 'Denormalized sales order view with customer name and line aggregates';
COMMENT ON COLUMN reporting.v_sales_orders.id IS 'Sales order primary key';
COMMENT ON COLUMN reporting.v_sales_orders.order_number IS 'Unique order reference number | display_column';
COMMENT ON COLUMN reporting.v_sales_orders.customer_name IS 'Customer display name (first + last)';
COMMENT ON COLUMN reporting.v_sales_orders.customer_id IS 'fk:core.contacts.id Customer foreign key';
COMMENT ON COLUMN reporting.v_sales_orders.total_amount IS 'Order total including tax';
COMMENT ON COLUMN reporting.v_sales_orders.line_count IS 'Number of line items on the order';
COMMENT ON COLUMN reporting.v_sales_orders.total_quantity IS 'Sum of quantities across all lines';
COMMENT ON COLUMN reporting.v_sales_orders.org_id IS 'Organization ID for RLS filtering';
COMMENT ON COLUMN reporting.v_sales_orders.branch_id IS 'Branch ID for RLS filtering';


-- ============================================================================
-- 2. v_sales_by_branch — Sales revenue aggregated by branch and month
-- ============================================================================
CREATE VIEW reporting.v_sales_by_branch AS
SELECT
  b.id                                          AS branch_id,
  b.code                                        AS branch_code,
  b.name                                        AS branch_name,
  DATE_TRUNC('month', so.order_date)::DATE      AS month,
  COUNT(so.id)                                  AS order_count,
  COALESCE(SUM(so.total_amount), 0)             AS revenue,
  COALESCE(AVG(so.total_amount), 0)             AS avg_order_value,
  so.org_id
FROM sales.sales_orders so
JOIN core.branches b ON b.id = so.branch_id
GROUP BY b.id, b.code, b.name, DATE_TRUNC('month', so.order_date)::DATE, so.org_id;

COMMENT ON VIEW  reporting.v_sales_by_branch IS 'Monthly sales revenue aggregated by branch for performance comparison';
COMMENT ON COLUMN reporting.v_sales_by_branch.branch_id IS 'fk:core.branches.id Branch FK';
COMMENT ON COLUMN reporting.v_sales_by_branch.revenue IS 'Total revenue for the branch in the period';
COMMENT ON COLUMN reporting.v_sales_by_branch.avg_order_value IS 'Average order value for the branch in the period';
COMMENT ON COLUMN reporting.v_sales_by_branch.org_id IS 'Organization ID for RLS filtering';


-- ============================================================================
-- 3. v_outstanding_orders — Unfulfilled or partially fulfilled orders
-- ============================================================================
CREATE VIEW reporting.v_outstanding_orders AS
SELECT
  so.id,
  so.order_number,
  c.first_name || ' ' || c.last_name  AS customer_name,
  so.customer_id,
  so.order_date,
  so.total_amount,
  so.status,
  COALESCE(del_agg.shipped_qty, 0)    AS shipped_qty,
  COALESCE(del_agg.ordered_qty, so.total_amount) AS ordered_qty,
  CASE
    WHEN COALESCE(del_agg.shipped_qty, 0) = 0 THEN 'Not Shipped'
    WHEN del_agg.shipped_qty < del_agg.ordered_qty THEN 'Partially Shipped'
    ELSE 'Fully Shipped'
  END                                  AS fulfilment_status,
  CURRENT_DATE - so.order_date         AS days_outstanding,
  so.org_id,
  so.branch_id
FROM sales.sales_orders so
LEFT JOIN core.contacts c ON c.id = so.customer_id
LEFT JOIN LATERAL (
  SELECT
    SUM(d.shipped_qty)  AS shipped_qty,
    SUM(d.ordered_qty)  AS ordered_qty
  FROM sales.deliveries d
  WHERE d.order_id = so.id
) del_agg ON TRUE
WHERE so.status NOT IN ('cancelled', 'completed');

COMMENT ON VIEW  reporting.v_outstanding_orders IS 'Outstanding and partially fulfilled sales orders with fulfilment status';
COMMENT ON COLUMN reporting.v_outstanding_orders.customer_id IS 'fk:core.contacts.id Customer FK';
COMMENT ON COLUMN reporting.v_outstanding_orders.fulfilment_status IS 'Fulfilment level: Not Shipped, Partially Shipped, Fully Shipped';
COMMENT ON COLUMN reporting.v_outstanding_orders.days_outstanding IS 'Days since order was placed';
COMMENT ON COLUMN reporting.v_outstanding_orders.org_id IS 'Organization ID for RLS filtering';
COMMENT ON COLUMN reporting.v_outstanding_orders.branch_id IS 'Branch ID for RLS filtering';


-- ============================================================================
-- 4. v_sales_summary — Monthly revenue aggregation (used by Sales Summary dashboard)
-- ============================================================================
CREATE VIEW reporting.v_sales_summary AS
SELECT
  DATE_TRUNC('month', so.order_date)::DATE AS month,
  COUNT(so.id)                              AS order_count,
  COALESCE(SUM(so.total_amount), 0)         AS revenue,
  COALESCE(AVG(so.total_amount), 0)         AS avg_order_value,
  COUNT(DISTINCT so.customer_id)            AS unique_customers,
  so.org_id,
  so.branch_id
FROM sales.sales_orders so
GROUP BY DATE_TRUNC('month', so.order_date)::DATE, so.org_id, so.branch_id;

COMMENT ON VIEW  reporting.v_sales_summary IS 'Monthly sales summary with revenue, order count, and unique customers';
COMMENT ON COLUMN reporting.v_sales_summary.revenue IS 'Total revenue for the month';
COMMENT ON COLUMN reporting.v_sales_summary.avg_order_value IS 'Average order value for the month';
COMMENT ON COLUMN reporting.v_sales_summary.unique_customers IS 'Count of distinct customers who placed orders';
COMMENT ON COLUMN reporting.v_sales_summary.org_id IS 'Organization ID for RLS filtering';
COMMENT ON COLUMN reporting.v_sales_summary.branch_id IS 'Branch ID for RLS filtering';


-- ============================================================================
-- 5. v_customer_orders — Customer-level order aggregation
-- ============================================================================
CREATE VIEW reporting.v_customer_orders AS
SELECT
  c.id                                      AS customer_id,
  c.first_name || ' ' || c.last_name       AS customer_name,
  c.email,
  COUNT(so.id)                              AS total_orders,
  COALESCE(SUM(so.total_amount), 0)         AS total_revenue,
  COALESCE(AVG(so.total_amount), 0)         AS avg_order_value,
  MIN(so.order_date)                        AS first_order_date,
  MAX(so.order_date)                        AS last_order_date,
  c.org_id,
  so.branch_id
FROM core.contacts c
LEFT JOIN sales.sales_orders so ON so.customer_id = c.id
GROUP BY c.id, c.first_name, c.last_name, c.email, c.org_id, so.branch_id;

COMMENT ON VIEW  reporting.v_customer_orders IS 'Customer-level order history with revenue ranking and date ranges';
COMMENT ON COLUMN reporting.v_customer_orders.customer_id IS 'fk:core.contacts.id Customer FK';
COMMENT ON COLUMN reporting.v_customer_orders.total_revenue IS 'Lifetime revenue from this customer';
COMMENT ON COLUMN reporting.v_customer_orders.first_order_date IS 'Date of first order';
COMMENT ON COLUMN reporting.v_customer_orders.last_order_date IS 'Date of most recent order';
COMMENT ON COLUMN reporting.v_customer_orders.org_id IS 'Organization ID for RLS filtering';


-- ============================================================================
-- 6. v_invoices — Denormalized invoices with aging buckets
-- ============================================================================
CREATE VIEW reporting.v_invoices AS
SELECT
  inv.id,
  inv.invoice_number,
  c.first_name || ' ' || c.last_name AS customer_name,
  inv.customer_id,
  inv.invoice_date,
  inv.due_date,
  inv.total_amount,
  inv.balance_due,
  CASE
    WHEN inv.due_date >= CURRENT_DATE THEN 'Current'
    WHEN CURRENT_DATE - inv.due_date <= 30 THEN '1-30 Days'
    WHEN CURRENT_DATE - inv.due_date <= 60 THEN '31-60 Days'
    WHEN CURRENT_DATE - inv.due_date <= 90 THEN '61-90 Days'
    ELSE '90+ Days'
  END                                                        AS aging_bucket,
  GREATEST(CURRENT_DATE - inv.due_date, 0)                   AS days_overdue,
  CASE WHEN inv.balance_due <= 0 THEN 'Paid' ELSE 'Open' END AS payment_status,
  inv.org_id,
  inv.branch_id
FROM finance.invoices inv
LEFT JOIN core.contacts c ON c.id = inv.customer_id;

COMMENT ON VIEW  reporting.v_invoices IS 'Denormalized invoice view with aging buckets and payment status';
COMMENT ON COLUMN reporting.v_invoices.aging_bucket IS 'Aging period: Current, 1-30, 31-60, 61-90, 90+ Days';
COMMENT ON COLUMN reporting.v_invoices.days_overdue IS 'Number of days past due date (0 if not overdue)';
COMMENT ON COLUMN reporting.v_invoices.payment_status IS 'Payment status: Paid or Open';
COMMENT ON COLUMN reporting.v_invoices.customer_id IS 'fk:core.contacts.id Invoice customer FK';
COMMENT ON COLUMN reporting.v_invoices.org_id IS 'Organization ID for RLS filtering';
COMMENT ON COLUMN reporting.v_invoices.branch_id IS 'Branch ID for RLS filtering';


-- ============================================================================
-- 7. v_inventory_levels — Current stock levels with product and warehouse details
-- ============================================================================
CREATE VIEW reporting.v_inventory_levels AS
SELECT
  sl.id,
  p.id                                          AS product_id,
  p.product_code,
  p.product_name,
  p.category                                    AS product_category,
  w.id                                          AS warehouse_id,
  w.warehouse_name                              AS warehouse,
  sl.quantity                                    AS quantity_on_hand,
  sl.reorder_point,
  COALESCE(sl.unit_cost, p.unit_cost, 0)        AS unit_cost,
  (sl.quantity * COALESCE(sl.unit_cost, p.unit_cost, 0))::NUMERIC(12,2) AS total_value,
  CASE
    WHEN sl.quantity <= 0 THEN 'Out of Stock'
    WHEN sl.quantity <= sl.reorder_point THEN 'Below Reorder'
    ELSE 'In Stock'
  END                                            AS stock_status,
  sl.org_id,
  w.branch_id
FROM inventory.stock_levels sl
LEFT JOIN inventory.products p ON p.id = sl.product_id
LEFT JOIN inventory.warehouses w ON w.id = sl.warehouse_id;

COMMENT ON VIEW  reporting.v_inventory_levels IS 'Current inventory stock levels with product details and valuation';
COMMENT ON COLUMN reporting.v_inventory_levels.product_id IS 'fk:inventory.products.id Product FK';
COMMENT ON COLUMN reporting.v_inventory_levels.warehouse_id IS 'fk:inventory.warehouses.id Warehouse FK';
COMMENT ON COLUMN reporting.v_inventory_levels.total_value IS 'Inventory value (qty x unit cost)';
COMMENT ON COLUMN reporting.v_inventory_levels.stock_status IS 'Stock status: Out of Stock, Below Reorder, In Stock';
COMMENT ON COLUMN reporting.v_inventory_levels.org_id IS 'Organization ID for RLS filtering';


-- ============================================================================
-- 8. v_inventory_aging — Stock aging by days since last receipt
-- ============================================================================
CREATE VIEW reporting.v_inventory_aging AS
SELECT
  sl.id,
  p.product_code,
  p.product_name,
  w.warehouse_name                               AS warehouse,
  sl.quantity                                     AS quantity_on_hand,
  COALESCE(sl.unit_cost, p.unit_cost, 0)         AS unit_cost,
  (sl.quantity * COALESCE(sl.unit_cost, p.unit_cost, 0))::NUMERIC(12,2) AS total_value,
  sl.last_received_date,
  CASE
    WHEN sl.last_received_date IS NULL THEN 'Unknown'
    WHEN CURRENT_DATE - sl.last_received_date <= 30 THEN '0-30 Days'
    WHEN CURRENT_DATE - sl.last_received_date <= 60 THEN '31-60 Days'
    WHEN CURRENT_DATE - sl.last_received_date <= 90 THEN '61-90 Days'
    WHEN CURRENT_DATE - sl.last_received_date <= 180 THEN '91-180 Days'
    ELSE '180+ Days'
  END                                             AS aging_bucket,
  COALESCE(CURRENT_DATE - sl.last_received_date, 0) AS days_in_stock,
  CASE
    WHEN sl.quantity > 0 AND COALESCE(mov_agg.monthly_usage, 0) > 0
      THEN ROUND(sl.quantity / mov_agg.monthly_usage, 1)
    ELSE NULL
  END                                             AS months_of_supply,
  sl.org_id,
  w.branch_id
FROM inventory.stock_levels sl
LEFT JOIN inventory.products p ON p.id = sl.product_id
LEFT JOIN inventory.warehouses w ON w.id = sl.warehouse_id
LEFT JOIN LATERAL (
  SELECT
    COALESCE(ABS(SUM(sm.quantity)) / NULLIF(
      EXTRACT(EPOCH FROM (CURRENT_DATE - (CURRENT_DATE - INTERVAL '90 days'))) / (30*86400), 0
    ), 0) AS monthly_usage
  FROM inventory.stock_movements sm
  WHERE sm.product_id = sl.product_id
    AND sm.warehouse_id = sl.warehouse_id
    AND sm.movement_type = 'issue'
    AND sm.movement_date >= CURRENT_DATE - INTERVAL '90 days'
) mov_agg ON TRUE
WHERE sl.quantity > 0;

COMMENT ON VIEW  reporting.v_inventory_aging IS 'Inventory aging analysis by days since last receipt with months-of-supply calculation';
COMMENT ON COLUMN reporting.v_inventory_aging.aging_bucket IS 'Age band: 0-30, 31-60, 61-90, 91-180, 180+ Days';
COMMENT ON COLUMN reporting.v_inventory_aging.months_of_supply IS 'Estimated months of supply based on 90-day average usage';
COMMENT ON COLUMN reporting.v_inventory_aging.days_in_stock IS 'Days since last receipt of this product';
COMMENT ON COLUMN reporting.v_inventory_aging.org_id IS 'Organization ID for RLS filtering';


-- ============================================================================
-- 9. v_stock_movements — Stock movement history with product/warehouse details
-- ============================================================================
CREATE VIEW reporting.v_stock_movements AS
SELECT
  sm.id,
  p.product_code,
  p.product_name,
  w.warehouse_name                               AS warehouse,
  sm.movement_type,
  sm.quantity,
  COALESCE(p.unit_cost, 0)                       AS unit_cost,
  (sm.quantity * COALESCE(p.unit_cost, 0))::NUMERIC(12,2) AS movement_value,
  sm.reference_type,
  sm.reference_id,
  sm.movement_date,
  sm.product_id,
  sm.warehouse_id,
  sm.org_id,
  sm.branch_id
FROM inventory.stock_movements sm
LEFT JOIN inventory.products p ON p.id = sm.product_id
LEFT JOIN inventory.warehouses w ON w.id = sm.warehouse_id;

COMMENT ON VIEW  reporting.v_stock_movements IS 'Stock movement history with product and warehouse details';
COMMENT ON COLUMN reporting.v_stock_movements.movement_type IS 'Movement type: receipt, issue, transfer, adjustment';
COMMENT ON COLUMN reporting.v_stock_movements.movement_value IS 'Value of movement (qty x unit cost)';
COMMENT ON COLUMN reporting.v_stock_movements.reference_type IS 'Source document type (e.g., sales_order, purchase_order)';
COMMENT ON COLUMN reporting.v_stock_movements.product_id IS 'fk:inventory.products.id Product FK';
COMMENT ON COLUMN reporting.v_stock_movements.warehouse_id IS 'fk:inventory.warehouses.id Warehouse FK';
COMMENT ON COLUMN reporting.v_stock_movements.org_id IS 'Organization ID for RLS filtering';
COMMENT ON COLUMN reporting.v_stock_movements.branch_id IS 'Branch ID for RLS filtering';


-- ============================================================================
-- 10. v_purchase_orders — Enhanced purchase orders with line-level details
-- ============================================================================
CREATE VIEW reporting.v_purchase_orders AS
SELECT
  po.id,
  po.po_number,
  c.first_name || ' ' || c.last_name   AS supplier_name,
  po.supplier_id,
  po.order_date,
  po.expected_date,
  po.total_amount,
  po.status,
  COALESCE(pol_agg.line_count, 0)       AS line_count,
  COALESCE(pol_agg.total_ordered, 0)    AS total_ordered_qty,
  COALESCE(pol_agg.total_received, 0)   AS total_received_qty,
  CASE
    WHEN COALESCE(pol_agg.total_received, 0) = 0 THEN 'Not Received'
    WHEN pol_agg.total_received < pol_agg.total_ordered THEN 'Partially Received'
    ELSE 'Fully Received'
  END                                    AS receipt_status,
  po.org_id,
  po.branch_id
FROM procurement.purchase_orders po
LEFT JOIN core.contacts c ON c.id = po.supplier_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)            AS line_count,
    SUM(pol.quantity)   AS total_ordered,
    SUM(pol.received_qty) AS total_received
  FROM procurement.purchase_order_lines pol
  WHERE pol.po_id = po.id
) pol_agg ON TRUE;

COMMENT ON VIEW  reporting.v_purchase_orders IS 'Purchase order pipeline with supplier details and receipt status';
COMMENT ON COLUMN reporting.v_purchase_orders.supplier_id IS 'fk:core.contacts.id Supplier FK';
COMMENT ON COLUMN reporting.v_purchase_orders.receipt_status IS 'Receipt level: Not Received, Partially Received, Fully Received';
COMMENT ON COLUMN reporting.v_purchase_orders.org_id IS 'Organization ID for RLS filtering';
COMMENT ON COLUMN reporting.v_purchase_orders.branch_id IS 'Branch ID for RLS filtering';


-- ============================================================================
-- 11. v_cashbook_transactions — Bank transactions with account details
-- ============================================================================
CREATE VIEW reporting.v_cashbook_transactions AS
SELECT
  t.id,
  t.transaction_date,
  t.description,
  t.amount,
  t.transaction_type,
  ba.account_name                        AS bank_account,
  ba.bank_name,
  ba.account_number                      AS bank_account_number,
  t.bank_account_id,
  CASE
    WHEN t.amount >= 0 THEN t.amount
    ELSE 0
  END                                    AS inflow,
  CASE
    WHEN t.amount < 0 THEN ABS(t.amount)
    ELSE 0
  END                                    AS outflow,
  COALESCE(t.org_id, ba.org_id)          AS org_id,
  NULL::UUID                             AS branch_id
FROM cashbook.transactions t
LEFT JOIN cashbook.bank_accounts ba ON ba.id = t.bank_account_id;

COMMENT ON VIEW  reporting.v_cashbook_transactions IS 'Bank transaction records with inflow/outflow separation';
COMMENT ON COLUMN reporting.v_cashbook_transactions.bank_account_id IS 'fk:cashbook.bank_accounts.id Bank account FK';
COMMENT ON COLUMN reporting.v_cashbook_transactions.inflow IS 'Positive cash inflow amount';
COMMENT ON COLUMN reporting.v_cashbook_transactions.outflow IS 'Cash outflow amount (always positive)';
COMMENT ON COLUMN reporting.v_cashbook_transactions.org_id IS 'Organization ID for RLS filtering';


-- ============================================================================
-- 12. v_general_ledger — GL entries with account names and types
-- ============================================================================
CREATE VIEW reporting.v_general_ledger AS
SELECT
  gl.id,
  COALESCE(coa.account_code, gl.account_code) AS account_code,
  coa.account_name,
  coa.account_type,
  coa.account_category,
  gl.debit,
  gl.credit,
  (gl.debit - gl.credit)                      AS net_amount,
  gl.posting_date,
  gl.account_id,
  gl.org_id,
  NULL::UUID                                   AS branch_id
FROM finance.gl_entries gl
LEFT JOIN finance.chart_of_accounts coa ON coa.id = gl.account_id;

COMMENT ON VIEW  reporting.v_general_ledger IS 'General ledger entries with account classification';
COMMENT ON COLUMN reporting.v_general_ledger.account_type IS 'Account type: asset, liability, equity, revenue, expense';
COMMENT ON COLUMN reporting.v_general_ledger.account_category IS 'Sub-category within the account type';
COMMENT ON COLUMN reporting.v_general_ledger.net_amount IS 'Net amount (debit minus credit)';
COMMENT ON COLUMN reporting.v_general_ledger.account_id IS 'fk:finance.chart_of_accounts.id Account FK';
COMMENT ON COLUMN reporting.v_general_ledger.org_id IS 'Organization ID for RLS filtering';


-- ============================================================================
-- 13. v_customers — Customer master with contact details
-- ============================================================================
CREATE VIEW reporting.v_customers AS
SELECT
  c.id,
  NULL::TEXT                             AS customer_code,
  c.first_name || ' ' || c.last_name    AS customer_name,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.org_id,
  NULL::UUID                             AS branch_id
FROM core.contacts c;

COMMENT ON VIEW  reporting.v_customers IS 'Customer master data view';
COMMENT ON COLUMN reporting.v_customers.customer_name IS 'Full customer name (first + last) | display_column';
COMMENT ON COLUMN reporting.v_customers.org_id IS 'Organization ID for RLS filtering';


-- ============================================================================
-- 14. v_suppliers — Supplier master with contact details
-- ============================================================================
CREATE VIEW reporting.v_suppliers AS
SELECT
  c.id,
  NULL::TEXT                             AS supplier_code,
  c.first_name || ' ' || c.last_name    AS supplier_name,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.org_id,
  NULL::UUID                             AS branch_id
FROM core.contacts c;

COMMENT ON VIEW  reporting.v_suppliers IS 'Supplier master data view';
COMMENT ON COLUMN reporting.v_suppliers.supplier_name IS 'Full supplier name (first + last) | display_column';
COMMENT ON COLUMN reporting.v_suppliers.org_id IS 'Organization ID for RLS filtering';


-- ============================================================================
-- 15. v_product_catalogue — Product catalogue with pricing
-- ============================================================================
CREATE VIEW reporting.v_product_catalogue AS
SELECT
  p.id,
  p.product_code,
  p.product_name,
  p.category,
  p.unit_price,
  p.unit_cost,
  CASE WHEN p.unit_price > 0
    THEN ROUND(((p.unit_price - p.unit_cost) / p.unit_price) * 100, 2)
    ELSE 0
  END                                    AS margin_pct,
  p.uom,
  p.is_active,
  p.org_id,
  NULL::UUID                             AS branch_id
FROM inventory.products p;

COMMENT ON VIEW  reporting.v_product_catalogue IS 'Product catalogue with pricing and margin calculation';
COMMENT ON COLUMN reporting.v_product_catalogue.product_code IS 'Product SKU | display_column';
COMMENT ON COLUMN reporting.v_product_catalogue.margin_pct IS 'Gross margin percentage ((price-cost)/price x 100)';
COMMENT ON COLUMN reporting.v_product_catalogue.org_id IS 'Organization ID for RLS filtering';


-- ============================================================================
-- 16. v_pick_pack_performance — Warehouse pick/pack fulfilment metrics
-- ============================================================================
CREATE VIEW reporting.v_pick_pack_performance AS
SELECT
  d.id                                   AS delivery_id,
  d.delivery_number,
  so.order_number,
  d.order_id,
  d.delivery_date,
  d.status,
  d.shipped_qty,
  d.ordered_qty,
  CASE
    WHEN d.ordered_qty > 0
      THEN ROUND((d.shipped_qty / d.ordered_qty) * 100, 1)
    ELSE 0
  END                                    AS fill_rate_pct,
  d.pick_start_time,
  d.pick_end_time,
  d.pack_start_time,
  d.pack_end_time,
  CASE
    WHEN d.pick_start_time IS NOT NULL AND d.pick_end_time IS NOT NULL
      THEN EXTRACT(EPOCH FROM (d.pick_end_time - d.pick_start_time)) / 60.0
    ELSE NULL
  END                                    AS pick_duration_mins,
  CASE
    WHEN d.pack_start_time IS NOT NULL AND d.pack_end_time IS NOT NULL
      THEN EXTRACT(EPOCH FROM (d.pack_end_time - d.pack_start_time)) / 60.0
    ELSE NULL
  END                                    AS pack_duration_mins,
  CASE
    WHEN d.pick_start_time IS NOT NULL AND d.pack_end_time IS NOT NULL
      THEN EXTRACT(EPOCH FROM (d.pack_end_time - d.pick_start_time)) / 60.0
    ELSE NULL
  END                                    AS total_fulfilment_mins,
  d.picker_id,
  d.org_id,
  d.branch_id
FROM sales.deliveries d
LEFT JOIN sales.sales_orders so ON so.id = d.order_id;

COMMENT ON VIEW  reporting.v_pick_pack_performance IS 'Pick and pack fulfilment performance with duration metrics';
COMMENT ON COLUMN reporting.v_pick_pack_performance.fill_rate_pct IS 'Fill rate: shipped qty / ordered qty as percentage';
COMMENT ON COLUMN reporting.v_pick_pack_performance.pick_duration_mins IS 'Time spent picking in minutes';
COMMENT ON COLUMN reporting.v_pick_pack_performance.pack_duration_mins IS 'Time spent packing in minutes';
COMMENT ON COLUMN reporting.v_pick_pack_performance.total_fulfilment_mins IS 'Total time from pick start to pack end in minutes';
COMMENT ON COLUMN reporting.v_pick_pack_performance.order_id IS 'fk:sales.sales_orders.id Sales order FK';
COMMENT ON COLUMN reporting.v_pick_pack_performance.org_id IS 'Organization ID for RLS filtering';
COMMENT ON COLUMN reporting.v_pick_pack_performance.branch_id IS 'Branch ID for RLS filtering';


-- ============================================================================
-- 17. v_otif — On Time In Full delivery metrics
-- ============================================================================
CREATE VIEW reporting.v_otif AS
SELECT
  d.id                                   AS delivery_id,
  d.delivery_number,
  so.order_number,
  d.order_id,
  c.first_name || ' ' || c.last_name    AS customer_name,
  so.customer_id,
  d.promised_date,
  d.delivery_date,
  d.ordered_qty,
  d.shipped_qty,
  -- On-time flag
  CASE
    WHEN d.delivery_date IS NOT NULL AND d.promised_date IS NOT NULL
         AND d.delivery_date <= d.promised_date THEN TRUE
    ELSE FALSE
  END                                    AS is_on_time,
  -- In-full flag
  CASE
    WHEN d.ordered_qty > 0 AND d.shipped_qty >= d.ordered_qty THEN TRUE
    ELSE FALSE
  END                                    AS is_in_full,
  -- OTIF (both on-time AND in-full)
  CASE
    WHEN d.delivery_date IS NOT NULL AND d.promised_date IS NOT NULL
         AND d.delivery_date <= d.promised_date
         AND d.ordered_qty > 0 AND d.shipped_qty >= d.ordered_qty THEN TRUE
    ELSE FALSE
  END                                    AS is_otif,
  CASE
    WHEN d.delivery_date IS NOT NULL AND d.promised_date IS NOT NULL
      THEN d.delivery_date - d.promised_date
    ELSE NULL
  END                                    AS days_late,
  d.org_id,
  d.branch_id
FROM sales.deliveries d
LEFT JOIN sales.sales_orders so ON so.id = d.order_id
LEFT JOIN core.contacts c ON c.id = so.customer_id;

COMMENT ON VIEW  reporting.v_otif IS 'On Time In Full (OTIF) delivery metrics for service-level tracking';
COMMENT ON COLUMN reporting.v_otif.is_on_time IS 'TRUE if delivered on or before promised date';
COMMENT ON COLUMN reporting.v_otif.is_in_full IS 'TRUE if shipped quantity >= ordered quantity';
COMMENT ON COLUMN reporting.v_otif.is_otif IS 'TRUE if both on-time AND in-full';
COMMENT ON COLUMN reporting.v_otif.days_late IS 'Days past promised date (negative = early, 0 = on-time)';
COMMENT ON COLUMN reporting.v_otif.customer_id IS 'fk:core.contacts.id Customer FK';
COMMENT ON COLUMN reporting.v_otif.order_id IS 'fk:sales.sales_orders.id Sales order FK';
COMMENT ON COLUMN reporting.v_otif.org_id IS 'Organization ID for RLS filtering';
COMMENT ON COLUMN reporting.v_otif.branch_id IS 'Branch ID for RLS filtering';


-- ============================================================================
-- 18. v_ap_aging — Accounts Payable aging (supplier bills)
-- ============================================================================
CREATE VIEW reporting.v_ap_aging AS
SELECT
  ap.id,
  ap.bill_number,
  c.first_name || ' ' || c.last_name    AS supplier_name,
  ap.supplier_id,
  ap.bill_date,
  ap.due_date,
  ap.total_amount,
  ap.amount_paid,
  ap.balance_due,
  ap.status,
  CASE
    WHEN ap.due_date >= CURRENT_DATE THEN 'Current'
    WHEN CURRENT_DATE - ap.due_date <= 30 THEN '1-30 Days'
    WHEN CURRENT_DATE - ap.due_date <= 60 THEN '31-60 Days'
    WHEN CURRENT_DATE - ap.due_date <= 90 THEN '61-90 Days'
    ELSE '90+ Days'
  END                                    AS aging_bucket,
  GREATEST(CURRENT_DATE - ap.due_date, 0) AS days_overdue,
  ap.org_id,
  ap.branch_id
FROM finance.accounts_payable ap
LEFT JOIN core.contacts c ON c.id = ap.supplier_id;

COMMENT ON VIEW  reporting.v_ap_aging IS 'Accounts Payable aging analysis with supplier details and overdue tracking';
COMMENT ON COLUMN reporting.v_ap_aging.aging_bucket IS 'Aging period: Current, 1-30, 31-60, 61-90, 90+ Days';
COMMENT ON COLUMN reporting.v_ap_aging.days_overdue IS 'Number of days past due date';
COMMENT ON COLUMN reporting.v_ap_aging.supplier_id IS 'fk:core.contacts.id Supplier FK';
COMMENT ON COLUMN reporting.v_ap_aging.org_id IS 'Organization ID for RLS filtering';
COMMENT ON COLUMN reporting.v_ap_aging.branch_id IS 'Branch ID for RLS filtering';


-- ============================================================================
-- 19. v_budget_variance — Budget vs actual comparison by account and period
-- ============================================================================
CREATE VIEW reporting.v_budget_variance AS
SELECT
  coa.id                                 AS account_id,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  coa.account_category,
  b.fiscal_year,
  b.fiscal_month,
  b.budget_amount,
  COALESCE(act.actual_amount, 0)         AS actual_amount,
  b.budget_amount - COALESCE(act.actual_amount, 0) AS variance_amount,
  CASE
    WHEN b.budget_amount <> 0
      THEN ROUND(((COALESCE(act.actual_amount, 0) - b.budget_amount) / ABS(b.budget_amount)) * 100, 2)
    ELSE 0
  END                                    AS variance_pct,
  CASE
    WHEN COALESCE(act.actual_amount, 0) > b.budget_amount THEN 'Over Budget'
    WHEN COALESCE(act.actual_amount, 0) < b.budget_amount THEN 'Under Budget'
    ELSE 'On Budget'
  END                                    AS budget_status,
  b.org_id,
  b.branch_id
FROM finance.budgets b
JOIN finance.chart_of_accounts coa ON coa.id = b.account_id
LEFT JOIN LATERAL (
  SELECT
    SUM(gl.debit - gl.credit) AS actual_amount
  FROM finance.gl_entries gl
  WHERE gl.account_id = b.account_id
    AND EXTRACT(YEAR FROM gl.posting_date) = b.fiscal_year
    AND EXTRACT(MONTH FROM gl.posting_date) = b.fiscal_month
) act ON TRUE;

COMMENT ON VIEW  reporting.v_budget_variance IS 'Budget vs actual variance analysis by account and fiscal period';
COMMENT ON COLUMN reporting.v_budget_variance.variance_amount IS 'Budget minus actual (positive = under budget)';
COMMENT ON COLUMN reporting.v_budget_variance.variance_pct IS 'Variance as percentage of budget';
COMMENT ON COLUMN reporting.v_budget_variance.budget_status IS 'Status: Over Budget, Under Budget, On Budget';
COMMENT ON COLUMN reporting.v_budget_variance.account_id IS 'fk:finance.chart_of_accounts.id Account FK';
COMMENT ON COLUMN reporting.v_budget_variance.org_id IS 'Organization ID for RLS filtering';
COMMENT ON COLUMN reporting.v_budget_variance.branch_id IS 'Branch ID for RLS filtering';


-- ============================================================================
-- 20. v_pnl — Profit and Loss statement view
-- ============================================================================
CREATE VIEW reporting.v_pnl AS
SELECT
  coa.account_code,
  coa.account_name,
  coa.account_type,
  coa.account_category,
  DATE_TRUNC('month', gl.posting_date)::DATE  AS month,
  SUM(gl.debit)                                AS total_debit,
  SUM(gl.credit)                               AS total_credit,
  CASE
    WHEN coa.account_type = 'revenue'
      THEN SUM(gl.credit - gl.debit)
    WHEN coa.account_type = 'expense'
      THEN SUM(gl.debit - gl.credit)
    ELSE SUM(gl.debit - gl.credit)
  END                                          AS net_amount,
  coa.id                                       AS account_id,
  gl.org_id,
  NULL::UUID                                   AS branch_id
FROM finance.gl_entries gl
JOIN finance.chart_of_accounts coa ON coa.id = gl.account_id
WHERE coa.account_type IN ('revenue', 'expense')
GROUP BY coa.account_code, coa.account_name, coa.account_type, coa.account_category,
         DATE_TRUNC('month', gl.posting_date)::DATE, coa.id, gl.org_id;

COMMENT ON VIEW  reporting.v_pnl IS 'Profit and Loss statement aggregated by account and month';
COMMENT ON COLUMN reporting.v_pnl.net_amount IS 'Net P&L amount (revenue: credit-debit, expense: debit-credit)';
COMMENT ON COLUMN reporting.v_pnl.account_type IS 'Account type: revenue or expense';
COMMENT ON COLUMN reporting.v_pnl.account_category IS 'Sub-category (e.g., cost_of_sales, operating_expense)';
COMMENT ON COLUMN reporting.v_pnl.account_id IS 'fk:finance.chart_of_accounts.id Account FK';
COMMENT ON COLUMN reporting.v_pnl.org_id IS 'Organization ID for RLS filtering';


-- ============================================================================
-- 21. v_balance_sheet — Balance Sheet position view
-- ============================================================================
CREATE VIEW reporting.v_balance_sheet AS
SELECT
  coa.account_code,
  coa.account_name,
  coa.account_type,
  coa.account_category,
  DATE_TRUNC('month', gl.posting_date)::DATE AS as_at_month,
  SUM(gl.debit)                               AS total_debit,
  SUM(gl.credit)                              AS total_credit,
  CASE
    WHEN coa.account_type = 'asset'
      THEN SUM(gl.debit - gl.credit)
    WHEN coa.account_type IN ('liability', 'equity')
      THEN SUM(gl.credit - gl.debit)
    ELSE SUM(gl.debit - gl.credit)
  END                                         AS balance,
  coa.id                                      AS account_id,
  gl.org_id,
  NULL::UUID                                  AS branch_id
FROM finance.gl_entries gl
JOIN finance.chart_of_accounts coa ON coa.id = gl.account_id
WHERE coa.account_type IN ('asset', 'liability', 'equity')
GROUP BY coa.account_code, coa.account_name, coa.account_type, coa.account_category,
         DATE_TRUNC('month', gl.posting_date)::DATE, coa.id, gl.org_id;

COMMENT ON VIEW  reporting.v_balance_sheet IS 'Balance Sheet position by account and month';
COMMENT ON COLUMN reporting.v_balance_sheet.balance IS 'Account balance (assets: debit-credit, liabilities/equity: credit-debit)';
COMMENT ON COLUMN reporting.v_balance_sheet.as_at_month IS 'Month end date for the balance position';
COMMENT ON COLUMN reporting.v_balance_sheet.account_type IS 'Account type: asset, liability, or equity';
COMMENT ON COLUMN reporting.v_balance_sheet.account_id IS 'fk:finance.chart_of_accounts.id Account FK';
COMMENT ON COLUMN reporting.v_balance_sheet.org_id IS 'Organization ID for RLS filtering';


-- ============================================================================
-- COMMENT ON annotations for base tables (idempotent)
-- ============================================================================
COMMENT ON VIEW reporting.v_sales_orders IS 'Denormalized sales order view with customer name and line aggregates';
COMMENT ON VIEW reporting.v_invoices IS 'Denormalized invoice view with aging buckets and payment status';
COMMENT ON VIEW reporting.v_inventory_levels IS 'Current inventory stock levels with product details and valuation';
COMMENT ON VIEW reporting.v_purchase_orders IS 'Purchase order pipeline with supplier details and receipt status';
COMMENT ON VIEW reporting.v_cashbook_transactions IS 'Bank transaction records with inflow/outflow separation';
COMMENT ON VIEW reporting.v_general_ledger IS 'General ledger entries with account classification';
COMMENT ON VIEW reporting.v_customers IS 'Customer master data view';
COMMENT ON VIEW reporting.v_suppliers IS 'Supplier master data view';
COMMENT ON VIEW reporting.v_product_catalogue IS 'Product catalogue with pricing and margin calculation';


-- ============================================================================
-- Done — all 21 reporting views created successfully
-- ============================================================================
