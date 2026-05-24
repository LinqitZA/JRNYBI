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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='sales' AND table_name='sales_returns') THEN
    EXECUTE '
      CREATE TABLE sales.sales_returns (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        return_number TEXT,
        order_id UUID,
        customer_id UUID,
        return_date DATE DEFAULT CURRENT_DATE,
        reason TEXT,
        status TEXT DEFAULT ''pending'',
        total_amount NUMERIC(12,2) DEFAULT 0,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='sales' AND table_name='sales_return_lines') THEN
    EXECUTE '
      CREATE TABLE sales.sales_return_lines (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        return_id UUID,
        product_id UUID,
        quantity NUMERIC(12,2) DEFAULT 0,
        unit_price NUMERIC(12,2) DEFAULT 0,
        line_total NUMERIC(12,2) DEFAULT 0,
        reason TEXT
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

-- ============================================================================
-- Additional base tables needed for expanded reporting views
-- ============================================================================

-- Products master table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='products') THEN
    EXECUTE '
      CREATE TABLE inventory.products (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        product_code TEXT NOT NULL,
        product_name TEXT NOT NULL,
        category TEXT,
        unit_price NUMERIC(12,2) DEFAULT 0,
        unit_cost NUMERIC(12,2) DEFAULT 0,
        uom TEXT DEFAULT ''each'',
        is_active BOOLEAN DEFAULT true,
        org_id UUID,
        created_at TIMESTAMP DEFAULT now()
      )';
  END IF;
END $$;

-- Warehouses master table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='warehouses') THEN
    EXECUTE '
      CREATE TABLE inventory.warehouses (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        warehouse_code TEXT NOT NULL,
        warehouse_name TEXT NOT NULL,
        location TEXT,
        is_active BOOLEAN DEFAULT true,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

-- Stock movements (receipts, issues, adjustments, transfers)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='stock_movements') THEN
    EXECUTE '
      CREATE TABLE inventory.stock_movements (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        product_id UUID,
        warehouse_id UUID,
        movement_type TEXT NOT NULL,
        quantity NUMERIC(12,2) NOT NULL,
        reference_type TEXT,
        reference_id UUID,
        movement_date TIMESTAMP DEFAULT now(),
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

-- Sales order line items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='sales' AND table_name='sales_order_lines') THEN
    EXECUTE '
      CREATE TABLE sales.sales_order_lines (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        order_id UUID,
        product_id UUID,
        quantity NUMERIC(12,2) DEFAULT 1,
        unit_price NUMERIC(12,2) DEFAULT 0,
        discount_pct NUMERIC(5,2) DEFAULT 0,
        line_total NUMERIC(12,2) DEFAULT 0,
        org_id UUID
      )';
  END IF;
END $$;

-- Deliveries (shipping/fulfilment records)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='sales' AND table_name='deliveries') THEN
    EXECUTE '
      CREATE TABLE sales.deliveries (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        order_id UUID,
        delivery_number TEXT,
        delivery_date DATE,
        promised_date DATE,
        status TEXT DEFAULT ''pending'',
        shipped_qty NUMERIC(12,2) DEFAULT 0,
        ordered_qty NUMERIC(12,2) DEFAULT 0,
        picker_id UUID,
        pick_start_time TIMESTAMP,
        pick_end_time TIMESTAMP,
        pack_start_time TIMESTAMP,
        pack_end_time TIMESTAMP,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

-- Chart of accounts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='chart_of_accounts') THEN
    EXECUTE '
      CREATE TABLE finance.chart_of_accounts (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        account_code TEXT NOT NULL,
        account_name TEXT NOT NULL,
        account_type TEXT NOT NULL,
        account_category TEXT,
        parent_id UUID,
        is_active BOOLEAN DEFAULT true,
        org_id UUID
      )';
  END IF;
END $$;

