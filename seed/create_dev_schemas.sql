-- Development schemas for JRNY Data Dictionary testing
-- These simulate the JRNY ERP read-replica schemas

-- Create JRNY schemas
DO $$ BEGIN
  EXECUTE 'CREATE SCHEMA IF NOT EXISTS reporting';
  EXECUTE 'CREATE SCHEMA IF NOT EXISTS core';
  EXECUTE 'CREATE SCHEMA IF NOT EXISTS sales';
  EXECUTE 'CREATE SCHEMA IF NOT EXISTS finance';
  EXECUTE 'CREATE SCHEMA IF NOT EXISTS inventory';
  EXECUTE 'CREATE SCHEMA IF NOT EXISTS procurement';
  EXECUTE 'CREATE SCHEMA IF NOT EXISTS cashbook';
  EXECUTE 'CREATE SCHEMA IF NOT EXISTS crm';
END $$;

-- Reporting schema views (as tables for dev)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='reporting' AND table_name='v_sales_orders') THEN
    EXECUTE '
      CREATE TABLE reporting.v_sales_orders (
        id UUID DEFAULT gen_random_uuid(),
        order_number TEXT,
        customer_name TEXT,
        order_date DATE,
        total_amount NUMERIC(12,2),
        status TEXT,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='reporting' AND table_name='v_invoices') THEN
    EXECUTE '
      CREATE TABLE reporting.v_invoices (
        id UUID DEFAULT gen_random_uuid(),
        invoice_number TEXT,
        customer_name TEXT,
        invoice_date DATE,
        due_date DATE,
        total_amount NUMERIC(12,2),
        balance_due NUMERIC(12,2),
        aging_bucket TEXT,
        org_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='reporting' AND table_name='v_inventory_levels') THEN
    EXECUTE '
      CREATE TABLE reporting.v_inventory_levels (
        id UUID DEFAULT gen_random_uuid(),
        product_code TEXT,
        product_name TEXT,
        warehouse TEXT,
        quantity_on_hand NUMERIC(12,2),
        reorder_point NUMERIC(12,2),
        unit_cost NUMERIC(12,2),
        total_value NUMERIC(12,2),
        org_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='reporting' AND table_name='v_purchase_orders') THEN
    EXECUTE '
      CREATE TABLE reporting.v_purchase_orders (
        id UUID DEFAULT gen_random_uuid(),
        po_number TEXT,
        supplier_name TEXT,
        order_date DATE,
        expected_date DATE,
        total_amount NUMERIC(12,2),
        status TEXT,
        org_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='reporting' AND table_name='v_cashbook_transactions') THEN
    EXECUTE '
      CREATE TABLE reporting.v_cashbook_transactions (
        id UUID DEFAULT gen_random_uuid(),
        transaction_date DATE,
        description TEXT,
        amount NUMERIC(12,2),
        transaction_type TEXT,
        bank_account TEXT,
        org_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='reporting' AND table_name='v_general_ledger') THEN
    EXECUTE '
      CREATE TABLE reporting.v_general_ledger (
        id UUID DEFAULT gen_random_uuid(),
        account_code TEXT,
        account_name TEXT,
        debit NUMERIC(12,2),
        credit NUMERIC(12,2),
        posting_date DATE,
        org_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='reporting' AND table_name='v_customers') THEN
    EXECUTE '
      CREATE TABLE reporting.v_customers (
        id UUID DEFAULT gen_random_uuid(),
        customer_code TEXT,
        customer_name TEXT,
        email TEXT,
        phone TEXT,
        org_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='reporting' AND table_name='v_suppliers') THEN
    EXECUTE '
      CREATE TABLE reporting.v_suppliers (
        id UUID DEFAULT gen_random_uuid(),
        supplier_code TEXT,
        supplier_name TEXT,
        email TEXT,
        phone TEXT,
        org_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='reporting' AND table_name='v_product_catalogue') THEN
    EXECUTE '
      CREATE TABLE reporting.v_product_catalogue (
        id UUID DEFAULT gen_random_uuid(),
        product_code TEXT,
        product_name TEXT,
        category TEXT,
        unit_price NUMERIC(12,2),
        org_id UUID
      )';
  END IF;
