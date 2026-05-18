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

-- Add COMMENT ON annotations
COMMENT ON TABLE reporting.v_sales_orders IS 'Denormalized sales order view';
COMMENT ON COLUMN reporting.v_sales_orders.id IS 'Primary key';
COMMENT ON COLUMN reporting.v_sales_orders.order_number IS 'Unique order number';
COMMENT ON COLUMN reporting.v_sales_orders.customer_name IS 'Customer display name';
COMMENT ON COLUMN reporting.v_sales_orders.total_amount IS 'Order total including tax';

COMMENT ON TABLE reporting.v_invoices IS 'Denormalized invoice view with aging';
COMMENT ON COLUMN reporting.v_invoices.aging_bucket IS 'Aging period: Current, 1-30, 31-60, 61-90, 90+';

COMMENT ON TABLE reporting.v_inventory_levels IS 'Current inventory stock levels';
COMMENT ON TABLE reporting.v_purchase_orders IS 'Purchase order pipeline view';
COMMENT ON TABLE reporting.v_cashbook_transactions IS 'Bank transaction records';
COMMENT ON TABLE reporting.v_general_ledger IS 'General ledger entries';
COMMENT ON TABLE reporting.v_customers IS 'Customer master data';
COMMENT ON TABLE reporting.v_suppliers IS 'Supplier master data';
COMMENT ON TABLE reporting.v_product_catalogue IS 'Product catalogue view';

COMMENT ON TABLE core.organizations IS 'Organization entities';
COMMENT ON TABLE core.branches IS 'Organization branches';
COMMENT ON TABLE core.contacts IS 'Contact information';

COMMENT ON TABLE sales.quotes IS 'Sales quotes';
COMMENT ON TABLE sales.sales_orders IS 'Sales orders';

COMMENT ON TABLE finance.invoices IS 'Customer invoices';
COMMENT ON TABLE finance.gl_entries IS 'General ledger journal entries';

COMMENT ON TABLE inventory.stock_levels IS 'Current stock levels by warehouse';

COMMENT ON TABLE procurement.purchase_orders IS 'Purchase orders to suppliers';

COMMENT ON TABLE cashbook.bank_accounts IS 'Bank account records';
COMMENT ON TABLE cashbook.transactions IS 'Bank transactions';