-- Accounts payable (supplier invoices/bills)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='accounts_payable') THEN
    EXECUTE '
      CREATE TABLE finance.accounts_payable (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        bill_number TEXT,
        supplier_id UUID,
        bill_date DATE DEFAULT CURRENT_DATE,
        due_date DATE,
        total_amount NUMERIC(12,2) DEFAULT 0,
        amount_paid NUMERIC(12,2) DEFAULT 0,
        balance_due NUMERIC(12,2) DEFAULT 0,
        status TEXT DEFAULT ''open'',
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

-- Budget entries
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='budgets') THEN
    EXECUTE '
      CREATE TABLE finance.budgets (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        account_id UUID,
        fiscal_year INTEGER NOT NULL,
        fiscal_month INTEGER NOT NULL,
        budget_amount NUMERIC(12,2) DEFAULT 0,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

-- Purchase order line items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='procurement' AND table_name='purchase_order_lines') THEN
    EXECUTE '
      CREATE TABLE procurement.purchase_order_lines (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        po_id UUID,
        product_id UUID,
        quantity NUMERIC(12,2) DEFAULT 1,
        unit_cost NUMERIC(12,2) DEFAULT 0,
        line_total NUMERIC(12,2) DEFAULT 0,
        received_qty NUMERIC(12,2) DEFAULT 0,
        org_id UUID
      )';
  END IF;
END $$;

-- Add org_id and branch_id to existing tables that lack them
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='sales_orders' AND column_name='org_id') THEN
    ALTER TABLE sales.sales_orders ADD COLUMN org_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='sales_orders' AND column_name='branch_id') THEN
    ALTER TABLE sales.sales_orders ADD COLUMN branch_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='sales_orders' AND column_name='quote_id') THEN
    ALTER TABLE sales.sales_orders ADD COLUMN quote_id UUID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='quotes' AND column_name='org_id') THEN
    ALTER TABLE sales.quotes ADD COLUMN org_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='quotes' AND column_name='branch_id') THEN
    ALTER TABLE sales.quotes ADD COLUMN branch_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='quotes' AND column_name='quote_date') THEN
    ALTER TABLE sales.quotes ADD COLUMN quote_date DATE DEFAULT CURRENT_DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='quotes' AND column_name='sales_rep') THEN
    ALTER TABLE sales.quotes ADD COLUMN sales_rep TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='quotes' AND column_name='expiry_date') THEN
    ALTER TABLE sales.quotes ADD COLUMN expiry_date DATE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='finance' AND table_name='invoices' AND column_name='org_id') THEN
    ALTER TABLE finance.invoices ADD COLUMN org_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='finance' AND table_name='invoices' AND column_name='branch_id') THEN
    ALTER TABLE finance.invoices ADD COLUMN branch_id UUID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='finance' AND table_name='gl_entries' AND column_name='org_id') THEN
    ALTER TABLE finance.gl_entries ADD COLUMN org_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='finance' AND table_name='gl_entries' AND column_name='account_id') THEN
    ALTER TABLE finance.gl_entries ADD COLUMN account_id UUID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='inventory' AND table_name='stock_levels' AND column_name='org_id') THEN
    ALTER TABLE inventory.stock_levels ADD COLUMN org_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='inventory' AND table_name='stock_levels' AND column_name='last_received_date') THEN
    ALTER TABLE inventory.stock_levels ADD COLUMN last_received_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='inventory' AND table_name='stock_levels' AND column_name='unit_cost') THEN
    ALTER TABLE inventory.stock_levels ADD COLUMN unit_cost NUMERIC(12,2) DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='procurement' AND table_name='purchase_orders' AND column_name='org_id') THEN
    ALTER TABLE procurement.purchase_orders ADD COLUMN org_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='procurement' AND table_name='purchase_orders' AND column_name='branch_id') THEN
    ALTER TABLE procurement.purchase_orders ADD COLUMN branch_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='procurement' AND table_name='purchase_orders' AND column_name='expected_date') THEN
    ALTER TABLE procurement.purchase_orders ADD COLUMN expected_date DATE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='cashbook' AND table_name='transactions' AND column_name='org_id') THEN
    ALTER TABLE cashbook.transactions ADD COLUMN org_id UUID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='cashbook' AND table_name='bank_accounts' AND column_name='org_id') THEN
    ALTER TABLE cashbook.bank_accounts ADD COLUMN org_id UUID;
  END IF;
END $$;