END $$;

-- Core schema
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='core' AND table_name='organizations') THEN
    EXECUTE '
      CREATE TABLE core.organizations (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='core' AND table_name='branches') THEN
    EXECUTE '
      CREATE TABLE core.branches (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        org_id UUID,
        name TEXT NOT NULL,
        code TEXT
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='core' AND table_name='contacts') THEN
    EXECUTE '
      CREATE TABLE core.contacts (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        phone TEXT,
        org_id UUID
      )';
  END IF;
END $$;

-- Sales schema
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='sales' AND table_name='quotes') THEN
    EXECUTE '
      CREATE TABLE sales.quotes (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        quote_number TEXT,
        customer_id UUID,
        total_amount NUMERIC(12,2),
        status TEXT DEFAULT ''draft'',
        created_at TIMESTAMP DEFAULT now()
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='sales' AND table_name='sales_orders') THEN
    EXECUTE '
      CREATE TABLE sales.sales_orders (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        order_number TEXT,
        customer_id UUID,
        total_amount NUMERIC(12,2),
        status TEXT DEFAULT ''pending'',
        order_date DATE DEFAULT CURRENT_DATE
      )';
  END IF;
END $$;

-- Finance schema
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='invoices') THEN
    EXECUTE '
      CREATE TABLE finance.invoices (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        invoice_number TEXT,
        customer_id UUID,
        total_amount NUMERIC(12,2),
        balance_due NUMERIC(12,2),
        invoice_date DATE DEFAULT CURRENT_DATE,
        due_date DATE
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='gl_entries') THEN
    EXECUTE '
      CREATE TABLE finance.gl_entries (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        account_code TEXT,
        debit NUMERIC(12,2) DEFAULT 0,
        credit NUMERIC(12,2) DEFAULT 0,
        posting_date DATE DEFAULT CURRENT_DATE
      )';
  END IF;
END $$;

-- Inventory schema
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='stock_levels') THEN
    EXECUTE '
      CREATE TABLE inventory.stock_levels (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        product_id UUID,
        warehouse_id UUID,
        quantity NUMERIC(12,2) DEFAULT 0,
        reorder_point NUMERIC(12,2) DEFAULT 0
      )';
  END IF;
END $$;

-- Procurement schema
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='procurement' AND table_name='purchase_orders') THEN
    EXECUTE '
      CREATE TABLE procurement.purchase_orders (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        po_number TEXT,
        supplier_id UUID,
        total_amount NUMERIC(12,2),
        status TEXT DEFAULT ''draft'',
        order_date DATE DEFAULT CURRENT_DATE
      )';
  END IF;
END $$;

-- Cashbook schema
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='cashbook' AND table_name='bank_accounts') THEN
    EXECUTE '
      CREATE TABLE cashbook.bank_accounts (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        account_name TEXT,
        account_number TEXT,
        bank_name TEXT,
        balance NUMERIC(12,2) DEFAULT 0
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='cashbook' AND table_name='transactions') THEN
    EXECUTE '
      CREATE TABLE cashbook.transactions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        bank_account_id UUID,
        transaction_date DATE DEFAULT CURRENT_DATE,
        description TEXT,
        amount NUMERIC(12,2),
        transaction_type TEXT
      )';
  END IF;
END $$;

-- CRM schema
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='crm' AND table_name='leads') THEN
    EXECUTE '
      CREATE TABLE crm.leads (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        lead_name TEXT,
        email TEXT,
        phone TEXT,
        source TEXT,
        status TEXT DEFAULT ''new'',
        assigned_to UUID,
        org_id UUID,
        created_at TIMESTAMP DEFAULT now()
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='crm' AND table_name='opportunities') THEN
    EXECUTE '
      CREATE TABLE crm.opportunities (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        opportunity_name TEXT,
        contact_id UUID,
        stage TEXT DEFAULT ''prospecting'',
        amount NUMERIC(12,2),
        close_date DATE,
        org_id UUID,
        created_at TIMESTAMP DEFAULT now()
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='crm' AND table_name='activities') THEN
    EXECUTE '
      CREATE TABLE crm.activities (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        activity_type TEXT,
        subject TEXT,
        contact_id UUID,
        opportunity_id UUID,
        notes TEXT,
        activity_date TIMESTAMP DEFAULT now(),
        org_id UUID
      )';
  END IF;
END $$;

-- Add UNIQUE constraints for schema constraint testing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'uq_branches_code' AND table_schema = 'core'
  ) THEN
    ALTER TABLE core.branches
      ADD CONSTRAINT uq_branches_code UNIQUE (code);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'uq_organizations_code' AND table_schema = 'core'
  ) THEN
    ALTER TABLE core.organizations
      ADD CONSTRAINT uq_organizations_code UNIQUE (code);
  END IF;
END $$;

-- Add a composite unique constraint for testing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'uq_stock_product_warehouse' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.stock_levels
      ADD CONSTRAINT uq_stock_product_warehouse UNIQUE (product_id, warehouse_id);
  END IF;
END $$;

-- Add sales_order_audit table with 2 FKs to same target for multi-FK testing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='sales' AND table_name='sales_order_audit') THEN
    EXECUTE '
      CREATE TABLE sales.sales_order_audit (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        order_id UUID,
        sales_rep_id UUID,
        created_by UUID,
        action TEXT,
        created_at TIMESTAMP DEFAULT now()
      )';
  END IF;
END $$;

-- Add user_preferences table for 1:1 FK cardinality testing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='core' AND table_name='user_preferences') THEN
    EXECUTE '
      CREATE TABLE core.user_preferences (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        theme TEXT DEFAULT ''light'',
        language TEXT DEFAULT ''en'',
        notifications_enabled BOOLEAN DEFAULT true,
        CONSTRAINT uq_user_preferences_user UNIQUE (user_id)
      )';
  END IF;
END $$;

-- Add buying_groups and customer_buying_groups for M:M junction table testing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='crm' AND table_name='buying_groups') THEN
    EXECUTE '
      CREATE TABLE crm.buying_groups (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        group_name TEXT NOT NULL,
        discount_rate NUMERIC(5,2) DEFAULT 0
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='crm' AND table_name='customer_buying_groups') THEN
    EXECUTE '
      CREATE TABLE crm.customer_buying_groups (
        customer_id UUID NOT NULL,
        buying_group_id UUID NOT NULL,
        joined_at TIMESTAMP DEFAULT now(),
        PRIMARY KEY (customer_id, buying_group_id)
      )';
  END IF;
END $$;