-- FK constraints for new tables
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_stock_levels_product' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.stock_levels
      ADD CONSTRAINT fk_stock_levels_product FOREIGN KEY (product_id) REFERENCES inventory.products(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_stock_levels_warehouse' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.stock_levels
      ADD CONSTRAINT fk_stock_levels_warehouse FOREIGN KEY (warehouse_id) REFERENCES inventory.warehouses(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_stock_movements_product' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.stock_movements
      ADD CONSTRAINT fk_stock_movements_product FOREIGN KEY (product_id) REFERENCES inventory.products(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_stock_movements_warehouse' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.stock_movements
      ADD CONSTRAINT fk_stock_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES inventory.warehouses(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sol_order' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.sales_order_lines
      ADD CONSTRAINT fk_sol_order FOREIGN KEY (order_id) REFERENCES sales.sales_orders(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sol_product' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.sales_order_lines
      ADD CONSTRAINT fk_sol_product FOREIGN KEY (product_id) REFERENCES inventory.products(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_deliveries_order' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.deliveries
      ADD CONSTRAINT fk_deliveries_order FOREIGN KEY (order_id) REFERENCES sales.sales_orders(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_gl_entries_account' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.gl_entries
      ADD CONSTRAINT fk_gl_entries_account FOREIGN KEY (account_id) REFERENCES finance.chart_of_accounts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_ap_supplier' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.accounts_payable
      ADD CONSTRAINT fk_ap_supplier FOREIGN KEY (supplier_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_budgets_account' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.budgets
      ADD CONSTRAINT fk_budgets_account FOREIGN KEY (account_id) REFERENCES finance.chart_of_accounts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_pol_po' AND table_schema = 'procurement'
  ) THEN
    ALTER TABLE procurement.purchase_order_lines
      ADD CONSTRAINT fk_pol_po FOREIGN KEY (po_id) REFERENCES procurement.purchase_orders(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_pol_product' AND table_schema = 'procurement'
  ) THEN
    ALTER TABLE procurement.purchase_order_lines
      ADD CONSTRAINT fk_pol_product FOREIGN KEY (product_id) REFERENCES inventory.products(id);
  END IF;
END $$;

-- Comments for new tables
COMMENT ON TABLE inventory.products IS 'Product master catalogue';
COMMENT ON COLUMN inventory.products.product_code IS 'Unique product SKU | display_column';
COMMENT ON COLUMN inventory.products.product_name IS 'Product display name | display_column';

COMMENT ON TABLE inventory.warehouses IS 'Warehouse locations';
COMMENT ON COLUMN inventory.warehouses.warehouse_name IS 'Warehouse display name | display_column';

COMMENT ON TABLE inventory.stock_movements IS 'Stock movement history (receipts, issues, transfers, adjustments)';
COMMENT ON TABLE sales.sales_order_lines IS 'Sales order line items';
COMMENT ON TABLE sales.deliveries IS 'Delivery/fulfilment records for sales orders';
COMMENT ON TABLE finance.chart_of_accounts IS 'Chart of accounts master';
COMMENT ON COLUMN finance.chart_of_accounts.account_name IS 'Account display name | display_column';
COMMENT ON TABLE finance.accounts_payable IS 'Supplier invoices/bills (accounts payable)';
COMMENT ON TABLE finance.budgets IS 'Budget entries by account, year, and month';
COMMENT ON TABLE procurement.purchase_order_lines IS 'Purchase order line items';

-- FK: sales_orders.quote_id -> sales.quotes.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sales_orders_quote' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.sales_orders
      ADD CONSTRAINT fk_sales_orders_quote FOREIGN KEY (quote_id) REFERENCES sales.quotes(id);
  END IF;
END $$;

-- FK: sales_returns.order_id -> sales.sales_orders.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_returns_order' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.sales_returns
      ADD CONSTRAINT fk_returns_order FOREIGN KEY (order_id) REFERENCES sales.sales_orders(id);
  END IF;
END $$;

-- FK: sales_returns.customer_id -> core.contacts.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_returns_customer' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.sales_returns
      ADD CONSTRAINT fk_returns_customer FOREIGN KEY (customer_id) REFERENCES core.contacts(id);
  END IF;
END $$;

-- FK: sales_return_lines.return_id -> sales.sales_returns.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_return_lines_return' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.sales_return_lines
      ADD CONSTRAINT fk_return_lines_return FOREIGN KEY (return_id) REFERENCES sales.sales_returns(id);
  END IF;
END $$;

-- FK: sales_return_lines.product_id -> inventory.products.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_return_lines_product' AND table_schema = 'sales'
  ) THEN
    ALTER TABLE sales.sales_return_lines
      ADD CONSTRAINT fk_return_lines_product FOREIGN KEY (product_id) REFERENCES inventory.products(id);
  END IF;
END $$;

-- ============================================================================
-- Seed test data for Quote-to-Order Conversion report
-- ============================================================================
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  br  UUID := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  c1  UUID; c2 UUID; c3 UUID;
  q1  UUID; q2 UUID; q3 UUID; q4 UUID; q5 UUID;
  q6  UUID; q7 UUID; q8 UUID; q9 UUID; q10 UUID;
  q11 UUID; q12 UUID; q13 UUID; q14 UUID; q15 UUID;
BEGIN
  -- Only seed if quotes table is empty
  IF EXISTS (SELECT 1 FROM sales.quotes LIMIT 1) THEN
    RETURN;
  END IF;

  -- Ensure org exists (needed for FK on contacts)
  IF NOT EXISTS (SELECT 1 FROM core.organizations WHERE id = org) THEN
    INSERT INTO core.organizations (id, name) VALUES (org, 'Test Org');
  END IF;

  -- Get or create customer contacts
  SELECT id INTO c1 FROM core.contacts WHERE first_name = 'Alice' AND last_name = 'Johnson' LIMIT 1;
  IF c1 IS NULL THEN
    INSERT INTO core.contacts (first_name, last_name, email, org_id) VALUES ('Alice', 'Johnson', 'alice@example.com', org) RETURNING id INTO c1;
  END IF;
  SELECT id INTO c2 FROM core.contacts WHERE first_name = 'Bob' AND last_name = 'Smith' LIMIT 1;
  IF c2 IS NULL THEN
    INSERT INTO core.contacts (first_name, last_name, email, org_id) VALUES ('Bob', 'Smith', 'bob@example.com', org) RETURNING id INTO c2;
  END IF;
  SELECT id INTO c3 FROM core.contacts WHERE first_name = 'Carol' AND last_name = 'Davis' LIMIT 1;
  IF c3 IS NULL THEN
    INSERT INTO core.contacts (first_name, last_name, email, org_id) VALUES ('Carol', 'Davis', 'carol@example.com', org) RETURNING id INTO c3;
  END IF;

  -- Insert quotes spread across months (Jan 2024 - Jun 2024)
  -- Rep: Sarah Connor - strong performer
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-001', c1, 15000.00, 'accepted', '2024-01-10', 'Sarah Connor', org, br, '2024-02-10') RETURNING id INTO q1;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-002', c2, 8500.00, 'accepted', '2024-01-15', 'Sarah Connor', org, br, '2024-02-15') RETURNING id INTO q2;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-003', c3, 22000.00, 'rejected', '2024-01-20', 'Sarah Connor', org, br, '2024-02-20') RETURNING id INTO q3;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-004', c1, 12000.00, 'accepted', '2024-02-05', 'Sarah Connor', org, br, '2024-03-05') RETURNING id INTO q4;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-005', c2, 9500.00, 'expired', '2024-02-12', 'Sarah Connor', org, br, '2024-03-12') RETURNING id INTO q5;

  -- Rep: Mike Ross - average performer
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-006', c3, 18000.00, 'accepted', '2024-03-01', 'Mike Ross', org, br, '2024-04-01') RETURNING id INTO q6;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-007', c1, 7000.00, 'rejected', '2024-03-10', 'Mike Ross', org, br, '2024-04-10') RETURNING id INTO q7;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-008', c2, 25000.00, 'accepted', '2024-04-02', 'Mike Ross', org, br, '2024-05-02') RETURNING id INTO q8;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-009', c3, 11000.00, 'rejected', '2024-04-15', 'Mike Ross', org, br, '2024-05-15') RETURNING id INTO q9;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-010', c1, 16000.00, 'expired', '2024-04-25', 'Mike Ross', org, br, '2024-05-25') RETURNING id INTO q10;

  -- Rep: Lisa Park - newer rep
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-011', c2, 13000.00, 'accepted', '2024-05-05', 'Lisa Park', org, br, '2024-06-05') RETURNING id INTO q11;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-012', c3, 6500.00, 'sent', '2024-05-15', 'Lisa Park', org, br, '2024-06-15') RETURNING id INTO q12;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-013', c1, 19000.00, 'accepted', '2024-06-01', 'Lisa Park', org, br, '2024-07-01') RETURNING id INTO q13;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-014', c2, 8000.00, 'rejected', '2024-06-10', 'Lisa Park', org, br, '2024-07-10') RETURNING id INTO q14;
  INSERT INTO sales.quotes (quote_number, customer_id, total_amount, status, quote_date, sales_rep, org_id, branch_id, expiry_date)
    VALUES ('Q-2024-015', c3, 21000.00, 'accepted', '2024-06-20', 'Lisa Park', org, br, '2024-07-20') RETURNING id INTO q15;

  -- Create corresponding sales orders for accepted quotes
  -- Q1 accepted -> order created 5 days later
  INSERT INTO sales.sales_orders (order_number, customer_id, total_amount, status, order_date, org_id, branch_id, quote_id)
    VALUES ('SO-2024-101', c1, 15000.00, 'confirmed', '2024-01-15', org, br, q1);
  -- Q2 accepted -> order created 3 days later
  INSERT INTO sales.sales_orders (order_number, customer_id, total_amount, status, order_date, org_id, branch_id, quote_id)
    VALUES ('SO-2024-102', c2, 8500.00, 'confirmed', '2024-01-18', org, br, q2);
  -- Q4 accepted -> order created 7 days later
  INSERT INTO sales.sales_orders (order_number, customer_id, total_amount, status, order_date, org_id, branch_id, quote_id)
    VALUES ('SO-2024-103', c1, 12000.00, 'confirmed', '2024-02-12', org, br, q4);
  -- Q6 accepted -> order created 4 days later
  INSERT INTO sales.sales_orders (order_number, customer_id, total_amount, status, order_date, org_id, branch_id, quote_id)
    VALUES ('SO-2024-104', c3, 18000.00, 'confirmed', '2024-03-05', org, br, q6);
  -- Q8 accepted -> order created 10 days later
  INSERT INTO sales.sales_orders (order_number, customer_id, total_amount, status, order_date, org_id, branch_id, quote_id)
    VALUES ('SO-2024-105', c2, 25000.00, 'confirmed', '2024-04-12', org, br, q8);
  -- Q11 accepted -> order created 2 days later
  INSERT INTO sales.sales_orders (order_number, customer_id, total_amount, status, order_date, org_id, branch_id, quote_id)
    VALUES ('SO-2024-106', c2, 13000.00, 'confirmed', '2024-05-07', org, br, q11);
  -- Q13 accepted -> order created 6 days later
  INSERT INTO sales.sales_orders (order_number, customer_id, total_amount, status, order_date, org_id, branch_id, quote_id)
    VALUES ('SO-2024-107', c1, 19000.00, 'confirmed', '2024-06-07', org, br, q13);
  -- Q15 accepted -> order created 3 days later
  INSERT INTO sales.sales_orders (order_number, customer_id, total_amount, status, order_date, org_id, branch_id, quote_id)
    VALUES ('SO-2024-108', c3, 21000.00, 'confirmed', '2024-06-23', org, br, q15);