-- Add foreign key constraints for schema relationship testing
-- Note: Using DO blocks so constraints are idempotent (skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_branches_org' AND table_schema = 'core'
  ) THEN
    ALTER TABLE core.branches
      ADD CONSTRAINT fk_branches_org FOREIGN KEY (org_id) REFERENCES core.organizations(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_contacts_org' AND table_schema = 'core'
  ) THEN
    ALTER TABLE core.contacts
      ADD CONSTRAINT fk_contacts_org FOREIGN KEY (org_id) REFERENCES core.organizations(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sales_orders_customer' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.sales_orders
      ADD CONSTRAINT fk_sales_orders_customer FOREIGN KEY (customer_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_quotes_customer' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.quotes
      ADD CONSTRAINT fk_quotes_customer FOREIGN KEY (customer_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_invoices_customer' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.invoices
      ADD CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_purchase_orders_supplier' AND table_schema = 'procurement'
  ) THEN
    ALTER TABLE procurement.purchase_orders
      ADD CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY (supplier_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_transactions_bank_account' AND table_schema = 'cashbook'
  ) THEN
    ALTER TABLE cashbook.transactions
      ADD CONSTRAINT fk_transactions_bank_account FOREIGN KEY (bank_account_id) REFERENCES cashbook.bank_accounts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_opportunities_contact' AND table_schema = 'crm'
  ) THEN
    ALTER TABLE crm.opportunities
      ADD CONSTRAINT fk_opportunities_contact FOREIGN KEY (contact_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_activities_contact' AND table_schema = 'crm'
  ) THEN
    ALTER TABLE crm.activities
      ADD CONSTRAINT fk_activities_contact FOREIGN KEY (contact_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_activities_opportunity' AND table_schema = 'crm'
  ) THEN
    ALTER TABLE crm.activities
      ADD CONSTRAINT fk_activities_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm.opportunities(id);
  END IF;
END $$;

-- FK for sales_order_audit (multiple FKs to same target: core.contacts)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_soa_sales_rep' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.sales_order_audit
      ADD CONSTRAINT fk_soa_sales_rep FOREIGN KEY (sales_rep_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_soa_created_by' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.sales_order_audit
      ADD CONSTRAINT fk_soa_created_by FOREIGN KEY (created_by) REFERENCES core.contacts(id);
  END IF;
END $$;

-- FK for user_preferences (1:1 relationship)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_user_preferences_contact' AND table_schema = 'core'
  ) THEN
    ALTER TABLE core.user_preferences
      ADD CONSTRAINT fk_user_preferences_contact FOREIGN KEY (user_id) REFERENCES core.contacts(id);
  END IF;
END $$;

-- FKs for customer_buying_groups (M:M junction table)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cbg_customer' AND table_schema = 'crm'
  ) THEN
    ALTER TABLE crm.customer_buying_groups
      ADD CONSTRAINT fk_cbg_customer FOREIGN KEY (customer_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cbg_buying_group' AND table_schema = 'crm'
  ) THEN
    ALTER TABLE crm.customer_buying_groups
      ADD CONSTRAINT fk_cbg_buying_group FOREIGN KEY (buying_group_id) REFERENCES crm.buying_groups(id);
  END IF;
END $$;

-- Convert reporting "tables" to actual VIEWs that reference base tables.
-- This enables pg_depend-based FK inference for view columns.

-- Drop existing tables if they exist (dev environment only)
DROP TABLE IF EXISTS reporting.v_sales_orders CASCADE;
DROP TABLE IF EXISTS reporting.v_invoices CASCADE;
DROP TABLE IF EXISTS reporting.v_inventory_levels CASCADE;
DROP TABLE IF EXISTS reporting.v_purchase_orders CASCADE;
DROP TABLE IF EXISTS reporting.v_cashbook_transactions CASCADE;
DROP TABLE IF EXISTS reporting.v_general_ledger CASCADE;
DROP TABLE IF EXISTS reporting.v_customers CASCADE;
DROP TABLE IF EXISTS reporting.v_suppliers CASCADE;
DROP TABLE IF EXISTS reporting.v_product_catalogue CASCADE;

-- Also drop existing views to recreate cleanly
DROP VIEW IF EXISTS reporting.v_sales_orders CASCADE;
DROP VIEW IF EXISTS reporting.v_invoices CASCADE;
DROP VIEW IF EXISTS reporting.v_inventory_levels CASCADE;
DROP VIEW IF EXISTS reporting.v_purchase_orders CASCADE;
DROP VIEW IF EXISTS reporting.v_cashbook_transactions CASCADE;
DROP VIEW IF EXISTS reporting.v_general_ledger CASCADE;
DROP VIEW IF EXISTS reporting.v_customers CASCADE;
DROP VIEW IF EXISTS reporting.v_suppliers CASCADE;
DROP VIEW IF EXISTS reporting.v_product_catalogue CASCADE;