END $$;

-- ============================================================================
-- Seed test data for Sales Order Lines (needed for Revenue by Product Category)
-- ============================================================================
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  p1  UUID; p2 UUID; p3 UUID; p4 UUID;
  o   RECORD;
BEGIN
  -- Only seed if order_lines table is empty
  IF EXISTS (SELECT 1 FROM sales.sales_order_lines LIMIT 1) THEN
    RETURN;
  END IF;

  -- Get products
  SELECT id INTO p1 FROM inventory.products WHERE product_code = 'WIDGET-A' LIMIT 1;
  SELECT id INTO p2 FROM inventory.products WHERE product_code = 'GADGET-B' LIMIT 1;
  SELECT id INTO p3 FROM inventory.products WHERE product_code = 'PART-C' LIMIT 1;
  SELECT id INTO p4 FROM inventory.products WHERE product_code = 'SUPPLY-D' LIMIT 1;

  -- If no products yet, create them
  IF p1 IS NULL THEN
    INSERT INTO inventory.products (product_code, product_name, category, unit_price, unit_cost, org_id)
      VALUES ('WIDGET-A', 'Widget Alpha', 'Electronics', 150.00, 80.00, org) RETURNING id INTO p1;
  END IF;
  IF p2 IS NULL THEN
    INSERT INTO inventory.products (product_code, product_name, category, unit_price, unit_cost, org_id)
      VALUES ('GADGET-B', 'Gadget Beta', 'Electronics', 250.00, 130.00, org) RETURNING id INTO p2;
  END IF;
  IF p3 IS NULL THEN
    INSERT INTO inventory.products (product_code, product_name, category, unit_price, unit_cost, org_id)
      VALUES ('PART-C', 'Part Charlie', 'Components', 50.00, 25.00, org) RETURNING id INTO p3;
  END IF;
  IF p4 IS NULL THEN
    INSERT INTO inventory.products (product_code, product_name, category, unit_price, unit_cost, org_id)
      VALUES ('SUPPLY-D', 'Supply Delta', 'Consumables', 30.00, 12.00, org) RETURNING id INTO p4;
  END IF;

  -- Add unit_cost to existing products if missing
  UPDATE inventory.products SET unit_cost = 80.00 WHERE product_code = 'WIDGET-A' AND (unit_cost IS NULL OR unit_cost = 0);
  UPDATE inventory.products SET unit_cost = 130.00 WHERE product_code = 'GADGET-B' AND (unit_cost IS NULL OR unit_cost = 0);
  UPDATE inventory.products SET unit_cost = 25.00 WHERE product_code = 'PART-C' AND (unit_cost IS NULL OR unit_cost = 0);
  UPDATE inventory.products SET unit_cost = 12.00 WHERE product_code = 'SUPPLY-D' AND (unit_cost IS NULL OR unit_cost = 0);

  -- Insert order lines for each sales order
  FOR o IN (SELECT id, total_amount FROM sales.sales_orders ORDER BY order_date) LOOP
    -- Each order gets 2-4 line items mixing product categories
    INSERT INTO sales.sales_order_lines (order_id, product_id, quantity, unit_price, discount_pct, line_total, org_id)
      VALUES (o.id, p1, 5, 150.00, 0, 750.00, org);
    INSERT INTO sales.sales_order_lines (order_id, product_id, quantity, unit_price, discount_pct, line_total, org_id)
      VALUES (o.id, p2, 3, 250.00, 5, 712.50, org);
    INSERT INTO sales.sales_order_lines (order_id, product_id, quantity, unit_price, discount_pct, line_total, org_id)
      VALUES (o.id, p3, 20, 50.00, 0, 1000.00, org);
    INSERT INTO sales.sales_order_lines (order_id, product_id, quantity, unit_price, discount_pct, line_total, org_id)
      VALUES (o.id, p4, 10, 30.00, 10, 270.00, org);
  END LOOP;