-- Create reporting views that reference base tables
-- The customer_id column in v_sales_orders originates from sales.sales_orders.customer_id
-- which has an FK to core.contacts(id) — so the FK inference should pick this up.
CREATE VIEW reporting.v_sales_orders AS
SELECT
  so.id,
  so.order_number,
  c.first_name || ' ' || c.last_name AS customer_name,
  so.customer_id,
  so.order_date,
  so.total_amount,
  so.status,
  o.id AS org_id,
  NULL::UUID AS branch_id
FROM sales.sales_orders so
LEFT JOIN core.contacts c ON c.id = so.customer_id
LEFT JOIN core.organizations o ON TRUE;

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
  END AS aging_bucket,
  NULL::UUID AS org_id
FROM finance.invoices inv
LEFT JOIN core.contacts c ON c.id = inv.customer_id;

CREATE VIEW reporting.v_inventory_levels AS
SELECT
  sl.id,
  sl.product_id,
  sl.warehouse_id,
  sl.quantity AS quantity_on_hand,
  sl.reorder_point,
  0::NUMERIC(12,2) AS unit_cost,
  (sl.quantity * 0)::NUMERIC(12,2) AS total_value,
  NULL::TEXT AS product_code,
  NULL::TEXT AS product_name,
  NULL::TEXT AS warehouse,
  NULL::UUID AS org_id
FROM inventory.stock_levels sl;

CREATE VIEW reporting.v_purchase_orders AS
SELECT
  po.id,
  po.po_number,
  c.first_name || ' ' || c.last_name AS supplier_name,
  po.supplier_id,
  po.order_date,
  NULL::DATE AS expected_date,
  po.total_amount,
  po.status,
  NULL::UUID AS org_id
FROM procurement.purchase_orders po
LEFT JOIN core.contacts c ON c.id = po.supplier_id;

CREATE VIEW reporting.v_cashbook_transactions AS
SELECT
  t.id,
  t.transaction_date,
  t.description,
  t.amount,
  t.transaction_type,
  ba.account_name AS bank_account,
  t.bank_account_id,
  NULL::UUID AS org_id
FROM cashbook.transactions t
LEFT JOIN cashbook.bank_accounts ba ON ba.id = t.bank_account_id;

CREATE VIEW reporting.v_general_ledger AS
SELECT
  gl.id,
  gl.account_code,
  NULL::TEXT AS account_name,
  gl.debit,
  gl.credit,
  gl.posting_date,
  NULL::UUID AS org_id
FROM finance.gl_entries gl;

CREATE VIEW reporting.v_customers AS
SELECT
  c.id,
  NULL::TEXT AS customer_code,
  c.first_name || ' ' || c.last_name AS customer_name,
  c.email,
  c.phone,
  c.org_id
FROM core.contacts c;

CREATE VIEW reporting.v_suppliers AS
SELECT
  c.id,
  NULL::TEXT AS supplier_code,
  c.first_name || ' ' || c.last_name AS supplier_name,
  c.email,
  c.phone,
  c.org_id
FROM core.contacts c;

CREATE VIEW reporting.v_product_catalogue AS
SELECT
  gen_random_uuid() AS id,
  NULL::TEXT AS product_code,
  NULL::TEXT AS product_name,
  NULL::TEXT AS category,
  0::NUMERIC(12,2) AS unit_price,
  NULL::UUID AS org_id;

-- Add COMMENT ON annotations
COMMENT ON VIEW reporting.v_sales_orders IS 'Denormalized sales order view';
COMMENT ON COLUMN reporting.v_sales_orders.id IS 'Primary key';
COMMENT ON COLUMN reporting.v_sales_orders.order_number IS 'Unique order number';
COMMENT ON COLUMN reporting.v_sales_orders.customer_name IS 'Customer display name';
COMMENT ON COLUMN reporting.v_sales_orders.total_amount IS 'Order total including tax';
COMMENT ON COLUMN reporting.v_sales_orders.customer_id IS 'fk:core.contacts.id Customer foreign key';