END $$;

-- ============================================================================
-- Seed test data for Sales Returns Analysis report
-- ============================================================================
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  br  UUID := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  c1  UUID; c2 UUID; c3 UUID;
  o1  UUID; o2 UUID; o3 UUID; o4 UUID;
  p1  UUID; p2 UUID; p3 UUID; p4 UUID;
  r1  UUID; r2 UUID; r3 UUID; r4 UUID; r5 UUID; r6 UUID; r7 UUID; r8 UUID;
BEGIN
  -- Only seed if returns table is empty
  IF EXISTS (SELECT 1 FROM sales.sales_returns LIMIT 1) THEN
    RETURN;
  END IF;

  -- Get existing contacts
  SELECT id INTO c1 FROM core.contacts WHERE first_name = 'Alice' AND last_name = 'Johnson' LIMIT 1;
  SELECT id INTO c2 FROM core.contacts WHERE first_name = 'Bob' AND last_name = 'Smith' LIMIT 1;
  SELECT id INTO c3 FROM core.contacts WHERE first_name = 'Carol' AND last_name = 'Davis' LIMIT 1;

  -- Get or create products for return lines
  SELECT id INTO p1 FROM inventory.products WHERE product_code = 'WIDGET-A' LIMIT 1;
  IF p1 IS NULL THEN
    INSERT INTO inventory.products (product_code, product_name, category, unit_price, org_id)
      VALUES ('WIDGET-A', 'Widget Alpha', 'Electronics', 150.00, org) RETURNING id INTO p1;
  END IF;
  SELECT id INTO p2 FROM inventory.products WHERE product_code = 'GADGET-B' LIMIT 1;
  IF p2 IS NULL THEN
    INSERT INTO inventory.products (product_code, product_name, category, unit_price, org_id)
      VALUES ('GADGET-B', 'Gadget Beta', 'Electronics', 250.00, org) RETURNING id INTO p2;
  END IF;
  SELECT id INTO p3 FROM inventory.products WHERE product_code = 'PART-C' LIMIT 1;
  IF p3 IS NULL THEN
    INSERT INTO inventory.products (product_code, product_name, category, unit_price, org_id)
      VALUES ('PART-C', 'Part Charlie', 'Components', 50.00, org) RETURNING id INTO p3;
  END IF;
  SELECT id INTO p4 FROM inventory.products WHERE product_code = 'SUPPLY-D' LIMIT 1;
  IF p4 IS NULL THEN
    INSERT INTO inventory.products (product_code, product_name, category, unit_price, org_id)
      VALUES ('SUPPLY-D', 'Supply Delta', 'Consumables', 30.00, org) RETURNING id INTO p4;
  END IF;

  -- Get existing orders
  SELECT id INTO o1 FROM sales.sales_orders WHERE order_number = 'SO-2024-101' LIMIT 1;
  SELECT id INTO o2 FROM sales.sales_orders WHERE order_number = 'SO-2024-102' LIMIT 1;
  SELECT id INTO o3 FROM sales.sales_orders WHERE order_number = 'SO-2024-104' LIMIT 1;
  SELECT id INTO o4 FROM sales.sales_orders WHERE order_number = 'SO-2024-105' LIMIT 1;

  -- Create returns with various reasons spread across months
  -- Jan: defective product return
  INSERT INTO sales.sales_returns (return_number, order_id, customer_id, return_date, reason, status, total_amount, org_id, branch_id)
    VALUES ('RET-2024-001', o1, c1, '2024-01-25', 'Defective', 'completed', 450.00, org, br) RETURNING id INTO r1;
  INSERT INTO sales.sales_return_lines (return_id, product_id, quantity, unit_price, line_total, reason)
    VALUES (r1, p1, 3, 150.00, 450.00, 'Defective - screen flickering');

  -- Feb: wrong item shipped
  INSERT INTO sales.sales_returns (return_number, order_id, customer_id, return_date, reason, status, total_amount, org_id, branch_id)
    VALUES ('RET-2024-002', o2, c2, '2024-02-10', 'Wrong Item', 'completed', 250.00, org, br) RETURNING id INTO r2;
  INSERT INTO sales.sales_return_lines (return_id, product_id, quantity, unit_price, line_total, reason)
    VALUES (r2, p2, 1, 250.00, 250.00, 'Wrong item shipped - ordered GADGET-C');

  -- Mar: quality issue
  INSERT INTO sales.sales_returns (return_number, order_id, customer_id, return_date, reason, status, total_amount, org_id, branch_id)
    VALUES ('RET-2024-003', o3, c3, '2024-03-15', 'Quality Issue', 'completed', 600.00, org, br) RETURNING id INTO r3;
  INSERT INTO sales.sales_return_lines (return_id, product_id, quantity, unit_price, line_total, reason)
    VALUES (r3, p1, 2, 150.00, 300.00, 'Quality issue - paint peeling');
  INSERT INTO sales.sales_return_lines (return_id, product_id, quantity, unit_price, line_total, reason)
    VALUES (r3, p3, 6, 50.00, 300.00, 'Quality issue - incorrect dimensions');

  -- Apr: customer changed mind
  INSERT INTO sales.sales_returns (return_number, order_id, customer_id, return_date, reason, status, total_amount, org_id, branch_id)
    VALUES ('RET-2024-004', o1, c1, '2024-04-05', 'Changed Mind', 'completed', 300.00, org, br) RETURNING id INTO r4;
  INSERT INTO sales.sales_return_lines (return_id, product_id, quantity, unit_price, line_total, reason)
    VALUES (r4, p1, 2, 150.00, 300.00, 'No longer needed');

  -- Apr: defective again
  INSERT INTO sales.sales_returns (return_number, order_id, customer_id, return_date, reason, status, total_amount, org_id, branch_id)
    VALUES ('RET-2024-005', o4, c2, '2024-04-20', 'Defective', 'completed', 500.00, org, br) RETURNING id INTO r5;
  INSERT INTO sales.sales_return_lines (return_id, product_id, quantity, unit_price, line_total, reason)
    VALUES (r5, p2, 2, 250.00, 500.00, 'Defective - buttons not working');

  -- May: damaged in transit
  INSERT INTO sales.sales_returns (return_number, order_id, customer_id, return_date, reason, status, total_amount, org_id, branch_id)
    VALUES ('RET-2024-006', o2, c2, '2024-05-10', 'Damaged in Transit', 'completed', 180.00, org, br) RETURNING id INTO r6;
  INSERT INTO sales.sales_return_lines (return_id, product_id, quantity, unit_price, line_total, reason)
    VALUES (r6, p4, 6, 30.00, 180.00, 'Box crushed during shipping');

  -- May: wrong item
  INSERT INTO sales.sales_returns (return_number, order_id, customer_id, return_date, reason, status, total_amount, org_id, branch_id)
    VALUES ('RET-2024-007', o3, c3, '2024-05-25', 'Wrong Item', 'completed', 150.00, org, br) RETURNING id INTO r7;
  INSERT INTO sales.sales_return_lines (return_id, product_id, quantity, unit_price, line_total, reason)
    VALUES (r7, p1, 1, 150.00, 150.00, 'Shipped Widget Alpha instead of Widget Omega');

  -- Jun: quality issue on multiple items
  INSERT INTO sales.sales_returns (return_number, order_id, customer_id, return_date, reason, status, total_amount, org_id, branch_id)
    VALUES ('RET-2024-008', o4, c1, '2024-06-15', 'Quality Issue', 'pending', 530.00, org, br) RETURNING id INTO r8;
  INSERT INTO sales.sales_return_lines (return_id, product_id, quantity, unit_price, line_total, reason)
    VALUES (r8, p2, 1, 250.00, 250.00, 'Quality issue - scratch on casing');
  INSERT INTO sales.sales_return_lines (return_id, product_id, quantity, unit_price, line_total, reason)
    VALUES (r8, p3, 4, 50.00, 200.00, 'Quality issue - misaligned parts');
  INSERT INTO sales.sales_return_lines (return_id, product_id, quantity, unit_price, line_total, reason)
    VALUES (r8, p4, 2.67, 30.00, 80.00, 'Quality issue - packaging damaged');
END $$;

-- ============================================================================
-- Reporting views are now created by seed/create_reporting_views.sql
-- (see that file for the comprehensive denormalized reporting view set)
-- ============================================================================

-- Comments for original base tables
COMMENT ON TABLE core.organizations IS 'Organization entities';
COMMENT ON TABLE core.branches IS 'Organization branches';
COMMENT ON COLUMN core.branches.code IS 'Unique short code | display_column';
COMMENT ON COLUMN core.branches.name IS 'Full name of the branch | display_column';
COMMENT ON TABLE core.contacts IS 'Contact information';
COMMENT ON COLUMN core.contacts.first_name IS 'First name | display_column';

COMMENT ON TABLE sales.quotes IS 'Sales quotes and proposals sent to customers';
COMMENT ON COLUMN sales.quotes.quote_number IS 'Unique quote reference number | display_column';
COMMENT ON COLUMN sales.quotes.status IS 'Quote lifecycle status: draft, sent, accepted, rejected, expired';
COMMENT ON TABLE sales.sales_orders IS 'Sales orders';
COMMENT ON COLUMN sales.sales_orders.quote_id IS 'fk:sales.quotes.id Originating quote if converted from a quote';
COMMENT ON TABLE sales.sales_returns IS 'Sales returns/RMAs for order items';
COMMENT ON COLUMN sales.sales_returns.return_number IS 'Unique return reference number | display_column';
COMMENT ON COLUMN sales.sales_returns.order_id IS 'fk:sales.sales_orders.id Originating sales order';
COMMENT ON COLUMN sales.sales_returns.customer_id IS 'fk:core.contacts.id Customer who initiated the return';
COMMENT ON COLUMN sales.sales_returns.reason IS 'Top-level return reason category';
COMMENT ON TABLE sales.sales_return_lines IS 'Line items on a sales return';
COMMENT ON COLUMN sales.sales_return_lines.return_id IS 'fk:sales.sales_returns.id Parent return record';
COMMENT ON COLUMN sales.sales_return_lines.product_id IS 'fk:inventory.products.id Returned product';

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