COMMENT ON VIEW reporting.v_invoices IS 'Denormalized invoice view with aging';
COMMENT ON COLUMN reporting.v_invoices.aging_bucket IS 'Aging period: Current, 1-30, 31-60, 61-90, 90+';
COMMENT ON COLUMN reporting.v_invoices.customer_id IS 'fk:core.contacts.id Invoice customer FK';

COMMENT ON VIEW reporting.v_inventory_levels IS 'Current inventory stock levels';
COMMENT ON VIEW reporting.v_purchase_orders IS 'Purchase order pipeline view';
COMMENT ON COLUMN reporting.v_purchase_orders.supplier_id IS 'fk:core.contacts.id Supplier FK';

COMMENT ON VIEW reporting.v_cashbook_transactions IS 'Bank transaction records';
COMMENT ON COLUMN reporting.v_cashbook_transactions.bank_account_id IS 'fk:cashbook.bank_accounts.id Bank account FK';

COMMENT ON VIEW reporting.v_general_ledger IS 'General ledger entries';
COMMENT ON VIEW reporting.v_customers IS 'Customer master data';
COMMENT ON VIEW reporting.v_suppliers IS 'Supplier master data';
COMMENT ON VIEW reporting.v_product_catalogue IS 'Product catalogue view';

COMMENT ON TABLE core.organizations IS 'Organization entities';
COMMENT ON TABLE core.branches IS 'Organization branches';
COMMENT ON COLUMN core.branches.code IS 'Unique short code | display_column';
COMMENT ON COLUMN core.branches.name IS 'Full name of the branch | display_column';
COMMENT ON TABLE core.contacts IS 'Contact information';
COMMENT ON COLUMN core.contacts.first_name IS 'First name | display_column';

COMMENT ON TABLE sales.quotes IS 'Sales quotes';
COMMENT ON TABLE sales.sales_orders IS 'Sales orders';

COMMENT ON TABLE finance.invoices IS 'Customer invoices';
COMMENT ON TABLE finance.gl_entries IS 'General ledger journal entries';

COMMENT ON TABLE inventory.stock_levels IS 'Current stock levels by warehouse';

COMMENT ON TABLE procurement.purchase_orders IS 'Purchase orders to suppliers';

COMMENT ON TABLE cashbook.bank_accounts IS 'Bank account records';
COMMENT ON TABLE cashbook.transactions IS 'Bank transactions';

COMMENT ON TABLE crm.leads IS 'Sales leads and prospects';
COMMENT ON TABLE crm.opportunities IS 'Sales opportunities pipeline';
COMMENT ON COLUMN crm.opportunities.contact_id IS 'fk:core.contacts.id Related contact';
COMMENT ON TABLE crm.activities IS 'CRM activity log (calls, emails, meetings)';
COMMENT ON COLUMN crm.activities.contact_id IS 'fk:core.contacts.id Related contact';
COMMENT ON COLUMN crm.activities.opportunity_id IS 'fk:crm.opportunities.id Related opportunity';

COMMENT ON TABLE sales.sales_order_audit IS 'Sales order audit trail with multiple user FKs';
COMMENT ON COLUMN sales.sales_order_audit.sales_rep_id IS 'Sales representative who managed the order';
COMMENT ON COLUMN sales.sales_order_audit.created_by IS 'User who created the audit entry';

COMMENT ON TABLE core.user_preferences IS 'Per-user preferences (1:1 with contacts)';
COMMENT ON COLUMN core.user_preferences.user_id IS 'One-to-one FK to contacts';

COMMENT ON TABLE crm.buying_groups IS 'Customer buying groups for discount tiers';
COMMENT ON TABLE crm.customer_buying_groups IS 'Junction table linking customers to buying groups (M:M)';
