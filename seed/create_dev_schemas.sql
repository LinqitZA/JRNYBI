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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='credit_notes') THEN
    EXECUTE '
      CREATE TABLE finance.credit_notes (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        credit_note_number TEXT,
        customer_id UUID,
        invoice_id UUID,
        credit_note_date DATE DEFAULT CURRENT_DATE,
        reason TEXT,
        status TEXT DEFAULT ''issued'',
        total_amount NUMERIC(12,2) DEFAULT 0,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='credit_note_lines') THEN
    EXECUTE '
      CREATE TABLE finance.credit_note_lines (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        credit_note_id UUID,
        product_id UUID,
        description TEXT,
        quantity NUMERIC(12,2) DEFAULT 1,
        unit_price NUMERIC(12,2) DEFAULT 0,
        line_total NUMERIC(12,2) DEFAULT 0
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='customer_payments') THEN
    EXECUTE '
      CREATE TABLE finance.customer_payments (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        invoice_id UUID,
        customer_id UUID,
        payment_date DATE DEFAULT CURRENT_DATE,
        amount NUMERIC(12,2) DEFAULT 0,
        payment_method TEXT,
        reference TEXT,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='gl_dimensions') THEN
    EXECUTE '
      CREATE TABLE finance.gl_dimensions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        dimension_type TEXT NOT NULL,
        name TEXT NOT NULL,
        org_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='dimension_members') THEN
    EXECUTE '
      CREATE TABLE finance.dimension_members (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        dimension_id UUID,
        member_code TEXT,
        member_name TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        org_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='gl_entry_dimensions') THEN
    EXECUTE '
      CREATE TABLE finance.gl_entry_dimensions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        gl_entry_id UUID,
        dimension_member_id UUID
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='finance' AND table_name='invoices' AND column_name='status') THEN
    ALTER TABLE finance.invoices ADD COLUMN status TEXT DEFAULT 'open';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name='contacts' AND column_name='credit_limit') THEN
    ALTER TABLE core.contacts ADD COLUMN credit_limit NUMERIC(12,2) DEFAULT 0;
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
    WHERE constraint_name = 'fk_cn_customer' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.credit_notes
      ADD CONSTRAINT fk_cn_customer FOREIGN KEY (customer_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cn_invoice' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.credit_notes
      ADD CONSTRAINT fk_cn_invoice FOREIGN KEY (invoice_id) REFERENCES finance.invoices(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cnl_credit_note' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.credit_note_lines
      ADD CONSTRAINT fk_cnl_credit_note FOREIGN KEY (credit_note_id) REFERENCES finance.credit_notes(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cnl_product' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.credit_note_lines
      ADD CONSTRAINT fk_cnl_product FOREIGN KEY (product_id) REFERENCES inventory.products(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cp_invoice' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.customer_payments
      ADD CONSTRAINT fk_cp_invoice FOREIGN KEY (invoice_id) REFERENCES finance.invoices(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cp_customer' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.customer_payments
      ADD CONSTRAINT fk_cp_customer FOREIGN KEY (customer_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_dm_dimension' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.dimension_members
      ADD CONSTRAINT fk_dm_dimension FOREIGN KEY (dimension_id) REFERENCES finance.gl_dimensions(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_ged_gl_entry' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.gl_entry_dimensions
      ADD CONSTRAINT fk_ged_gl_entry FOREIGN KEY (gl_entry_id) REFERENCES finance.gl_entries(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_ged_dim_member' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.gl_entry_dimensions
      ADD CONSTRAINT fk_ged_dim_member FOREIGN KEY (dimension_member_id) REFERENCES finance.dimension_members(id);
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
COMMENT ON TABLE finance.credit_notes IS 'Credit notes issued against customer invoices';
COMMENT ON COLUMN finance.credit_notes.credit_note_number IS 'Unique credit note reference number | display_column';
COMMENT ON COLUMN finance.credit_notes.customer_id IS 'fk:core.contacts.id Customer receiving the credit';
COMMENT ON COLUMN finance.credit_notes.invoice_id IS 'fk:finance.invoices.id Original invoice being credited';
COMMENT ON COLUMN finance.credit_notes.reason IS 'Credit note reason: Quality Issue, Pricing Dispute, Short Delivery, Damaged Goods, Other';
COMMENT ON TABLE finance.credit_note_lines IS 'Line items on a credit note';
COMMENT ON COLUMN finance.credit_note_lines.credit_note_id IS 'fk:finance.credit_notes.id Parent credit note';
COMMENT ON COLUMN finance.credit_note_lines.product_id IS 'fk:inventory.products.id Product being credited';
COMMENT ON TABLE finance.customer_payments IS 'Customer payments against invoices';
COMMENT ON COLUMN finance.customer_payments.invoice_id IS 'fk:finance.invoices.id Invoice being paid';
COMMENT ON COLUMN finance.customer_payments.customer_id IS 'fk:core.contacts.id Customer making the payment';
COMMENT ON COLUMN finance.customer_payments.payment_method IS 'Payment method: EFT, Cash, Cheque, Credit Card';
COMMENT ON TABLE finance.gl_dimensions IS 'GL dimension types (Cost Centre, Department, Project, Territory)';
COMMENT ON COLUMN finance.gl_dimensions.dimension_type IS 'Dimension category: cost_centre, department, project, territory | display_column';
COMMENT ON TABLE finance.dimension_members IS 'Members within a GL dimension';
COMMENT ON COLUMN finance.dimension_members.dimension_id IS 'fk:finance.gl_dimensions.id Parent dimension type';
COMMENT ON COLUMN finance.dimension_members.member_name IS 'Dimension member name | display_column';
COMMENT ON TABLE finance.gl_entry_dimensions IS 'Junction table linking GL entries to dimension members';
COMMENT ON COLUMN finance.gl_entry_dimensions.gl_entry_id IS 'fk:finance.gl_entries.id GL entry';
COMMENT ON COLUMN finance.gl_entry_dimensions.dimension_member_id IS 'fk:finance.dimension_members.id Dimension member';

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


-- ============================================================================
-- FINANCE SEED DATA: Chart of Accounts + GL Entries for P&L / Balance Sheet
-- ============================================================================
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  -- Revenue accounts
  rev_sales UUID;
  rev_services UUID;
  rev_other UUID;
  -- COGS accounts
  cogs_materials UUID;
  cogs_labor UUID;
  cogs_freight UUID;
  -- Operating expense accounts
  opex_salaries UUID;
  opex_rent UUID;
  opex_utilities UUID;
  opex_marketing UUID;
  opex_depreciation UUID;
  opex_insurance UUID;
  opex_office UUID;
  opex_professional UUID;
  -- Other expense accounts
  oex_interest UUID;
  oex_bank_charges UUID;
BEGIN
  -- Only seed if chart_of_accounts is empty
  IF EXISTS (SELECT 1 FROM finance.chart_of_accounts LIMIT 1) THEN
    RETURN;
  END IF;

  -- ==========================================
  -- Chart of Accounts
  -- ==========================================

  -- Revenue accounts
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '4000', 'Product Sales', 'revenue', 'sales', true, org) RETURNING id INTO rev_sales;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '4100', 'Service Revenue', 'revenue', 'services', true, org) RETURNING id INTO rev_services;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '4200', 'Other Income', 'revenue', 'other_income', true, org) RETURNING id INTO rev_other;

  -- Cost of Goods Sold
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '5000', 'Raw Materials', 'expense', 'cost_of_sales', true, org) RETURNING id INTO cogs_materials;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '5100', 'Direct Labour', 'expense', 'cost_of_sales', true, org) RETURNING id INTO cogs_labor;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '5200', 'Freight & Delivery', 'expense', 'cost_of_sales', true, org) RETURNING id INTO cogs_freight;

  -- Operating Expenses
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '6000', 'Salaries & Wages', 'expense', 'operating_expense', true, org) RETURNING id INTO opex_salaries;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '6100', 'Rent & Rates', 'expense', 'operating_expense', true, org) RETURNING id INTO opex_rent;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '6200', 'Utilities', 'expense', 'operating_expense', true, org) RETURNING id INTO opex_utilities;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '6300', 'Marketing & Advertising', 'expense', 'operating_expense', true, org) RETURNING id INTO opex_marketing;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '6400', 'Depreciation', 'expense', 'operating_expense', true, org) RETURNING id INTO opex_depreciation;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '6500', 'Insurance', 'expense', 'operating_expense', true, org) RETURNING id INTO opex_insurance;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '6600', 'Office Supplies', 'expense', 'operating_expense', true, org) RETURNING id INTO opex_office;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '6700', 'Professional Fees', 'expense', 'operating_expense', true, org) RETURNING id INTO opex_professional;

  -- Other Expenses
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '7000', 'Interest Expense', 'expense', 'other_expense', true, org) RETURNING id INTO oex_interest;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '7100', 'Bank Charges', 'expense', 'other_expense', true, org) RETURNING id INTO oex_bank_charges;

  -- ==========================================
  -- GL Entries — 12 months of P&L data (2024)
  -- ==========================================

  -- January 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 185000.00, '2024-01-15', org, rev_sales),
    ('4100', 0, 42000.00, '2024-01-15', org, rev_services),
    ('4200', 0, 3500.00, '2024-01-15', org, rev_other),
    ('5000', 78000.00, 0, '2024-01-20', org, cogs_materials),
    ('5100', 32000.00, 0, '2024-01-20', org, cogs_labor),
    ('5200', 8500.00, 0, '2024-01-20', org, cogs_freight),
    ('6000', 45000.00, 0, '2024-01-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-01-25', org, opex_rent),
    ('6200', 3200.00, 0, '2024-01-25', org, opex_utilities),
    ('6300', 8000.00, 0, '2024-01-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-01-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-01-25', org, opex_insurance),
    ('6600', 1200.00, 0, '2024-01-25', org, opex_office),
    ('6700', 5000.00, 0, '2024-01-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-01-30', org, oex_interest),
    ('7100', 450.00, 0, '2024-01-30', org, oex_bank_charges);

  -- February 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 192000.00, '2024-02-15', org, rev_sales),
    ('4100', 0, 38000.00, '2024-02-15', org, rev_services),
    ('4200', 0, 2800.00, '2024-02-15', org, rev_other),
    ('5000', 82000.00, 0, '2024-02-20', org, cogs_materials),
    ('5100', 34000.00, 0, '2024-02-20', org, cogs_labor),
    ('5200', 9200.00, 0, '2024-02-20', org, cogs_freight),
    ('6000', 45000.00, 0, '2024-02-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-02-25', org, opex_rent),
    ('6200', 3400.00, 0, '2024-02-25', org, opex_utilities),
    ('6300', 7500.00, 0, '2024-02-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-02-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-02-25', org, opex_insurance),
    ('6600', 1100.00, 0, '2024-02-25', org, opex_office),
    ('6700', 3500.00, 0, '2024-02-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-02-28', org, oex_interest),
    ('7100', 420.00, 0, '2024-02-28', org, oex_bank_charges);

  -- March 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 210000.00, '2024-03-15', org, rev_sales),
    ('4100', 0, 45000.00, '2024-03-15', org, rev_services),
    ('4200', 0, 4200.00, '2024-03-15', org, rev_other),
    ('5000', 88000.00, 0, '2024-03-20', org, cogs_materials),
    ('5100', 36000.00, 0, '2024-03-20', org, cogs_labor),
    ('5200', 9800.00, 0, '2024-03-20', org, cogs_freight),
    ('6000', 46000.00, 0, '2024-03-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-03-25', org, opex_rent),
    ('6200', 2900.00, 0, '2024-03-25', org, opex_utilities),
    ('6300', 9500.00, 0, '2024-03-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-03-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-03-25', org, opex_insurance),
    ('6600', 1350.00, 0, '2024-03-25', org, opex_office),
    ('6700', 4200.00, 0, '2024-03-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-03-30', org, oex_interest),
    ('7100', 480.00, 0, '2024-03-30', org, oex_bank_charges);

  -- April 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 198000.00, '2024-04-15', org, rev_sales),
    ('4100', 0, 50000.00, '2024-04-15', org, rev_services),
    ('4200', 0, 3800.00, '2024-04-15', org, rev_other),
    ('5000', 85000.00, 0, '2024-04-20', org, cogs_materials),
    ('5100', 35000.00, 0, '2024-04-20', org, cogs_labor),
    ('5200', 9100.00, 0, '2024-04-20', org, cogs_freight),
    ('6000', 46000.00, 0, '2024-04-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-04-25', org, opex_rent),
    ('6200', 2700.00, 0, '2024-04-25', org, opex_utilities),
    ('6300', 8200.00, 0, '2024-04-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-04-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-04-25', org, opex_insurance),
    ('6600', 1250.00, 0, '2024-04-25', org, opex_office),
    ('6700', 4800.00, 0, '2024-04-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-04-30', org, oex_interest),
    ('7100', 460.00, 0, '2024-04-30', org, oex_bank_charges);

  -- May 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 220000.00, '2024-05-15', org, rev_sales),
    ('4100', 0, 48000.00, '2024-05-15', org, rev_services),
    ('4200', 0, 5100.00, '2024-05-15', org, rev_other),
    ('5000', 92000.00, 0, '2024-05-20', org, cogs_materials),
    ('5100', 38000.00, 0, '2024-05-20', org, cogs_labor),
    ('5200', 10200.00, 0, '2024-05-20', org, cogs_freight),
    ('6000', 47000.00, 0, '2024-05-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-05-25', org, opex_rent),
    ('6200', 2500.00, 0, '2024-05-25', org, opex_utilities),
    ('6300', 11000.00, 0, '2024-05-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-05-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-05-25', org, opex_insurance),
    ('6600', 1400.00, 0, '2024-05-25', org, opex_office),
    ('6700', 5500.00, 0, '2024-05-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-05-30', org, oex_interest),
    ('7100', 490.00, 0, '2024-05-30', org, oex_bank_charges);

  -- June 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 235000.00, '2024-06-15', org, rev_sales),
    ('4100', 0, 52000.00, '2024-06-15', org, rev_services),
    ('4200', 0, 4600.00, '2024-06-15', org, rev_other),
    ('5000', 98000.00, 0, '2024-06-20', org, cogs_materials),
    ('5100', 40000.00, 0, '2024-06-20', org, cogs_labor),
    ('5200', 10800.00, 0, '2024-06-20', org, cogs_freight),
    ('6000', 47000.00, 0, '2024-06-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-06-25', org, opex_rent),
    ('6200', 2800.00, 0, '2024-06-25', org, opex_utilities),
    ('6300', 12000.00, 0, '2024-06-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-06-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-06-25', org, opex_insurance),
    ('6600', 1500.00, 0, '2024-06-25', org, opex_office),
    ('6700', 6000.00, 0, '2024-06-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-06-30', org, oex_interest),
    ('7100', 510.00, 0, '2024-06-30', org, oex_bank_charges);

  -- July 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 205000.00, '2024-07-15', org, rev_sales),
    ('4100', 0, 46000.00, '2024-07-15', org, rev_services),
    ('4200', 0, 3900.00, '2024-07-15', org, rev_other),
    ('5000', 86000.00, 0, '2024-07-20', org, cogs_materials),
    ('5100', 35000.00, 0, '2024-07-20', org, cogs_labor),
    ('5200', 9500.00, 0, '2024-07-20', org, cogs_freight),
    ('6000', 47000.00, 0, '2024-07-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-07-25', org, opex_rent),
    ('6200', 3100.00, 0, '2024-07-25', org, opex_utilities),
    ('6300', 9000.00, 0, '2024-07-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-07-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-07-25', org, opex_insurance),
    ('6600', 1300.00, 0, '2024-07-25', org, opex_office),
    ('6700', 4500.00, 0, '2024-07-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-07-30', org, oex_interest),
    ('7100', 470.00, 0, '2024-07-30', org, oex_bank_charges);

  -- August 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 228000.00, '2024-08-15', org, rev_sales),
    ('4100', 0, 55000.00, '2024-08-15', org, rev_services),
    ('4200', 0, 4800.00, '2024-08-15', org, rev_other),
    ('5000', 95000.00, 0, '2024-08-20', org, cogs_materials),
    ('5100', 39000.00, 0, '2024-08-20', org, cogs_labor),
    ('5200', 10500.00, 0, '2024-08-20', org, cogs_freight),
    ('6000', 48000.00, 0, '2024-08-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-08-25', org, opex_rent),
    ('6200', 3300.00, 0, '2024-08-25', org, opex_utilities),
    ('6300', 10500.00, 0, '2024-08-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-08-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-08-25', org, opex_insurance),
    ('6600', 1450.00, 0, '2024-08-25', org, opex_office),
    ('6700', 5200.00, 0, '2024-08-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-08-30', org, oex_interest),
    ('7100', 500.00, 0, '2024-08-30', org, oex_bank_charges);

  -- September 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 215000.00, '2024-09-15', org, rev_sales),
    ('4100', 0, 49000.00, '2024-09-15', org, rev_services),
    ('4200', 0, 4100.00, '2024-09-15', org, rev_other),
    ('5000', 90000.00, 0, '2024-09-20', org, cogs_materials),
    ('5100', 37000.00, 0, '2024-09-20', org, cogs_labor),
    ('5200', 9900.00, 0, '2024-09-20', org, cogs_freight),
    ('6000', 48000.00, 0, '2024-09-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-09-25', org, opex_rent),
    ('6200', 2900.00, 0, '2024-09-25', org, opex_utilities),
    ('6300', 8800.00, 0, '2024-09-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-09-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-09-25', org, opex_insurance),
    ('6600', 1350.00, 0, '2024-09-25', org, opex_office),
    ('6700', 4800.00, 0, '2024-09-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-09-30', org, oex_interest),
    ('7100', 480.00, 0, '2024-09-30', org, oex_bank_charges);

  -- October 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 240000.00, '2024-10-15', org, rev_sales),
    ('4100', 0, 58000.00, '2024-10-15', org, rev_services),
    ('4200', 0, 5500.00, '2024-10-15', org, rev_other),
    ('5000', 100000.00, 0, '2024-10-20', org, cogs_materials),
    ('5100', 41000.00, 0, '2024-10-20', org, cogs_labor),
    ('5200', 11200.00, 0, '2024-10-20', org, cogs_freight),
    ('6000', 49000.00, 0, '2024-10-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-10-25', org, opex_rent),
    ('6200', 3000.00, 0, '2024-10-25', org, opex_utilities),
    ('6300', 11500.00, 0, '2024-10-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-10-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-10-25', org, opex_insurance),
    ('6600', 1500.00, 0, '2024-10-25', org, opex_office),
    ('6700', 5800.00, 0, '2024-10-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-10-30', org, oex_interest),
    ('7100', 520.00, 0, '2024-10-30', org, oex_bank_charges);

  -- November 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 250000.00, '2024-11-15', org, rev_sales),
    ('4100', 0, 60000.00, '2024-11-15', org, rev_services),
    ('4200', 0, 6200.00, '2024-11-15', org, rev_other),
    ('5000', 104000.00, 0, '2024-11-20', org, cogs_materials),
    ('5100', 43000.00, 0, '2024-11-20', org, cogs_labor),
    ('5200', 11800.00, 0, '2024-11-20', org, cogs_freight),
    ('6000', 50000.00, 0, '2024-11-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-11-25', org, opex_rent),
    ('6200', 3200.00, 0, '2024-11-25', org, opex_utilities),
    ('6300', 12500.00, 0, '2024-11-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-11-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-11-25', org, opex_insurance),
    ('6600', 1550.00, 0, '2024-11-25', org, opex_office),
    ('6700', 6200.00, 0, '2024-11-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-11-30', org, oex_interest),
    ('7100', 540.00, 0, '2024-11-30', org, oex_bank_charges);

  -- December 2024
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('4000', 0, 260000.00, '2024-12-15', org, rev_sales),
    ('4100', 0, 62000.00, '2024-12-15', org, rev_services),
    ('4200', 0, 7000.00, '2024-12-15', org, rev_other),
    ('5000', 108000.00, 0, '2024-12-20', org, cogs_materials),
    ('5100', 45000.00, 0, '2024-12-20', org, cogs_labor),
    ('5200', 12200.00, 0, '2024-12-20', org, cogs_freight),
    ('6000', 52000.00, 0, '2024-12-25', org, opex_salaries),
    ('6100', 12000.00, 0, '2024-12-25', org, opex_rent),
    ('6200', 3500.00, 0, '2024-12-25', org, opex_utilities),
    ('6300', 14000.00, 0, '2024-12-25', org, opex_marketing),
    ('6400', 4500.00, 0, '2024-12-25', org, opex_depreciation),
    ('6500', 2800.00, 0, '2024-12-25', org, opex_insurance),
    ('6600', 1700.00, 0, '2024-12-25', org, opex_office),
    ('6700', 7000.00, 0, '2024-12-25', org, opex_professional),
    ('7000', 2100.00, 0, '2024-12-30', org, oex_interest),
    ('7100', 560.00, 0, '2024-12-30', org, oex_bank_charges);

  -- ==========================================
  -- Balance Sheet Accounts + GL Entries
  -- ==========================================
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '1000', 'Cash and Cash Equivalents', 'asset', 'current_asset', true, org) RETURNING id INTO rev_sales;
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '1100', 'Accounts Receivable', 'asset', 'current_asset', true, org) RETURNING id INTO rev_services;
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '1200', 'Inventory', 'asset', 'current_asset', true, org) RETURNING id INTO rev_other;
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '1300', 'Prepaid Expenses', 'asset', 'current_asset', true, org) RETURNING id INTO cogs_materials;
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '1500', 'Property, Plant & Equipment', 'asset', 'non_current_asset', true, org) RETURNING id INTO cogs_labor;
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '1600', 'Accumulated Depreciation', 'asset', 'non_current_asset', true, org) RETURNING id INTO cogs_freight;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '2000', 'Accounts Payable', 'liability', 'current_liability', true, org) RETURNING id INTO opex_salaries;
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '2100', 'Accrued Expenses', 'liability', 'current_liability', true, org) RETURNING id INTO opex_rent;
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '2200', 'Long-term Loan', 'liability', 'non_current_liability', true, org) RETURNING id INTO opex_utilities;
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '2300', 'VAT Payable', 'liability', 'current_liability', true, org) RETURNING id INTO opex_marketing;

  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '3000', 'Share Capital', 'equity', 'equity', true, org) RETURNING id INTO opex_depreciation;
  INSERT INTO finance.chart_of_accounts (id, account_code, account_name, account_type, account_category, is_active, org_id)
  VALUES (gen_random_uuid(), '3100', 'Retained Earnings', 'equity', 'equity', true, org) RETURNING id INTO opex_insurance;

  -- Opening balances (Jan 1, 2024)
  -- Reusing existing variable names (rev_sales=cash, rev_services=receivables, etc.)
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('1000', 450000.00, 0, '2024-01-01', org, rev_sales),
    ('1100', 320000.00, 0, '2024-01-01', org, rev_services),
    ('1200', 280000.00, 0, '2024-01-01', org, rev_other),
    ('1300', 24000.00, 0, '2024-01-01', org, cogs_materials),
    ('1500', 850000.00, 0, '2024-01-01', org, cogs_labor),
    ('1600', 0, 180000.00, '2024-01-01', org, cogs_freight),
    ('2000', 0, 195000.00, '2024-01-01', org, opex_salaries),
    ('2100', 0, 45000.00, '2024-01-01', org, opex_rent),
    ('2200', 0, 400000.00, '2024-01-01', org, opex_utilities),
    ('2300', 0, 34000.00, '2024-01-01', org, opex_marketing),
    ('3000', 0, 500000.00, '2024-01-01', org, opex_depreciation),
    ('3100', 0, 570000.00, '2024-01-01', org, opex_insurance);

  -- Q1 movements (Mar 31)
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('1000', 85000.00, 0, '2024-03-31', org, rev_sales),
    ('1100', 42000.00, 0, '2024-03-31', org, rev_services),
    ('1200', 0, 15000.00, '2024-03-31', org, rev_other),
    ('1600', 0, 13500.00, '2024-03-31', org, cogs_freight),
    ('2000', 0, 28000.00, '2024-03-31', org, opex_salaries),
    ('2100', 0, 8000.00, '2024-03-31', org, opex_rent),
    ('2300', 0, 12500.00, '2024-03-31', org, opex_marketing),
    ('3100', 0, 50000.00, '2024-03-31', org, opex_insurance);

  -- Q2 movements (Jun 30)
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('1000', 92000.00, 0, '2024-06-30', org, rev_sales),
    ('1100', 55000.00, 0, '2024-06-30', org, rev_services),
    ('1200', 0, 8000.00, '2024-06-30', org, rev_other),
    ('1300', 0, 6000.00, '2024-06-30', org, cogs_materials),
    ('1500', 120000.00, 0, '2024-06-30', org, cogs_labor),
    ('1600', 0, 13500.00, '2024-06-30', org, cogs_freight),
    ('2000', 0, 35000.00, '2024-06-30', org, opex_salaries),
    ('2100', 0, 5000.00, '2024-06-30', org, opex_rent),
    ('2300', 0, 15000.00, '2024-06-30', org, opex_marketing),
    ('3100', 0, 60000.00, '2024-06-30', org, opex_insurance);

  -- Q3 movements (Sep 30)
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('1000', 78000.00, 0, '2024-09-30', org, rev_sales),
    ('1100', 38000.00, 0, '2024-09-30', org, rev_services),
    ('1200', 12000.00, 0, '2024-09-30', org, rev_other),
    ('1300', 0, 6000.00, '2024-09-30', org, cogs_materials),
    ('1600', 0, 13500.00, '2024-09-30', org, cogs_freight),
    ('2000', 0, 22000.00, '2024-09-30', org, opex_salaries),
    ('2100', 0, 3000.00, '2024-09-30', org, opex_rent),
    ('2300', 0, 14000.00, '2024-09-30', org, opex_marketing),
    ('3100', 0, 55000.00, '2024-09-30', org, opex_insurance);

  -- Q4 movements (Dec 31)
  INSERT INTO finance.gl_entries (account_code, debit, credit, posting_date, org_id, account_id) VALUES
    ('1000', 110000.00, 0, '2024-12-31', org, rev_sales),
    ('1100', 65000.00, 0, '2024-12-31', org, rev_services),
    ('1200', 18000.00, 0, '2024-12-31', org, rev_other),
    ('1300', 0, 6000.00, '2024-12-31', org, cogs_materials),
    ('1500', 80000.00, 0, '2024-12-31', org, cogs_labor),
    ('1600', 0, 13500.00, '2024-12-31', org, cogs_freight),
    ('2000', 0, 40000.00, '2024-12-31', org, opex_salaries),
    ('2100', 0, 7000.00, '2024-12-31', org, opex_rent),
    ('2300', 0, 18000.00, '2024-12-31', org, opex_marketing),
    ('3100', 0, 65000.00, '2024-12-31', org, opex_insurance);

  RAISE NOTICE 'Finance seed data inserted: 28 accounts (P&L + BS), GL entries seeded';
END $$;

-- AR AGING SEED DATA: Invoices, Customer Payments, Credit Limits
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  c1 UUID;
  c2 UUID;
  c3 UUID;
  c4 UUID;
  c5 UUID;
BEGIN
  -- Skip if invoices already exist
  IF EXISTS (SELECT 1 FROM finance.invoices LIMIT 1) THEN
    RAISE NOTICE 'AR data already seeded, skipping';
    RETURN;
  END IF;

  -- Get or create customer contacts with credit limits
  SELECT id INTO c1 FROM core.contacts WHERE first_name = 'Alice' AND last_name = 'Johnson' LIMIT 1;
  IF c1 IS NULL THEN
    INSERT INTO core.contacts (first_name, last_name, email, org_id, credit_limit) VALUES ('Alice', 'Johnson', 'alice@example.com', org, 200000.00) RETURNING id INTO c1;
  ELSE
    UPDATE core.contacts SET credit_limit = 200000.00 WHERE id = c1;
  END IF;

  SELECT id INTO c2 FROM core.contacts WHERE first_name = 'Bob' AND last_name = 'Smith' LIMIT 1;
  IF c2 IS NULL THEN
    INSERT INTO core.contacts (first_name, last_name, email, org_id, credit_limit) VALUES ('Bob', 'Smith', 'bob@example.com', org, 150000.00) RETURNING id INTO c2;
  ELSE
    UPDATE core.contacts SET credit_limit = 150000.00 WHERE id = c2;
  END IF;

  SELECT id INTO c3 FROM core.contacts WHERE first_name = 'Carol' AND last_name = 'Davis' LIMIT 1;
  IF c3 IS NULL THEN
    INSERT INTO core.contacts (first_name, last_name, email, org_id, credit_limit) VALUES ('Carol', 'Davis', 'carol@example.com', org, 100000.00) RETURNING id INTO c3;
  ELSE
    UPDATE core.contacts SET credit_limit = 100000.00 WHERE id = c3;
  END IF;

  INSERT INTO core.contacts (first_name, last_name, email, org_id, credit_limit)
  VALUES ('David', 'Wilson', 'david@example.com', org, 250000.00) RETURNING id INTO c4;
  INSERT INTO core.contacts (first_name, last_name, email, org_id, credit_limit)
  VALUES ('Emma', 'Taylor', 'emma@example.com', org, 80000.00) RETURNING id INTO c5;

  -- Seed invoices with various aging buckets (relative to 2024-12-31 as reporting date)
  -- Current (not yet due)
  INSERT INTO finance.invoices (invoice_number, customer_id, total_amount, balance_due, invoice_date, due_date, org_id, branch_id, status) VALUES
    ('INV-2024-001', c1, 45000.00, 45000.00, '2024-12-15', '2025-01-14', org, org, 'open'),
    ('INV-2024-002', c2, 32000.00, 32000.00, '2024-12-20', '2025-01-19', org, org, 'open'),
    ('INV-2024-003', c4, 58000.00, 58000.00, '2024-12-22', '2025-01-21', org, org, 'open'),
    ('INV-2024-004', c3, 18000.00, 18000.00, '2024-12-28', '2025-01-27', org, org, 'open');

  -- 1-30 Days overdue
  INSERT INTO finance.invoices (invoice_number, customer_id, total_amount, balance_due, invoice_date, due_date, org_id, branch_id, status) VALUES
    ('INV-2024-005', c1, 35000.00, 35000.00, '2024-11-10', '2024-12-10', org, org, 'overdue'),
    ('INV-2024-006', c5, 22000.00, 15000.00, '2024-11-15', '2024-12-15', org, org, 'overdue'),
    ('INV-2024-007', c4, 41000.00, 41000.00, '2024-11-20', '2024-12-20', org, org, 'overdue');

  -- 31-60 Days overdue
  INSERT INTO finance.invoices (invoice_number, customer_id, total_amount, balance_due, invoice_date, due_date, org_id, branch_id, status) VALUES
    ('INV-2024-008', c2, 28000.00, 28000.00, '2024-10-05', '2024-11-04', org, org, 'overdue'),
    ('INV-2024-009', c1, 52000.00, 30000.00, '2024-10-15', '2024-11-14', org, org, 'overdue'),
    ('INV-2024-010', c3, 19000.00, 19000.00, '2024-10-20', '2024-11-19', org, org, 'overdue');

  -- 61-90 Days overdue
  INSERT INTO finance.invoices (invoice_number, customer_id, total_amount, balance_due, invoice_date, due_date, org_id, branch_id, status) VALUES
    ('INV-2024-011', c4, 65000.00, 50000.00, '2024-09-01', '2024-10-01', org, org, 'overdue'),
    ('INV-2024-012', c2, 18000.00, 18000.00, '2024-09-15', '2024-10-15', org, org, 'overdue');

  -- 90+ Days overdue
  INSERT INTO finance.invoices (invoice_number, customer_id, total_amount, balance_due, invoice_date, due_date, org_id, branch_id, status) VALUES
    ('INV-2024-013', c5, 25000.00, 25000.00, '2024-07-01', '2024-07-31', org, org, 'overdue'),
    ('INV-2024-014', c1, 42000.00, 42000.00, '2024-06-15', '2024-07-15', org, org, 'overdue'),
    ('INV-2024-015', c3, 15000.00, 15000.00, '2024-08-01', '2024-08-31', org, org, 'overdue');

  -- Fully paid invoices (for last payment date tracking)
  INSERT INTO finance.invoices (invoice_number, customer_id, total_amount, balance_due, invoice_date, due_date, org_id, branch_id, status) VALUES
    ('INV-2024-016', c1, 30000.00, 0, '2024-09-01', '2024-10-01', org, org, 'paid'),
    ('INV-2024-017', c2, 25000.00, 0, '2024-10-01', '2024-10-31', org, org, 'paid'),
    ('INV-2024-018', c4, 40000.00, 0, '2024-11-01', '2024-12-01', org, org, 'paid');

  -- Customer payments
  INSERT INTO finance.customer_payments (customer_id, payment_date, amount, org_id, branch_id) VALUES
    (c1, '2024-12-05', 30000.00, org, org),
    (c1, '2024-11-15', 22000.00, org, org),
    (c2, '2024-11-20', 25000.00, org, org),
    (c3, '2024-10-15', 12000.00, org, org),
    (c4, '2024-12-10', 40000.00, org, org),
    (c4, '2024-11-05', 15000.00, org, org),
    (c5, '2024-12-18', 7000.00, org, org);

  RAISE NOTICE 'AR Aging data seeded: 18 invoices, 7 payments, 5 customers with credit limits';
END $$;

-- ============================================================================
-- Invoice lines (with VAT/tax fields) for Tax/VAT Summary report
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='invoice_lines') THEN
    EXECUTE '
      CREATE TABLE finance.invoice_lines (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        invoice_id UUID,
        product_id UUID,
        description TEXT,
        quantity NUMERIC(12,2) DEFAULT 1,
        unit_price NUMERIC(12,2) DEFAULT 0,
        line_total NUMERIC(12,2) DEFAULT 0,
        tax_code TEXT DEFAULT ''VAT'',
        tax_rate NUMERIC(5,2) DEFAULT 15.00,
        vat_amount NUMERIC(12,2) DEFAULT 0,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='finance' AND table_name='purchase_invoice_lines') THEN
    EXECUTE '
      CREATE TABLE finance.purchase_invoice_lines (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        purchase_invoice_id UUID,
        product_id UUID,
        description TEXT,
        quantity NUMERIC(12,2) DEFAULT 1,
        unit_price NUMERIC(12,2) DEFAULT 0,
        line_total NUMERIC(12,2) DEFAULT 0,
        tax_code TEXT DEFAULT ''VAT'',
        tax_rate NUMERIC(5,2) DEFAULT 15.00,
        vat_amount NUMERIC(12,2) DEFAULT 0,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

COMMENT ON TABLE finance.invoice_lines IS 'Line items on customer invoices with VAT/tax detail';
COMMENT ON COLUMN finance.invoice_lines.tax_code IS 'Tax code: VAT, VAT-Zero, Exempt, etc.';
COMMENT ON COLUMN finance.invoice_lines.tax_rate IS 'Applicable tax rate percentage (e.g. 15.00 for 15%)';
COMMENT ON COLUMN finance.invoice_lines.vat_amount IS 'Computed VAT amount for this line item';
COMMENT ON TABLE finance.purchase_invoice_lines IS 'Line items on supplier purchase invoices with VAT/tax detail';
COMMENT ON COLUMN finance.purchase_invoice_lines.tax_code IS 'Tax code: VAT, VAT-Zero, Exempt, etc.';
COMMENT ON COLUMN finance.purchase_invoice_lines.tax_rate IS 'Applicable tax rate percentage (e.g. 15.00 for 15%)';
COMMENT ON COLUMN finance.purchase_invoice_lines.vat_amount IS 'Computed VAT amount for this line item';

-- FK constraints for invoice_lines
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_invoice_lines_invoice' AND table_schema = 'finance'
  ) THEN
    ALTER TABLE finance.invoice_lines
      ADD CONSTRAINT fk_invoice_lines_invoice FOREIGN KEY (invoice_id) REFERENCES finance.invoices(id);
  END IF;
END $$;

-- ============================================================================
-- VAT/Tax seed data for testing
-- ============================================================================
DO $$
DECLARE
  org UUID;
  branch UUID;
  inv1 UUID; inv2 UUID; inv3 UUID; inv4 UUID; inv5 UUID; inv6 UUID;
BEGIN
  SELECT id INTO org FROM core.organizations LIMIT 1;
  SELECT id INTO branch FROM core.branches WHERE org_id = org LIMIT 1;

  IF EXISTS (SELECT 1 FROM finance.invoice_lines LIMIT 1) THEN
    RAISE NOTICE 'VAT seed data already exists, skipping';
    RETURN;
  END IF;

  SELECT id INTO inv1 FROM finance.invoices ORDER BY invoice_date LIMIT 1 OFFSET 0;
  SELECT id INTO inv2 FROM finance.invoices ORDER BY invoice_date LIMIT 1 OFFSET 1;
  SELECT id INTO inv3 FROM finance.invoices ORDER BY invoice_date LIMIT 1 OFFSET 2;
  SELECT id INTO inv4 FROM finance.invoices ORDER BY invoice_date LIMIT 1 OFFSET 3;
  SELECT id INTO inv5 FROM finance.invoices ORDER BY invoice_date LIMIT 1 OFFSET 4;
  SELECT id INTO inv6 FROM finance.invoices ORDER BY invoice_date LIMIT 1 OFFSET 5;

  -- Invoice lines with VAT (Output tax - sales)
  INSERT INTO finance.invoice_lines (invoice_id, description, quantity, unit_price, line_total, tax_code, tax_rate, vat_amount, org_id, branch_id) VALUES
    (inv1, 'Product A - Standard rated', 10, 1000.00, 10000.00, 'VAT', 15.00, 1500.00, org, branch),
    (inv1, 'Service B - Standard rated', 5, 2000.00, 10000.00, 'VAT', 15.00, 1500.00, org, branch),
    (inv1, 'Export goods - Zero rated', 20, 500.00, 10000.00, 'VAT-Zero', 0.00, 0.00, org, branch),
    (inv1, 'Medical supplies - Exempt', 8, 750.00, 6000.00, 'Exempt', 0.00, 0.00, org, branch),
    (inv2, 'Product C - Standard rated', 15, 800.00, 12000.00, 'VAT', 15.00, 1800.00, org, branch),
    (inv2, 'Consulting fees', 10, 1500.00, 15000.00, 'VAT', 15.00, 2250.00, org, branch),
    (inv2, 'Export services', 5, 3000.00, 15000.00, 'VAT-Zero', 0.00, 0.00, org, branch),
    (inv3, 'Product D - Standard rated', 25, 600.00, 15000.00, 'VAT', 15.00, 2250.00, org, branch),
    (inv3, 'Installation services', 3, 5000.00, 15000.00, 'VAT', 15.00, 2250.00, org, branch),
    (inv4, 'Product E - Standard rated', 20, 900.00, 18000.00, 'VAT', 15.00, 2700.00, org, branch),
    (inv4, 'Training services - Exempt', 4, 2500.00, 10000.00, 'Exempt', 0.00, 0.00, org, branch),
    (inv5, 'Product F - Standard rated', 30, 700.00, 21000.00, 'VAT', 15.00, 3150.00, org, branch),
    (inv5, 'Support contract', 1, 8000.00, 8000.00, 'VAT', 15.00, 1200.00, org, branch),
    (inv5, 'Export goods batch 2', 15, 1200.00, 18000.00, 'VAT-Zero', 0.00, 0.00, org, branch),
    (inv6, 'Product G - Standard rated', 18, 1100.00, 19800.00, 'VAT', 15.00, 2970.00, org, branch),
    (inv6, 'Maintenance fees', 6, 1800.00, 10800.00, 'VAT', 15.00, 1620.00, org, branch);

  -- Purchase invoice lines with VAT (Input tax - purchases)
  INSERT INTO finance.purchase_invoice_lines (description, quantity, unit_price, line_total, tax_code, tax_rate, vat_amount, org_id, branch_id) VALUES
    ('Raw materials - Standard rated', 50, 400.00, 20000.00, 'VAT', 15.00, 3000.00, org, branch),
    ('Office supplies', 20, 150.00, 3000.00, 'VAT', 15.00, 450.00, org, branch),
    ('Imported components - Zero rated', 30, 800.00, 24000.00, 'VAT-Zero', 0.00, 0.00, org, branch),
    ('Packaging materials', 100, 50.00, 5000.00, 'VAT', 15.00, 750.00, org, branch),
    ('Equipment maintenance', 1, 12000.00, 12000.00, 'VAT', 15.00, 1800.00, org, branch),
    ('Raw materials batch 2', 60, 350.00, 21000.00, 'VAT', 15.00, 3150.00, org, branch),
    ('IT services', 1, 8000.00, 8000.00, 'VAT', 15.00, 1200.00, org, branch),
    ('Warehouse supplies', 40, 200.00, 8000.00, 'VAT', 15.00, 1200.00, org, branch),
    ('Professional services - Exempt', 1, 15000.00, 15000.00, 'Exempt', 0.00, 0.00, org, branch),
    ('Production materials', 80, 300.00, 24000.00, 'VAT', 15.00, 3600.00, org, branch),
    ('Utilities', 1, 4500.00, 4500.00, 'VAT', 15.00, 675.00, org, branch),
    ('Raw materials batch 3', 70, 380.00, 26600.00, 'VAT', 15.00, 3990.00, org, branch),
    ('Security services', 1, 6000.00, 6000.00, 'VAT', 15.00, 900.00, org, branch);

  RAISE NOTICE 'VAT/Tax seed data inserted: invoice_lines + purchase_invoice_lines';
END $$;

-- ============================================================================
-- Goods Receipt (GRN) tables for inbound logistics reporting
-- ============================================================================

-- Goods Receipt header
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='goods_receipts') THEN
    EXECUTE '
      CREATE TABLE inventory.goods_receipts (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        grn_number TEXT NOT NULL,
        po_id UUID,
        supplier_id UUID,
        receipt_date DATE DEFAULT CURRENT_DATE,
        status TEXT DEFAULT ''completed'',
        received_by TEXT,
        notes TEXT,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

-- Goods Receipt line items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='goods_receipt_lines') THEN
    EXECUTE '
      CREATE TABLE inventory.goods_receipt_lines (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        grn_id UUID,
        product_id UUID,
        po_line_id UUID,
        expected_qty NUMERIC(12,2) DEFAULT 0,
        received_qty NUMERIC(12,2) DEFAULT 0,
        rejected_qty NUMERIC(12,2) DEFAULT 0,
        unit_cost NUMERIC(12,2) DEFAULT 0,
        line_total NUMERIC(12,2) DEFAULT 0,
        org_id UUID
      )';
  END IF;
END $$;

-- GRN Quality Inspection records
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='grn_inspection') THEN
    EXECUTE '
      CREATE TABLE inventory.grn_inspection (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        grn_line_id UUID,
        inspection_date DATE DEFAULT CURRENT_DATE,
        result TEXT DEFAULT ''pass'',
        inspector TEXT,
        defect_type TEXT,
        notes TEXT,
        org_id UUID
      )';
  END IF;
END $$;

-- FK constraints for GRN tables
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_grn_po' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.goods_receipts
      ADD CONSTRAINT fk_grn_po FOREIGN KEY (po_id) REFERENCES procurement.purchase_orders(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_grn_supplier' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.goods_receipts
      ADD CONSTRAINT fk_grn_supplier FOREIGN KEY (supplier_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_grl_grn' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.goods_receipt_lines
      ADD CONSTRAINT fk_grl_grn FOREIGN KEY (grn_id) REFERENCES inventory.goods_receipts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_grl_product' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.goods_receipt_lines
      ADD CONSTRAINT fk_grl_product FOREIGN KEY (product_id) REFERENCES inventory.products(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_inspection_grl' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.grn_inspection
      ADD CONSTRAINT fk_inspection_grl FOREIGN KEY (grn_line_id) REFERENCES inventory.goods_receipt_lines(id);
  END IF;
END $$;

COMMENT ON TABLE inventory.goods_receipts IS 'Goods Receipt Notes (GRN) header records for inbound logistics';
COMMENT ON COLUMN inventory.goods_receipts.grn_number IS 'Unique GRN reference number | display_column';
COMMENT ON COLUMN inventory.goods_receipts.receipt_date IS 'Date goods were received at warehouse';
COMMENT ON COLUMN inventory.goods_receipts.status IS 'Receipt status: completed, partial, rejected';

COMMENT ON TABLE inventory.goods_receipt_lines IS 'GRN line items with expected vs received quantities';
COMMENT ON COLUMN inventory.goods_receipt_lines.expected_qty IS 'Quantity ordered on the PO line';
COMMENT ON COLUMN inventory.goods_receipt_lines.received_qty IS 'Actual quantity received and accepted';
COMMENT ON COLUMN inventory.goods_receipt_lines.rejected_qty IS 'Quantity rejected during inspection';

COMMENT ON TABLE inventory.grn_inspection IS 'Quality inspection records for GRN line items';
COMMENT ON COLUMN inventory.grn_inspection.result IS 'Inspection result: pass, fail, conditional';
COMMENT ON COLUMN inventory.grn_inspection.defect_type IS 'Type of defect found (if any)';

-- ============================================================================
-- Seed test data for GRN report
-- ============================================================================
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  br  UUID := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  -- Suppliers
  s1 UUID; s2 UUID; s3 UUID;
  -- Products
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
  -- POs
  po1 UUID; po2 UUID; po3 UUID; po4 UUID; po5 UUID; po6 UUID;
  -- GRNs
  grn1 UUID; grn2 UUID; grn3 UUID; grn4 UUID; grn5 UUID; grn6 UUID; grn7 UUID; grn8 UUID;
  -- GRN Lines
  gl1 UUID; gl2 UUID; gl3 UUID; gl4 UUID; gl5 UUID; gl6 UUID;
  gl7 UUID; gl8 UUID; gl9 UUID; gl10 UUID; gl11 UUID; gl12 UUID;
  gl13 UUID; gl14 UUID; gl15 UUID; gl16 UUID;
BEGIN
  -- Only seed if goods_receipts table is empty
  IF EXISTS (SELECT 1 FROM inventory.goods_receipts LIMIT 1) THEN
    RETURN;
  END IF;

  -- Ensure org exists
  IF NOT EXISTS (SELECT 1 FROM core.organizations WHERE id = org) THEN
    INSERT INTO core.organizations (id, name) VALUES (org, 'Test Org');
  END IF;

  -- Create supplier contacts
  SELECT id INTO s1 FROM core.contacts WHERE email = 'supplier1@example.com' LIMIT 1;
  IF s1 IS NULL THEN
    INSERT INTO core.contacts (first_name, last_name, email, org_id) VALUES ('Acme', 'Supplies', 'supplier1@example.com', org) RETURNING id INTO s1;
  END IF;
  SELECT id INTO s2 FROM core.contacts WHERE email = 'supplier2@example.com' LIMIT 1;
  IF s2 IS NULL THEN
    INSERT INTO core.contacts (first_name, last_name, email, org_id) VALUES ('Global', 'Parts', 'supplier2@example.com', org) RETURNING id INTO s2;
  END IF;
  SELECT id INTO s3 FROM core.contacts WHERE email = 'supplier3@example.com' LIMIT 1;
  IF s3 IS NULL THEN
    INSERT INTO core.contacts (first_name, last_name, email, org_id) VALUES ('Premier', 'Materials', 'supplier3@example.com', org) RETURNING id INTO s3;
  END IF;

  -- Get existing products
  SELECT id INTO p1 FROM inventory.products WHERE product_code = 'WIDGET-A' LIMIT 1;
  SELECT id INTO p2 FROM inventory.products WHERE product_code = 'GADGET-B' LIMIT 1;
  SELECT id INTO p3 FROM inventory.products WHERE product_code = 'PART-C' LIMIT 1;
  SELECT id INTO p4 FROM inventory.products WHERE product_code = 'SUPPLY-D' LIMIT 1;

  -- Create POs for GRN reference (varying lead times)
  INSERT INTO procurement.purchase_orders (po_number, supplier_id, total_amount, status, order_date, expected_date, org_id, branch_id)
    VALUES ('PO-GRN-001', s1, 15000.00, 'received', '2024-01-05', '2024-01-20', org, br) RETURNING id INTO po1;
  INSERT INTO procurement.purchase_orders (po_number, supplier_id, total_amount, status, order_date, expected_date, org_id, branch_id)
    VALUES ('PO-GRN-002', s2, 8500.00, 'received', '2024-02-01', '2024-02-14', org, br) RETURNING id INTO po2;
  INSERT INTO procurement.purchase_orders (po_number, supplier_id, total_amount, status, order_date, expected_date, org_id, branch_id)
    VALUES ('PO-GRN-003', s1, 12000.00, 'received', '2024-03-10', '2024-03-25', org, br) RETURNING id INTO po3;
  INSERT INTO procurement.purchase_orders (po_number, supplier_id, total_amount, status, order_date, expected_date, org_id, branch_id)
    VALUES ('PO-GRN-004', s3, 20000.00, 'partial', '2024-04-01', '2024-04-15', org, br) RETURNING id INTO po4;
  INSERT INTO procurement.purchase_orders (po_number, supplier_id, total_amount, status, order_date, expected_date, org_id, branch_id)
    VALUES ('PO-GRN-005', s2, 9500.00, 'received', '2024-05-10', '2024-05-25', org, br) RETURNING id INTO po5;
  INSERT INTO procurement.purchase_orders (po_number, supplier_id, total_amount, status, order_date, expected_date, org_id, branch_id)
    VALUES ('PO-GRN-006', s3, 16000.00, 'received', '2024-06-01', '2024-06-18', org, br) RETURNING id INTO po6;

  -- Purchase Order Lines (PO prices for PPV calculation)
  -- PO-GRN-001: Acme Supplies
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po1, p1, 50, 75.00, 3750.00, 50, org);
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po1, p2, 30, 125.00, 3750.00, 30, org);
  -- PO-GRN-002: Global Parts
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po2, p3, 100, 24.00, 2400.00, 80, org);
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po2, p4, 50, 13.50, 675.00, 40, org);
  -- PO-GRN-003: Acme Supplies
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po3, p1, 48, 82.00, 3936.00, 48, org);
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po3, p3, 85, 26.00, 2210.00, 83, org);
  -- PO-GRN-004: Premier Materials
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po4, p2, 110, 128.00, 14080.00, 78, org);
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po4, p4, 280, 11.00, 3080.00, 200, org);
  -- PO-GRN-005: Global Parts
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po5, p1, 60, 78.00, 4680.00, 60, org);
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po5, p3, 150, 24.50, 3675.00, 150, org);
  -- PO-GRN-006: Premier Materials
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po6, p2, 45, 135.00, 6075.00, 42, org);
  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, received_qty, org_id)
    VALUES (po6, p1, 35, 79.00, 2765.00, 35, org);

  -- GRN 1: Acme Supplies — full receipt, on time (lead 13 days)
  INSERT INTO inventory.goods_receipts (grn_number, po_id, supplier_id, receipt_date, status, received_by, org_id, branch_id)
    VALUES ('GRN-2024-001', po1, s1, '2024-01-18', 'completed', 'John Warehouse', org, br) RETURNING id INTO grn1;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn1, p1, 50, 50, 0, 80.00, 4000.00, org) RETURNING id INTO gl1;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn1, p2, 30, 30, 0, 130.00, 3900.00, org) RETURNING id INTO gl2;

  -- GRN 2: Global Parts — short delivery (received 18 of 25), late (lead 17 days vs expected 13)
  INSERT INTO inventory.goods_receipts (grn_number, po_id, supplier_id, receipt_date, status, received_by, org_id, branch_id)
    VALUES ('GRN-2024-002', po2, s2, '2024-02-18', 'partial', 'Jane Receiving', org, br) RETURNING id INTO grn2;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn2, p3, 100, 80, 5, 25.00, 2000.00, org) RETURNING id INTO gl3;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn2, p4, 50, 40, 0, 12.00, 480.00, org) RETURNING id INTO gl4;

  -- GRN 3: Acme Supplies — full receipt with quality issues (lead 12 days)
  INSERT INTO inventory.goods_receipts (grn_number, po_id, supplier_id, receipt_date, status, received_by, org_id, branch_id)
    VALUES ('GRN-2024-003', po3, s1, '2024-03-22', 'completed', 'John Warehouse', org, br) RETURNING id INTO grn3;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn3, p1, 40, 40, 8, 80.00, 3200.00, org) RETURNING id INTO gl5;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn3, p3, 60, 58, 0, 25.00, 1450.00, org) RETURNING id INTO gl6;

  -- GRN 4: Premier Materials — first partial receipt (lead 16 days)
  INSERT INTO inventory.goods_receipts (grn_number, po_id, supplier_id, receipt_date, status, received_by, org_id, branch_id)
    VALUES ('GRN-2024-004', po4, s3, '2024-04-17', 'partial', 'John Warehouse', org, br) RETURNING id INTO grn4;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn4, p2, 80, 50, 3, 130.00, 6500.00, org) RETURNING id INTO gl7;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn4, p4, 200, 120, 0, 12.00, 1440.00, org) RETURNING id INTO gl8;

  -- GRN 5: Premier Materials — second receipt for same PO (lead 30 days from PO)
  INSERT INTO inventory.goods_receipts (grn_number, po_id, supplier_id, receipt_date, status, received_by, org_id, branch_id)
    VALUES ('GRN-2024-005', po4, s3, '2024-05-01', 'completed', 'Jane Receiving', org, br) RETURNING id INTO grn5;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn5, p2, 30, 28, 2, 130.00, 3640.00, org) RETURNING id INTO gl9;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn5, p4, 80, 80, 0, 12.00, 960.00, org) RETURNING id INTO gl10;

  -- GRN 6: Global Parts — perfect receipt (lead 14 days, on time)
  INSERT INTO inventory.goods_receipts (grn_number, po_id, supplier_id, receipt_date, status, received_by, org_id, branch_id)
    VALUES ('GRN-2024-006', po5, s2, '2024-05-24', 'completed', 'John Warehouse', org, br) RETURNING id INTO grn6;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn6, p1, 60, 60, 0, 80.00, 4800.00, org) RETURNING id INTO gl11;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn6, p3, 150, 150, 0, 25.00, 3750.00, org) RETURNING id INTO gl12;

  -- GRN 7: Premier Materials — late receipt with rejected items (lead 20 days)
  INSERT INTO inventory.goods_receipts (grn_number, po_id, supplier_id, receipt_date, status, received_by, org_id, branch_id)
    VALUES ('GRN-2024-007', po6, s3, '2024-06-21', 'completed', 'Jane Receiving', org, br) RETURNING id INTO grn7;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn7, p2, 45, 42, 5, 130.00, 5460.00, org) RETURNING id INTO gl13;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn7, p1, 35, 35, 2, 80.00, 2800.00, org) RETURNING id INTO gl14;

  -- GRN 8: Acme Supplies — late June receipt, perfect quality
  INSERT INTO inventory.goods_receipts (grn_number, po_id, supplier_id, receipt_date, status, received_by, notes, org_id, branch_id)
    VALUES ('GRN-2024-008', po3, s1, '2024-06-28', 'completed', 'John Warehouse', 'Replacement batch for rejected items', org, br) RETURNING id INTO grn8;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn8, p1, 8, 8, 0, 80.00, 640.00, org) RETURNING id INTO gl15;
  INSERT INTO inventory.goods_receipt_lines (grn_id, product_id, expected_qty, received_qty, rejected_qty, unit_cost, line_total, org_id)
    VALUES (grn8, p4, 25, 25, 0, 12.00, 300.00, org) RETURNING id INTO gl16;

  -- Insert inspection records
  -- GRN 1 lines: all pass
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, org_id) VALUES (gl1, '2024-01-18', 'pass', 'QC Team A', org);
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, org_id) VALUES (gl2, '2024-01-18', 'pass', 'QC Team A', org);

  -- GRN 2 lines: first line has conditional (some minor defects), second passes
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, defect_type, notes, org_id)
    VALUES (gl3, '2024-02-19', 'conditional', 'QC Team B', 'Minor scratches', '5 units with surface scratches - accepted with discount', org);
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, org_id) VALUES (gl4, '2024-02-19', 'pass', 'QC Team B', org);

  -- GRN 3 lines: first line fails (8 rejected), second passes
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, defect_type, notes, org_id)
    VALUES (gl5, '2024-03-22', 'fail', 'QC Team A', 'Dimensional variance', '8 units out of spec - returned to supplier', org);
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, org_id) VALUES (gl6, '2024-03-22', 'pass', 'QC Team A', org);

  -- GRN 4 lines: first line conditional (3 rejected), second passes
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, defect_type, notes, org_id)
    VALUES (gl7, '2024-04-18', 'conditional', 'QC Team B', 'Packaging damage', '3 units damaged in transit', org);
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, org_id) VALUES (gl8, '2024-04-18', 'pass', 'QC Team B', org);

  -- GRN 5 lines: first line conditional (2 rejected), second passes
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, defect_type, notes, org_id)
    VALUES (gl9, '2024-05-02', 'conditional', 'QC Team A', 'Cosmetic defects', '2 units with paint issues', org);
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, org_id) VALUES (gl10, '2024-05-02', 'pass', 'QC Team A', org);

  -- GRN 6 lines: all pass (perfect)
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, org_id) VALUES (gl11, '2024-05-24', 'pass', 'QC Team B', org);
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, org_id) VALUES (gl12, '2024-05-24', 'pass', 'QC Team B', org);

  -- GRN 7 lines: first fails (5 rejected), second conditional (2 rejected)
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, defect_type, notes, org_id)
    VALUES (gl13, '2024-06-22', 'fail', 'QC Team A', 'Functional defect', '5 units non-functional - returned', org);
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, defect_type, notes, org_id)
    VALUES (gl14, '2024-06-22', 'conditional', 'QC Team A', 'Minor scratches', '2 units with minor cosmetic issues - accepted', org);

  -- GRN 8 lines: all pass (replacement batch)
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, org_id) VALUES (gl15, '2024-06-28', 'pass', 'QC Team A', org);
  INSERT INTO inventory.grn_inspection (grn_line_id, inspection_date, result, inspector, org_id) VALUES (gl16, '2024-06-28', 'pass', 'QC Team A', org);

  RAISE NOTICE 'GRN seed data inserted: 8 GRNs, 16 lines, 16 inspections';
END $$;

-- ============================================================================
-- Seed open Purchase Orders for Open PO Aging report
-- ============================================================================
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  br  UUID := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  s1 UUID := 'f2319ae6-951f-4351-9c9f-45d56ecf29d2';
  s2 UUID := '787a34df-b041-47ce-9669-528059c7dc11';
  s3 UUID := 'eb098e14-4172-4ddf-a815-f75e61c550e4';
  v_po7 UUID; v_po8 UUID; v_po9 UUID; v_po10 UUID; v_po11 UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM procurement.purchase_orders WHERE po_number = 'PO-OPEN-001') THEN
    RETURN;
  END IF;

  v_po7 := gen_random_uuid();
  v_po8 := gen_random_uuid();
  v_po9 := gen_random_uuid();
  v_po10 := gen_random_uuid();
  v_po11 := gen_random_uuid();

  INSERT INTO procurement.purchase_orders (id, po_number, supplier_id, order_date, expected_date, total_amount, status, org_id, branch_id) VALUES
    (v_po7,  'PO-OPEN-001', s1, '2024-08-15', '2024-09-01',  7500.00, 'sent',    org, br),
    (v_po8,  'PO-OPEN-002', s2, '2024-09-01', '2024-09-20', 12300.00, 'sent',    org, br),
    (v_po9,  'PO-OPEN-003', s3, '2024-10-10', '2024-10-25', 18750.00, 'sent',    org, br),
    (v_po10, 'PO-OPEN-004', s1, '2024-11-01', '2024-11-15',  5200.00, 'partial', org, br),
    (v_po11, 'PO-OPEN-005', s2, '2024-12-01', '2024-12-20',  9800.00, 'sent',    org, br);

  INSERT INTO procurement.purchase_order_lines (po_id, product_id, quantity, unit_cost, line_total, org_id) VALUES
    (v_po7,  '6f0ae0db-846f-486b-b043-f2dc135848d5',  50, 80.00,  4000.00, org),
    (v_po7,  '1583c46a-36d7-436d-8c1e-8614fa0ef366', 140, 25.00,  3500.00, org),
    (v_po8,  'fea0bc3b-4fa8-412f-9e2b-4146d155e7ff',  60, 130.00, 7800.00, org),
    (v_po8,  'ee369915-353d-4f5f-b359-56816fbf2814', 375, 12.00,  4500.00, org),
    (v_po9,  '6f0ae0db-846f-486b-b043-f2dc135848d5', 100, 80.00,  8000.00, org),
    (v_po9,  'fea0bc3b-4fa8-412f-9e2b-4146d155e7ff',  50, 130.00, 6500.00, org),
    (v_po9,  '1583c46a-36d7-436d-8c1e-8614fa0ef366', 170, 25.00,  4250.00, org),
    (v_po10, '6f0ae0db-846f-486b-b043-f2dc135848d5',  30, 80.00,  2400.00, org),
    (v_po10, 'ee369915-353d-4f5f-b359-56816fbf2814', 200, 14.00,  2800.00, org),
    (v_po11, 'fea0bc3b-4fa8-412f-9e2b-4146d155e7ff',  40, 130.00, 5200.00, org),
    (v_po11, '1583c46a-36d7-436d-8c1e-8614fa0ef366', 184, 25.00,  4600.00, org);

  RAISE NOTICE 'Open PO seed data inserted: 5 open POs, 11 PO lines';
END $$;

-- ============================================================================
-- Stock Count / Stock Take tables for variance reporting
-- ============================================================================

-- Stock Count header (stock take exercise)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='stock_counts') THEN
    EXECUTE '
      CREATE TABLE inventory.stock_counts (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        count_number TEXT NOT NULL,
        warehouse_id UUID,
        count_date DATE DEFAULT CURRENT_DATE,
        status TEXT DEFAULT ''completed'',
        counted_by TEXT,
        approved_by TEXT,
        notes TEXT,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

-- Stock Count line items (per-product count results)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='count_lines') THEN
    EXECUTE '
      CREATE TABLE inventory.count_lines (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        count_id UUID,
        product_id UUID,
        zone TEXT,
        book_qty NUMERIC(12,2) DEFAULT 0,
        physical_qty NUMERIC(12,2) DEFAULT 0,
        variance_qty NUMERIC(12,2) DEFAULT 0,
        unit_cost NUMERIC(12,2) DEFAULT 0,
        variance_value NUMERIC(12,2) DEFAULT 0,
        notes TEXT,
        org_id UUID
      )';
  END IF;
END $$;

-- FK constraints for stock count tables
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_stock_counts_warehouse' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.stock_counts
      ADD CONSTRAINT fk_stock_counts_warehouse FOREIGN KEY (warehouse_id) REFERENCES inventory.warehouses(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_count_lines_count' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.count_lines
      ADD CONSTRAINT fk_count_lines_count FOREIGN KEY (count_id) REFERENCES inventory.stock_counts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_count_lines_product' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.count_lines
      ADD CONSTRAINT fk_count_lines_product FOREIGN KEY (product_id) REFERENCES inventory.products(id);
  END IF;
END $$;

COMMENT ON TABLE inventory.stock_counts IS 'Stock take exercise headers';
COMMENT ON COLUMN inventory.stock_counts.count_number IS 'Unique stock count reference | display_column';
COMMENT ON COLUMN inventory.stock_counts.count_date IS 'Date the stock take was performed';
COMMENT ON COLUMN inventory.stock_counts.status IS 'Count status: in_progress, completed, cancelled';

COMMENT ON TABLE inventory.count_lines IS 'Per-product stock count results with variances';
COMMENT ON COLUMN inventory.count_lines.zone IS 'Warehouse zone or location where count was performed';
COMMENT ON COLUMN inventory.count_lines.book_qty IS 'System (book) quantity at time of count';
COMMENT ON COLUMN inventory.count_lines.physical_qty IS 'Actual physically counted quantity';
COMMENT ON COLUMN inventory.count_lines.variance_qty IS 'Difference: physical_qty - book_qty (negative = shrinkage)';
COMMENT ON COLUMN inventory.count_lines.variance_value IS 'Monetary value of variance (variance_qty * unit_cost)';

-- ============================================================================
-- Seed test data for Stock Count Variance report
-- ============================================================================
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  br  UUID := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  w1 UUID; w2 UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
  sc1 UUID; sc2 UUID; sc3 UUID;
BEGIN
  -- Only seed if stock_counts table is empty
  IF EXISTS (SELECT 1 FROM inventory.stock_counts LIMIT 1) THEN
    RETURN;
  END IF;

  -- Get warehouses (create if needed)
  SELECT id INTO w1 FROM inventory.warehouses WHERE warehouse_code = 'WH-MAIN' LIMIT 1;
  IF w1 IS NULL THEN
    INSERT INTO inventory.warehouses (warehouse_code, warehouse_name, location, org_id, branch_id)
      VALUES ('WH-MAIN', 'Main Warehouse', 'Johannesburg', org, br) RETURNING id INTO w1;
  END IF;
  SELECT id INTO w2 FROM inventory.warehouses WHERE warehouse_code = 'WH-SECONDARY' LIMIT 1;
  IF w2 IS NULL THEN
    INSERT INTO inventory.warehouses (warehouse_code, warehouse_name, location, org_id, branch_id)
      VALUES ('WH-SECONDARY', 'Secondary Warehouse', 'Cape Town', org, br) RETURNING id INTO w2;
  END IF;

  -- Get products
  SELECT id INTO p1 FROM inventory.products WHERE product_code = 'WIDGET-A' LIMIT 1;
  SELECT id INTO p2 FROM inventory.products WHERE product_code = 'GADGET-B' LIMIT 1;
  SELECT id INTO p3 FROM inventory.products WHERE product_code = 'PART-C' LIMIT 1;
  SELECT id INTO p4 FROM inventory.products WHERE product_code = 'SUPPLY-D' LIMIT 1;

  -- Stock Count 1: Q1 2024 count at Main Warehouse (some shrinkage)
  INSERT INTO inventory.stock_counts (count_number, warehouse_id, count_date, status, counted_by, approved_by, org_id, branch_id)
    VALUES ('SC-2024-Q1', w1, '2024-03-31', 'completed', 'Team Alpha', 'Warehouse Manager', org, br) RETURNING id INTO sc1;

  INSERT INTO inventory.count_lines (count_id, product_id, zone, book_qty, physical_qty, variance_qty, unit_cost, variance_value, org_id) VALUES
    (sc1, p1, 'Zone A', 100, 97, -3, 80.00, -240.00, org),
    (sc1, p2, 'Zone A', 50, 48, -2, 130.00, -260.00, org),
    (sc1, p3, 'Zone B', 500, 495, -5, 25.00, -125.00, org),
    (sc1, p4, 'Zone B', 200, 205, 5, 12.00, 60.00, org),
    (sc1, p1, 'Zone C', 75, 75, 0, 80.00, 0.00, org),
    (sc1, p3, 'Zone C', 300, 292, -8, 25.00, -200.00, org);

  -- Stock Count 2: Q2 2024 count at Secondary Warehouse (larger variances)
  INSERT INTO inventory.stock_counts (count_number, warehouse_id, count_date, status, counted_by, approved_by, org_id, branch_id)
    VALUES ('SC-2024-Q2', w2, '2024-06-30', 'completed', 'Team Beta', 'Warehouse Manager', org, br) RETURNING id INTO sc2;

  INSERT INTO inventory.count_lines (count_id, product_id, zone, book_qty, physical_qty, variance_qty, unit_cost, variance_value, org_id) VALUES
    (sc2, p1, 'Zone A', 80, 72, -8, 80.00, -640.00, org),
    (sc2, p2, 'Zone A', 35, 35, 0, 130.00, 0.00, org),
    (sc2, p3, 'Zone B', 400, 385, -15, 25.00, -375.00, org),
    (sc2, p4, 'Zone B', 150, 148, -2, 12.00, -24.00, org),
    (sc2, p1, 'Zone C', 60, 63, 3, 80.00, 240.00, org),
    (sc2, p2, 'Zone C', 25, 22, -3, 130.00, -390.00, org);

  -- Stock Count 3: Q3 2024 count at Main Warehouse (improved accuracy)
  INSERT INTO inventory.stock_counts (count_number, warehouse_id, count_date, status, counted_by, approved_by, org_id, branch_id)
    VALUES ('SC-2024-Q3', w1, '2024-09-30', 'completed', 'Team Alpha', 'Warehouse Manager', org, br) RETURNING id INTO sc3;

  INSERT INTO inventory.count_lines (count_id, product_id, zone, book_qty, physical_qty, variance_qty, unit_cost, variance_value, org_id) VALUES
    (sc3, p1, 'Zone A', 120, 119, -1, 80.00, -80.00, org),
    (sc3, p2, 'Zone A', 45, 45, 0, 130.00, 0.00, org),
    (sc3, p3, 'Zone B', 550, 548, -2, 25.00, -50.00, org),
    (sc3, p4, 'Zone B', 180, 180, 0, 12.00, 0.00, org),
    (sc3, p1, 'Zone C', 90, 88, -2, 80.00, -160.00, org),
    (sc3, p3, 'Zone C', 350, 347, -3, 25.00, -75.00, org);

  RAISE NOTICE 'Stock count seed data inserted: 3 counts, 18 lines';
END $$;

-- ============================================================================
-- Warehouse Bin tables for bin utilization reporting
-- ============================================================================

-- Warehouse zones (areas within a warehouse)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='warehouse_zones') THEN
    EXECUTE '
      CREATE TABLE inventory.warehouse_zones (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        warehouse_id UUID,
        zone_code TEXT NOT NULL,
        zone_name TEXT NOT NULL,
        zone_type TEXT DEFAULT ''general'',
        capacity_bins INTEGER DEFAULT 0,
        org_id UUID
      )';
  END IF;
END $$;

-- Warehouse bins (individual storage locations)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='warehouse_bins') THEN
    EXECUTE '
      CREATE TABLE inventory.warehouse_bins (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        zone_id UUID,
        bin_code TEXT NOT NULL,
        bin_type TEXT DEFAULT ''shelf'',
        max_capacity NUMERIC(12,2) DEFAULT 100,
        is_active BOOLEAN DEFAULT TRUE,
        org_id UUID
      )';
  END IF;
END $$;

-- Stock in bins (bin occupancy)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='inventory' AND table_name='stock_bins') THEN
    EXECUTE '
      CREATE TABLE inventory.stock_bins (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        bin_id UUID,
        product_id UUID,
        quantity NUMERIC(12,2) DEFAULT 0,
        last_updated TIMESTAMP DEFAULT now(),
        org_id UUID
      )';
  END IF;
END $$;

-- FK constraints for bin tables
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_zones_warehouse' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.warehouse_zones
      ADD CONSTRAINT fk_zones_warehouse FOREIGN KEY (warehouse_id) REFERENCES inventory.warehouses(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_bins_zone' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.warehouse_bins
      ADD CONSTRAINT fk_bins_zone FOREIGN KEY (zone_id) REFERENCES inventory.warehouse_zones(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_stock_bins_bin' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.stock_bins
      ADD CONSTRAINT fk_stock_bins_bin FOREIGN KEY (bin_id) REFERENCES inventory.warehouse_bins(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_stock_bins_product' AND table_schema = 'inventory'
  ) THEN
    ALTER TABLE inventory.stock_bins
      ADD CONSTRAINT fk_stock_bins_product FOREIGN KEY (product_id) REFERENCES inventory.products(id);
  END IF;
END $$;

COMMENT ON TABLE inventory.warehouse_zones IS 'Warehouse zones or areas for storage layout';
COMMENT ON COLUMN inventory.warehouse_zones.zone_code IS 'Zone code identifier | display_column';
COMMENT ON COLUMN inventory.warehouse_zones.zone_name IS 'Zone display name | display_column';
COMMENT ON COLUMN inventory.warehouse_zones.zone_type IS 'Zone type: picking, bulk, receiving, shipping, general';
COMMENT ON COLUMN inventory.warehouse_zones.capacity_bins IS 'Maximum number of bins in this zone';

COMMENT ON TABLE inventory.warehouse_bins IS 'Individual bin storage locations within warehouse zones';
COMMENT ON COLUMN inventory.warehouse_bins.bin_code IS 'Bin location code (e.g., A-01-01) | display_column';
COMMENT ON COLUMN inventory.warehouse_bins.bin_type IS 'Bin type: shelf, floor, rack, pallet';
COMMENT ON COLUMN inventory.warehouse_bins.max_capacity IS 'Maximum unit capacity for this bin';

COMMENT ON TABLE inventory.stock_bins IS 'Current stock allocation to warehouse bins';
COMMENT ON COLUMN inventory.stock_bins.quantity IS 'Quantity of product currently in the bin';

-- ============================================================================
-- Seed test data for Warehouse Bin Utilization report
-- ============================================================================
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  w1 UUID; w2 UUID;
  -- Zones
  z1a UUID; z1b UUID; z1c UUID; z1d UUID;
  z2a UUID; z2b UUID; z2c UUID;
  -- Bin IDs (arrays would be nicer but we keep it simple)
  b UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
  bin_counter INTEGER;
BEGIN
  -- Only seed if warehouse_zones table is empty
  IF EXISTS (SELECT 1 FROM inventory.warehouse_zones LIMIT 1) THEN
    RETURN;
  END IF;

  -- Get warehouses
  SELECT id INTO w1 FROM inventory.warehouses WHERE warehouse_code = 'WH-MAIN' LIMIT 1;
  SELECT id INTO w2 FROM inventory.warehouses WHERE warehouse_code = 'WH-SECONDARY' LIMIT 1;

  -- Get products
  SELECT id INTO p1 FROM inventory.products WHERE product_code = 'WIDGET-A' LIMIT 1;
  SELECT id INTO p2 FROM inventory.products WHERE product_code = 'GADGET-B' LIMIT 1;
  SELECT id INTO p3 FROM inventory.products WHERE product_code = 'PART-C' LIMIT 1;
  SELECT id INTO p4 FROM inventory.products WHERE product_code = 'SUPPLY-D' LIMIT 1;

  -- ===== Main Warehouse Zones =====
  INSERT INTO inventory.warehouse_zones (warehouse_id, zone_code, zone_name, zone_type, capacity_bins, org_id)
    VALUES (w1, 'MWH-A', 'Picking Zone A', 'picking', 20, org) RETURNING id INTO z1a;
  INSERT INTO inventory.warehouse_zones (warehouse_id, zone_code, zone_name, zone_type, capacity_bins, org_id)
    VALUES (w1, 'MWH-B', 'Bulk Storage B', 'bulk', 30, org) RETURNING id INTO z1b;
  INSERT INTO inventory.warehouse_zones (warehouse_id, zone_code, zone_name, zone_type, capacity_bins, org_id)
    VALUES (w1, 'MWH-C', 'Receiving Area C', 'receiving', 10, org) RETURNING id INTO z1c;
  INSERT INTO inventory.warehouse_zones (warehouse_id, zone_code, zone_name, zone_type, capacity_bins, org_id)
    VALUES (w1, 'MWH-D', 'Shipping Zone D', 'shipping', 15, org) RETURNING id INTO z1d;

  -- ===== Secondary Warehouse Zones =====
  INSERT INTO inventory.warehouse_zones (warehouse_id, zone_code, zone_name, zone_type, capacity_bins, org_id)
    VALUES (w2, 'SWH-A', 'Picking Zone A', 'picking', 15, org) RETURNING id INTO z2a;
  INSERT INTO inventory.warehouse_zones (warehouse_id, zone_code, zone_name, zone_type, capacity_bins, org_id)
    VALUES (w2, 'SWH-B', 'Bulk Storage B', 'bulk', 25, org) RETURNING id INTO z2b;
  INSERT INTO inventory.warehouse_zones (warehouse_id, zone_code, zone_name, zone_type, capacity_bins, org_id)
    VALUES (w2, 'SWH-C', 'Receiving Area C', 'receiving', 8, org) RETURNING id INTO z2c;

  -- ===== Create bins and stock for Main Warehouse =====
  -- Picking Zone A: 20 bins, 16 occupied (80% utilization)
  FOR bin_counter IN 1..20 LOOP
    INSERT INTO inventory.warehouse_bins (zone_id, bin_code, bin_type, max_capacity, org_id)
      VALUES (z1a, 'A-' || LPAD(bin_counter::text, 2, '0'), 'shelf', 50, org)
      RETURNING id INTO b;
    IF bin_counter <= 8 THEN
      INSERT INTO inventory.stock_bins (bin_id, product_id, quantity, org_id)
        VALUES (b, p1, 20 + (bin_counter * 3), org);
    ELSIF bin_counter <= 16 THEN
      INSERT INTO inventory.stock_bins (bin_id, product_id, quantity, org_id)
        VALUES (b, p3, 30 + (bin_counter * 2), org);
    END IF;
    -- bins 17-20 are empty
  END LOOP;

  -- Bulk Storage B: 30 bins, 25 occupied (83% utilization), some over-capacity
  FOR bin_counter IN 1..30 LOOP
    INSERT INTO inventory.warehouse_bins (zone_id, bin_code, bin_type, max_capacity, org_id)
      VALUES (z1b, 'B-' || LPAD(bin_counter::text, 2, '0'), 'pallet', 200, org)
      RETURNING id INTO b;
    IF bin_counter <= 10 THEN
      INSERT INTO inventory.stock_bins (bin_id, product_id, quantity, org_id)
        VALUES (b, p2, 150 + (bin_counter * 5), org);
    ELSIF bin_counter <= 20 THEN
      INSERT INTO inventory.stock_bins (bin_id, product_id, quantity, org_id)
        VALUES (b, p4, 100 + (bin_counter * 8), org);
    ELSIF bin_counter <= 25 THEN
      -- Over-capacity bins (quantity > max_capacity of 200)
      INSERT INTO inventory.stock_bins (bin_id, product_id, quantity, org_id)
        VALUES (b, p3, 210 + (bin_counter * 2), org);
    END IF;
    -- bins 26-30 are empty
  END LOOP;

  -- Receiving Area C: 10 bins, 3 occupied (30% utilization — often cleared)
  FOR bin_counter IN 1..10 LOOP
    INSERT INTO inventory.warehouse_bins (zone_id, bin_code, bin_type, max_capacity, org_id)
      VALUES (z1c, 'C-' || LPAD(bin_counter::text, 2, '0'), 'floor', 500, org)
      RETURNING id INTO b;
    IF bin_counter <= 3 THEN
      INSERT INTO inventory.stock_bins (bin_id, product_id, quantity, org_id)
        VALUES (b, p1, 200 + (bin_counter * 50), org);
    END IF;
  END LOOP;

  -- Shipping Zone D: 15 bins, 12 occupied (80% utilization)
  FOR bin_counter IN 1..15 LOOP
    INSERT INTO inventory.warehouse_bins (zone_id, bin_code, bin_type, max_capacity, org_id)
      VALUES (z1d, 'D-' || LPAD(bin_counter::text, 2, '0'), 'shelf', 100, org)
      RETURNING id INTO b;
    IF bin_counter <= 12 THEN
      INSERT INTO inventory.stock_bins (bin_id, product_id, quantity, org_id)
        VALUES (b, CASE WHEN bin_counter % 2 = 0 THEN p1 ELSE p4 END, 40 + (bin_counter * 5), org);
    END IF;
  END LOOP;

  -- ===== Secondary Warehouse bins =====
  -- Picking Zone A: 15 bins, 10 occupied (67% utilization)
  FOR bin_counter IN 1..15 LOOP
    INSERT INTO inventory.warehouse_bins (zone_id, bin_code, bin_type, max_capacity, org_id)
      VALUES (z2a, 'SA-' || LPAD(bin_counter::text, 2, '0'), 'shelf', 50, org)
      RETURNING id INTO b;
    IF bin_counter <= 10 THEN
      INSERT INTO inventory.stock_bins (bin_id, product_id, quantity, org_id)
        VALUES (b, CASE WHEN bin_counter % 3 = 0 THEN p2 WHEN bin_counter % 3 = 1 THEN p1 ELSE p3 END, 15 + (bin_counter * 3), org);
    END IF;
  END LOOP;

  -- Bulk Storage B: 25 bins, 22 occupied (88% utilization)
  FOR bin_counter IN 1..25 LOOP
    INSERT INTO inventory.warehouse_bins (zone_id, bin_code, bin_type, max_capacity, org_id)
      VALUES (z2b, 'SB-' || LPAD(bin_counter::text, 2, '0'), 'pallet', 200, org)
      RETURNING id INTO b;
    IF bin_counter <= 22 THEN
      INSERT INTO inventory.stock_bins (bin_id, product_id, quantity, org_id)
        VALUES (b, CASE WHEN bin_counter % 2 = 0 THEN p4 ELSE p3 END, 80 + (bin_counter * 5), org);
    END IF;
  END LOOP;

  -- Receiving Area C: 8 bins, 2 occupied (25% utilization)
  FOR bin_counter IN 1..8 LOOP
    INSERT INTO inventory.warehouse_bins (zone_id, bin_code, bin_type, max_capacity, org_id)
      VALUES (z2c, 'SC-' || LPAD(bin_counter::text, 2, '0'), 'floor', 500, org)
      RETURNING id INTO b;
    IF bin_counter <= 2 THEN
      INSERT INTO inventory.stock_bins (bin_id, product_id, quantity, org_id)
        VALUES (b, p2, 180 + (bin_counter * 30), org);
    END IF;
  END LOOP;

  RAISE NOTICE 'Warehouse bin seed data inserted: 7 zones, 123 bins, 90 stock allocations';
END $$;

-- ============================================================================
-- Vendor Scorecard reporting view (for procurement analytics)
-- ============================================================================
-- This table stores pre-computed vendor scorecard metrics per period.
-- In production, this would be a materialized view refreshed periodically.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='reporting' AND table_name='v_vendor_scorecards') THEN
    EXECUTE '
      CREATE TABLE reporting.v_vendor_scorecards (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        supplier_id UUID,
        supplier_name TEXT,
        supplier_code TEXT,
        period DATE,
        period_label TEXT,
        vendor_group TEXT DEFAULT ''General'',
        total_pos INTEGER DEFAULT 0,
        total_lines INTEGER DEFAULT 0,
        on_time_deliveries INTEGER DEFAULT 0,
        in_full_deliveries INTEGER DEFAULT 0,
        otif_deliveries INTEGER DEFAULT 0,
        otif_pct NUMERIC(5,2) DEFAULT 0,
        inspection_pass_count INTEGER DEFAULT 0,
        inspection_total_count INTEGER DEFAULT 0,
        quality_pct NUMERIC(5,2) DEFAULT 0,
        expected_spend NUMERIC(14,2) DEFAULT 0,
        actual_spend NUMERIC(14,2) DEFAULT 0,
        price_variance_pct NUMERIC(5,2) DEFAULT 0,
        avg_lead_time_days NUMERIC(6,1) DEFAULT 0,
        target_lead_time_days NUMERIC(6,1) DEFAULT 14,
        delivery_score NUMERIC(5,2) DEFAULT 0,
        composite_score NUMERIC(5,2) DEFAULT 0,
        composite_rank INTEGER DEFAULT 0,
        prior_composite_score NUMERIC(5,2),
        score_trend NUMERIC(5,2),
        org_id UUID
      )';
  END IF;
END $$;

COMMENT ON TABLE reporting.v_vendor_scorecards IS 'Pre-computed vendor performance scorecards with OTIF, quality, price, and delivery metrics';
COMMENT ON COLUMN reporting.v_vendor_scorecards.otif_pct IS 'On-Time In-Full delivery percentage (0-100)';
COMMENT ON COLUMN reporting.v_vendor_scorecards.quality_pct IS 'Inspection pass rate percentage (0-100)';
COMMENT ON COLUMN reporting.v_vendor_scorecards.price_variance_pct IS 'Price variance vs expected spend (negative = under budget)';
COMMENT ON COLUMN reporting.v_vendor_scorecards.delivery_score IS 'Delivery timeliness score (100 = on time, lower = late)';
COMMENT ON COLUMN reporting.v_vendor_scorecards.composite_score IS 'Weighted composite: OTIF 30% + Quality 25% + Price 20% + Delivery 25%';
COMMENT ON COLUMN reporting.v_vendor_scorecards.score_trend IS 'Change in composite score vs prior period (positive = improving)';

-- ============================================================================
-- Seed vendor scorecard data (computed from GRN/PO/inspection data)
-- ============================================================================
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  s1 UUID; s2 UUID; s3 UUID;
BEGIN
  -- Only seed if v_vendor_scorecards is empty
  IF EXISTS (SELECT 1 FROM reporting.v_vendor_scorecards LIMIT 1) THEN
    RETURN;
  END IF;

  -- Get supplier IDs
  SELECT id INTO s1 FROM core.contacts WHERE email = 'supplier1@example.com' LIMIT 1;
  SELECT id INTO s2 FROM core.contacts WHERE email = 'supplier2@example.com' LIMIT 1;
  SELECT id INTO s3 FROM core.contacts WHERE email = 'supplier3@example.com' LIMIT 1;

  IF s1 IS NULL OR s2 IS NULL OR s3 IS NULL THEN
    RAISE NOTICE 'Skipping vendor scorecard seed: supplier contacts not found';
    RETURN;
  END IF;

  -- ===== Q1 2024 (Jan-Mar) =====
  -- Acme Supplies (s1): 2 POs, on-time, 1 quality issue (8 rejected)
  INSERT INTO reporting.v_vendor_scorecards (
    supplier_id, supplier_name, supplier_code, period, period_label, vendor_group,
    total_pos, total_lines, on_time_deliveries, in_full_deliveries, otif_deliveries, otif_pct,
    inspection_pass_count, inspection_total_count, quality_pct,
    expected_spend, actual_spend, price_variance_pct,
    avg_lead_time_days, target_lead_time_days, delivery_score,
    composite_score, composite_rank, prior_composite_score, score_trend, org_id
  ) VALUES (
    s1, 'Acme Supplies', 'SUP-001', '2024-01-01', 'Q1 2024', 'Manufacturing',
    2, 4, 2, 2, 2, 100.00,
    3, 4, 75.00,
    27000.00, 27000.00, 0.00,
    12.5, 14, 100.00,
    73.75, 2, NULL, NULL, org
  );
  -- composite = 100*0.30 + 75*0.25 + 100*0.20 + 100*0.25 = 30 + 18.75 + 20 + 25 = 93.75
  -- Actually let's recalculate: price_score = 100 - ABS(price_variance_pct) = 100-0 = 100
  -- delivery_score = 100 (on time)
  -- composite = 100*0.30 + 75*0.25 + 100*0.20 + 100*0.25 = 93.75
  UPDATE reporting.v_vendor_scorecards SET composite_score = 93.75 WHERE supplier_id = s1 AND period = '2024-01-01';

  -- Global Parts (s2): 1 PO, late, short delivery
  INSERT INTO reporting.v_vendor_scorecards (
    supplier_id, supplier_name, supplier_code, period, period_label, vendor_group,
    total_pos, total_lines, on_time_deliveries, in_full_deliveries, otif_deliveries, otif_pct,
    inspection_pass_count, inspection_total_count, quality_pct,
    expected_spend, actual_spend, price_variance_pct,
    avg_lead_time_days, target_lead_time_days, delivery_score,
    composite_score, composite_rank, prior_composite_score, score_trend, org_id
  ) VALUES (
    s2, 'Global Parts', 'SUP-002', '2024-01-01', 'Q1 2024', 'Components',
    1, 2, 0, 0, 0, 0.00,
    1, 2, 50.00,
    8500.00, 2480.00, -70.82,
    17.0, 14, 78.57,
    33.39, 3, NULL, NULL, org
  );
  -- price_score = 100 - 70.82 = 29.18
  -- delivery_score = max(0, 100 - (17-14)/14*100) = 100 - 21.43 = 78.57
  -- composite = 0*0.30 + 50*0.25 + 29.18*0.20 + 78.57*0.25 = 0 + 12.5 + 5.836 + 19.64 = 37.98
  UPDATE reporting.v_vendor_scorecards SET composite_score = 37.98 WHERE supplier_id = s2 AND period = '2024-01-01';

  -- Premier Materials (s3): no POs in Q1
  -- (not inserted for Q1 since no data)

  -- ===== Q2 2024 (Apr-Jun) =====
  -- Acme Supplies (s1): 1 PO (replacement batch), perfect quality, late delivery
  INSERT INTO reporting.v_vendor_scorecards (
    supplier_id, supplier_name, supplier_code, period, period_label, vendor_group,
    total_pos, total_lines, on_time_deliveries, in_full_deliveries, otif_deliveries, otif_pct,
    inspection_pass_count, inspection_total_count, quality_pct,
    expected_spend, actual_spend, price_variance_pct,
    avg_lead_time_days, target_lead_time_days, delivery_score,
    composite_score, composite_rank, prior_composite_score, score_trend, org_id
  ) VALUES (
    s1, 'Acme Supplies', 'SUP-001', '2024-04-01', 'Q2 2024', 'Manufacturing',
    1, 2, 0, 1, 0, 0.00,
    2, 2, 100.00,
    940.00, 940.00, 0.00,
    110.0, 14, 0.00,
    45.00, 2, 93.75, -48.75, org
  );
  -- This was a late replacement; delivery_score = max(0, 100-(110-14)/14*100) = clamped to 0
  -- composite = 0*0.30 + 100*0.25 + 100*0.20 + 0*0.25 = 0 + 25 + 20 + 0 = 45.00

  -- Global Parts (s2): 1 PO, on time, perfect quality
  INSERT INTO reporting.v_vendor_scorecards (
    supplier_id, supplier_name, supplier_code, period, period_label, vendor_group,
    total_pos, total_lines, on_time_deliveries, in_full_deliveries, otif_deliveries, otif_pct,
    inspection_pass_count, inspection_total_count, quality_pct,
    expected_spend, actual_spend, price_variance_pct,
    avg_lead_time_days, target_lead_time_days, delivery_score,
    composite_score, composite_rank, prior_composite_score, score_trend, org_id
  ) VALUES (
    s2, 'Global Parts', 'SUP-002', '2024-04-01', 'Q2 2024', 'Components',
    1, 2, 1, 1, 1, 100.00,
    2, 2, 100.00,
    9500.00, 8550.00, -10.00,
    14.0, 14, 100.00,
    92.50, 1, 37.98, 54.52, org
  );
  -- price_score = 100 - 10 = 90
  -- composite = 100*0.30 + 100*0.25 + 90*0.20 + 100*0.25 = 30+25+18+25 = 98.00
  UPDATE reporting.v_vendor_scorecards SET composite_score = 98.00, score_trend = 60.02 WHERE supplier_id = s2 AND period = '2024-04-01';

  -- Premier Materials (s3): 2 POs, partial/late, quality issues
  INSERT INTO reporting.v_vendor_scorecards (
    supplier_id, supplier_name, supplier_code, period, period_label, vendor_group,
    total_pos, total_lines, on_time_deliveries, in_full_deliveries, otif_deliveries, otif_pct,
    inspection_pass_count, inspection_total_count, quality_pct,
    expected_spend, actual_spend, price_variance_pct,
    avg_lead_time_days, target_lead_time_days, delivery_score,
    composite_score, composite_rank, prior_composite_score, score_trend, org_id
  ) VALUES (
    s3, 'Premier Materials', 'SUP-003', '2024-04-01', 'Q2 2024', 'Raw Materials',
    2, 6, 0, 0, 0, 0.00,
    2, 6, 33.33,
    36000.00, 20800.00, -42.22,
    22.0, 14, 42.86,
    29.29, 3, NULL, NULL, org
  );
  -- price_score = 100 - 42.22 = 57.78
  -- delivery_score = max(0, 100-(22-14)/14*100) = 100-57.14 = 42.86
  -- composite = 0*0.30 + 33.33*0.25 + 57.78*0.20 + 42.86*0.25 = 0+8.33+11.56+10.72 = 30.61
  UPDATE reporting.v_vendor_scorecards SET composite_score = 30.61 WHERE supplier_id = s3 AND period = '2024-04-01';

  -- Update composite ranks
  UPDATE reporting.v_vendor_scorecards SET composite_rank = 1 WHERE period = '2024-01-01' AND supplier_id = s1;
  UPDATE reporting.v_vendor_scorecards SET composite_rank = 2 WHERE period = '2024-01-01' AND supplier_id = s2;
  UPDATE reporting.v_vendor_scorecards SET composite_rank = 1 WHERE period = '2024-04-01' AND supplier_id = s2;
  UPDATE reporting.v_vendor_scorecards SET composite_rank = 2 WHERE period = '2024-04-01' AND supplier_id = s1;
  UPDATE reporting.v_vendor_scorecards SET composite_rank = 3 WHERE period = '2024-04-01' AND supplier_id = s3;

  RAISE NOTICE 'Vendor scorecard seed data inserted: 5 records for 3 suppliers across 2 periods';
END $$;

-- ============================================================================
-- RFQ (Request for Quote) tables for procurement analytics
-- ============================================================================

-- RFQ header: a request for quotation sent to multiple suppliers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='procurement' AND table_name='rfq_requests') THEN
    EXECUTE '
      CREATE TABLE procurement.rfq_requests (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        rfq_number TEXT NOT NULL,
        title TEXT,
        rfq_date DATE DEFAULT CURRENT_DATE,
        deadline DATE,
        status TEXT DEFAULT ''open'',
        created_by TEXT,
        notes TEXT,
        org_id UUID,
        branch_id UUID
      )';
  END IF;
END $$;

-- RFQ line items: specific items/quantities requested
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='procurement' AND table_name='rfq_lines') THEN
    EXECUTE '
      CREATE TABLE procurement.rfq_lines (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        rfq_id UUID,
        product_id UUID,
        description TEXT,
        quantity NUMERIC(12,2) DEFAULT 0,
        unit TEXT DEFAULT ''each'',
        target_price NUMERIC(12,2),
        org_id UUID
      )';
  END IF;
END $$;

-- RFQ responses: one per supplier per RFQ
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='procurement' AND table_name='rfq_responses') THEN
    EXECUTE '
      CREATE TABLE procurement.rfq_responses (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        rfq_id UUID,
        supplier_id UUID,
        response_date DATE,
        status TEXT DEFAULT ''received'',
        notes TEXT,
        org_id UUID
      )';
  END IF;
END $$;

-- RFQ response line items: quoted prices per item
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='procurement' AND table_name='rfq_response_lines') THEN
    EXECUTE '
      CREATE TABLE procurement.rfq_response_lines (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        response_id UUID,
        rfq_line_id UUID,
        quoted_price NUMERIC(12,2) DEFAULT 0,
        lead_time_days INTEGER DEFAULT 0,
        notes TEXT,
        org_id UUID
      )';
  END IF;
END $$;

-- FK constraints for RFQ tables
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_rfq_line_rfq' AND table_schema = 'procurement'
  ) THEN
    ALTER TABLE procurement.rfq_lines
      ADD CONSTRAINT fk_rfq_line_rfq FOREIGN KEY (rfq_id) REFERENCES procurement.rfq_requests(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_rfq_response_rfq' AND table_schema = 'procurement'
  ) THEN
    ALTER TABLE procurement.rfq_responses
      ADD CONSTRAINT fk_rfq_response_rfq FOREIGN KEY (rfq_id) REFERENCES procurement.rfq_requests(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_rfq_response_supplier' AND table_schema = 'procurement'
  ) THEN
    ALTER TABLE procurement.rfq_responses
      ADD CONSTRAINT fk_rfq_response_supplier FOREIGN KEY (supplier_id) REFERENCES core.contacts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_rfq_resp_line_response' AND table_schema = 'procurement'
  ) THEN
    ALTER TABLE procurement.rfq_response_lines
      ADD CONSTRAINT fk_rfq_resp_line_response FOREIGN KEY (response_id) REFERENCES procurement.rfq_responses(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_rfq_resp_line_rfqline' AND table_schema = 'procurement'
  ) THEN
    ALTER TABLE procurement.rfq_response_lines
      ADD CONSTRAINT fk_rfq_resp_line_rfqline FOREIGN KEY (rfq_line_id) REFERENCES procurement.rfq_lines(id);
  END IF;
END $$;

COMMENT ON TABLE procurement.rfq_requests IS 'Request for Quotation headers sent to suppliers';
COMMENT ON COLUMN procurement.rfq_requests.rfq_number IS 'Unique RFQ reference number | display_column';
COMMENT ON COLUMN procurement.rfq_requests.status IS 'RFQ status: open, closed, cancelled';
COMMENT ON TABLE procurement.rfq_lines IS 'Line items within an RFQ specifying products and quantities';
COMMENT ON TABLE procurement.rfq_responses IS 'Supplier responses to RFQs with quoted pricing';
COMMENT ON COLUMN procurement.rfq_responses.status IS 'Response status: received, declined, expired';
COMMENT ON TABLE procurement.rfq_response_lines IS 'Per-item pricing from supplier RFQ responses';

-- ============================================================================
-- Seed RFQ test data
-- ============================================================================
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  br  UUID := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  s1 UUID; s2 UUID; s3 UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
  rfq1 UUID; rfq2 UUID; rfq3 UUID; rfq4 UUID;
  rl1 UUID; rl2 UUID; rl3 UUID; rl4 UUID; rl5 UUID; rl6 UUID; rl7 UUID; rl8 UUID;
  resp1 UUID; resp2 UUID; resp3 UUID; resp4 UUID; resp5 UUID;
  resp6 UUID; resp7 UUID; resp8 UUID; resp9 UUID;
BEGIN
  -- Only seed if rfq_requests table is empty
  IF EXISTS (SELECT 1 FROM procurement.rfq_requests LIMIT 1) THEN
    RETURN;
  END IF;

  -- Get suppliers
  SELECT id INTO s1 FROM core.contacts WHERE email = 'supplier1@example.com' LIMIT 1;
  SELECT id INTO s2 FROM core.contacts WHERE email = 'supplier2@example.com' LIMIT 1;
  SELECT id INTO s3 FROM core.contacts WHERE email = 'supplier3@example.com' LIMIT 1;

  -- Get products
  SELECT id INTO p1 FROM inventory.products WHERE product_code = 'WIDGET-A' LIMIT 1;
  SELECT id INTO p2 FROM inventory.products WHERE product_code = 'GADGET-B' LIMIT 1;
  SELECT id INTO p3 FROM inventory.products WHERE product_code = 'PART-C' LIMIT 1;
  SELECT id INTO p4 FROM inventory.products WHERE product_code = 'SUPPLY-D' LIMIT 1;

  IF s1 IS NULL OR s2 IS NULL OR s3 IS NULL THEN
    RAISE NOTICE 'Skipping RFQ seed: supplier contacts not found';
    RETURN;
  END IF;

  -- ===== RFQ 1: Q1 2024 - Widgets and Gadgets (3 suppliers invited, all respond) =====
  INSERT INTO procurement.rfq_requests (rfq_number, title, rfq_date, deadline, status, created_by, org_id, branch_id)
    VALUES ('RFQ-2024-001', 'Widgets and Gadgets Q1 Supply', '2024-01-10', '2024-01-25', 'closed', 'Procurement Team', org, br) RETURNING id INTO rfq1;
  INSERT INTO procurement.rfq_lines (rfq_id, product_id, description, quantity, unit, target_price, org_id)
    VALUES (rfq1, p1, 'Widget-A units', 100, 'each', 75.00, org) RETURNING id INTO rl1;
  INSERT INTO procurement.rfq_lines (rfq_id, product_id, description, quantity, unit, target_price, org_id)
    VALUES (rfq1, p2, 'Gadget-B units', 50, 'each', 120.00, org) RETURNING id INTO rl2;

  -- Acme Supplies responds (2 days later, competitive pricing)
  INSERT INTO procurement.rfq_responses (rfq_id, supplier_id, response_date, status, org_id)
    VALUES (rfq1, s1, '2024-01-12', 'received', org) RETURNING id INTO resp1;
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp1, rl1, 78.00, 12, org);
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp1, rl2, 125.00, 14, org);

  -- Global Parts responds (5 days later, slightly cheaper)
  INSERT INTO procurement.rfq_responses (rfq_id, supplier_id, response_date, status, org_id)
    VALUES (rfq1, s2, '2024-01-15', 'received', org) RETURNING id INTO resp2;
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp2, rl1, 72.00, 18, org);
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp2, rl2, 118.00, 20, org);

  -- Premier Materials responds (8 days later, most expensive)
  INSERT INTO procurement.rfq_responses (rfq_id, supplier_id, response_date, status, org_id)
    VALUES (rfq1, s3, '2024-01-18', 'received', org) RETURNING id INTO resp3;
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp3, rl1, 85.00, 10, org);
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp3, rl2, 135.00, 8, org);

  -- ===== RFQ 2: Q1 2024 - Parts and Supplies (3 invited, 2 respond, 1 declines) =====
  INSERT INTO procurement.rfq_requests (rfq_number, title, rfq_date, deadline, status, created_by, org_id, branch_id)
    VALUES ('RFQ-2024-002', 'Parts and Supplies Restock', '2024-02-05', '2024-02-20', 'closed', 'Procurement Team', org, br) RETURNING id INTO rfq2;
  INSERT INTO procurement.rfq_lines (rfq_id, product_id, description, quantity, unit, target_price, org_id)
    VALUES (rfq2, p3, 'Part-C units', 200, 'each', 22.00, org) RETURNING id INTO rl3;
  INSERT INTO procurement.rfq_lines (rfq_id, product_id, description, quantity, unit, target_price, org_id)
    VALUES (rfq2, p4, 'Supply-D units', 500, 'each', 10.00, org) RETURNING id INTO rl4;

  -- Global Parts responds (3 days, good pricing)
  INSERT INTO procurement.rfq_responses (rfq_id, supplier_id, response_date, status, org_id)
    VALUES (rfq2, s2, '2024-02-08', 'received', org) RETURNING id INTO resp4;
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp4, rl3, 24.00, 14, org);
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp4, rl4, 11.50, 14, org);

  -- Premier Materials responds (10 days, premium pricing)
  INSERT INTO procurement.rfq_responses (rfq_id, supplier_id, response_date, status, org_id)
    VALUES (rfq2, s3, '2024-02-15', 'received', org) RETURNING id INTO resp5;
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp5, rl3, 26.00, 8, org);
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp5, rl4, 13.00, 8, org);

  -- Acme Supplies declines
  INSERT INTO procurement.rfq_responses (rfq_id, supplier_id, response_date, status, notes, org_id)
    VALUES (rfq2, s1, '2024-02-12', 'declined', 'Unable to supply these items at this time', org) RETURNING id INTO resp6;

  -- ===== RFQ 3: Q2 2024 - Large Widget Order (3 invited, 2 respond) =====
  INSERT INTO procurement.rfq_requests (rfq_number, title, rfq_date, deadline, status, created_by, org_id, branch_id)
    VALUES ('RFQ-2024-003', 'Widget Bulk Order Q2', '2024-04-01', '2024-04-15', 'closed', 'Procurement Team', org, br) RETURNING id INTO rfq3;
  INSERT INTO procurement.rfq_lines (rfq_id, product_id, description, quantity, unit, target_price, org_id)
    VALUES (rfq3, p1, 'Widget-A bulk', 500, 'each', 70.00, org) RETURNING id INTO rl5;
  INSERT INTO procurement.rfq_lines (rfq_id, product_id, description, quantity, unit, target_price, org_id)
    VALUES (rfq3, p3, 'Part-C bulk', 1000, 'each', 20.00, org) RETURNING id INTO rl6;

  -- Acme Supplies responds (1 day, aggressive pricing for bulk)
  INSERT INTO procurement.rfq_responses (rfq_id, supplier_id, response_date, status, org_id)
    VALUES (rfq3, s1, '2024-04-02', 'received', org) RETURNING id INTO resp7;
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp7, rl5, 68.00, 14, org);
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp7, rl6, 22.00, 14, org);

  -- Global Parts responds (7 days, standard pricing)
  INSERT INTO procurement.rfq_responses (rfq_id, supplier_id, response_date, status, org_id)
    VALUES (rfq3, s2, '2024-04-08', 'received', org) RETURNING id INTO resp8;
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp8, rl5, 74.00, 16, org);
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp8, rl6, 23.50, 18, org);

  -- Premier Materials: no response (expired)

  -- ===== RFQ 4: Q2 2024 - Mixed Items (3 invited, 1 responds) =====
  INSERT INTO procurement.rfq_requests (rfq_number, title, rfq_date, deadline, status, created_by, org_id, branch_id)
    VALUES ('RFQ-2024-004', 'Mixed Items Quarterly', '2024-05-15', '2024-05-30', 'closed', 'Procurement Team', org, br) RETURNING id INTO rfq4;
  INSERT INTO procurement.rfq_lines (rfq_id, product_id, description, quantity, unit, target_price, org_id)
    VALUES (rfq4, p2, 'Gadget-B standard', 80, 'each', 115.00, org) RETURNING id INTO rl7;
  INSERT INTO procurement.rfq_lines (rfq_id, product_id, description, quantity, unit, target_price, org_id)
    VALUES (rfq4, p4, 'Supply-D units', 300, 'each', 10.00, org) RETURNING id INTO rl8;

  -- Only Premier Materials responds (4 days)
  INSERT INTO procurement.rfq_responses (rfq_id, supplier_id, response_date, status, org_id)
    VALUES (rfq4, s3, '2024-05-19', 'received', org) RETURNING id INTO resp9;
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp9, rl7, 128.00, 12, org);
  INSERT INTO procurement.rfq_response_lines (response_id, rfq_line_id, quoted_price, lead_time_days, org_id)
    VALUES (resp9, rl8, 12.50, 10, org);

  RAISE NOTICE 'RFQ seed data inserted: 4 RFQs, 8 lines, 9 responses, 16 response lines';
END $$;


-- ============================================================================
-- Cashbook: Bank reconciliation and statement line tables
-- ============================================================================

-- Statement lines (imported bank statements)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='cashbook' AND table_name='statement_lines') THEN
    EXECUTE '
      CREATE TABLE cashbook.statement_lines (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        bank_account_id UUID,
        statement_date DATE NOT NULL,
        description TEXT,
        amount NUMERIC(12,2) NOT NULL,
        reference TEXT,
        match_status TEXT DEFAULT ''unmatched'',
        matched_transaction_id UUID,
        matched_at TIMESTAMP,
        org_id UUID,
        created_at TIMESTAMP DEFAULT now()
      )';
  END IF;
END $$;

-- Bank reconciliations (reconciliation sessions)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='cashbook' AND table_name='bank_reconciliations') THEN
    EXECUTE '
      CREATE TABLE cashbook.bank_reconciliations (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        bank_account_id UUID,
        reconciliation_date DATE NOT NULL,
        statement_balance NUMERIC(12,2),
        book_balance NUMERIC(12,2),
        difference NUMERIC(12,2) DEFAULT 0,
        status TEXT DEFAULT ''in_progress'',
        completed_at TIMESTAMP,
        org_id UUID,
        created_at TIMESTAMP DEFAULT now()
      )';
  END IF;
END $$;

-- FK constraints
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_statement_lines_bank_account' AND table_schema = 'cashbook'
  ) THEN
    ALTER TABLE cashbook.statement_lines
      ADD CONSTRAINT fk_statement_lines_bank_account FOREIGN KEY (bank_account_id) REFERENCES cashbook.bank_accounts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_reconciliations_bank_account' AND table_schema = 'cashbook'
  ) THEN
    ALTER TABLE cashbook.bank_reconciliations
      ADD CONSTRAINT fk_reconciliations_bank_account FOREIGN KEY (bank_account_id) REFERENCES cashbook.bank_accounts(id);
  END IF;
END $$;

COMMENT ON TABLE cashbook.statement_lines IS 'Imported bank statement lines for reconciliation';
COMMENT ON TABLE cashbook.bank_reconciliations IS 'Bank reconciliation sessions tracking matched/unmatched items';
COMMENT ON COLUMN cashbook.statement_lines.match_status IS 'Reconciliation status: matched, unmatched, partially_matched';
COMMENT ON COLUMN cashbook.statement_lines.matched_transaction_id IS 'fk:cashbook.transactions.id Matched transaction';
COMMENT ON COLUMN cashbook.bank_reconciliations.status IS 'Reconciliation session status: in_progress, completed';

-- ============================================================================
-- Cashbook: Seed sample data for bank accounts, statement lines, reconciliations
-- ============================================================================
DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  br UUID := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  ba1 UUID; ba2 UUID; ba3 UUID;
  t1 UUID; t2 UUID; t3 UUID; t4 UUID; t5 UUID;
BEGIN
  -- Only seed if bank_accounts table is empty
  IF EXISTS (SELECT 1 FROM cashbook.bank_accounts LIMIT 1) THEN
    RAISE NOTICE 'Cashbook bank accounts already seeded, skipping';
    RETURN;
  END IF;

  -- Create bank accounts
  INSERT INTO cashbook.bank_accounts (id, account_name, account_number, bank_name, balance, org_id)
    VALUES (gen_random_uuid(), 'Main Operating Account', '1234567890', 'First National Bank', 285000.00, org) RETURNING id INTO ba1;
  INSERT INTO cashbook.bank_accounts (id, account_name, account_number, bank_name, balance, org_id)
    VALUES (gen_random_uuid(), 'Savings Account', '9876543210', 'Standard Bank', 150000.00, org) RETURNING id INTO ba2;
  INSERT INTO cashbook.bank_accounts (id, account_name, account_number, bank_name, balance, org_id)
    VALUES (gen_random_uuid(), 'Petty Cash Account', '5555666677', 'Nedbank', 12500.00, org) RETURNING id INTO ba3;

  -- Create transactions for Main Operating Account
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba1, '2024-01-15', 'Customer Payment - INV-001', 15000.00, 'receipt', org) RETURNING id INTO t1;
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba1, '2024-01-20', 'Supplier Payment - PO-001', -8500.00, 'payment', org) RETURNING id INTO t2;
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba1, '2024-02-10', 'Customer Payment - INV-002', 22000.00, 'receipt', org) RETURNING id INTO t3;
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba1, '2024-02-15', 'Rent Payment', -12000.00, 'payment', org);
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba1, '2024-03-05', 'Customer Payment - INV-003', 9500.00, 'receipt', org);
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba1, '2024-03-10', 'Insurance Premium', -3500.00, 'payment', org);
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba1, '2024-04-01', 'Salary Payments', -45000.00, 'payment', org);
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba1, '2024-04-15', 'Customer Payment - INV-004', 31000.00, 'receipt', org);

  -- Transactions for Savings Account
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba2, '2024-01-31', 'Interest Earned', 1250.00, 'receipt', org);
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba2, '2024-02-28', 'Interest Earned', 1300.00, 'receipt', org);
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba2, '2024-03-15', 'Transfer to Operating', -25000.00, 'transfer', org);

  -- Transactions for Petty Cash
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba3, '2024-01-10', 'Office Supplies', -450.00, 'payment', org);
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba3, '2024-02-05', 'Courier Fees', -320.00, 'payment', org);
  INSERT INTO cashbook.transactions (bank_account_id, transaction_date, description, amount, transaction_type, org_id)
    VALUES (ba3, '2024-03-01', 'Cash Float Top-up', 5000.00, 'receipt', org);

  -- Statement lines for Main Operating Account (mix of matched and unmatched)
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, matched_transaction_id, matched_at, org_id)
    VALUES (ba1, '2024-01-15', 'DEPOSIT REF INV-001', 15000.00, 'DEP-001', 'matched', t1, '2024-01-16 09:00:00', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, matched_transaction_id, matched_at, org_id)
    VALUES (ba1, '2024-01-20', 'EFT PAYMENT PO-001', -8500.00, 'EFT-001', 'matched', t2, '2024-01-21 10:30:00', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, matched_transaction_id, matched_at, org_id)
    VALUES (ba1, '2024-02-10', 'DEPOSIT REF INV-002', 22000.00, 'DEP-002', 'matched', t3, '2024-02-11 08:45:00', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba1, '2024-02-20', 'UNKNOWN DEPOSIT', 3500.00, 'DEP-003', 'unmatched', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba1, '2024-03-01', 'BANK CHARGES FEB', -285.00, 'FEE-001', 'unmatched', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba1, '2024-03-15', 'DEBIT ORDER - TELKOM', -1200.00, 'DO-001', 'unmatched', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba1, '2024-04-02', 'UNKNOWN CREDIT', 7800.00, 'DEP-004', 'unmatched', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba1, '2024-04-10', 'SERVICE FEE Q1', -950.00, 'FEE-002', 'unmatched', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba1, '2024-05-01', 'BANK CHARGES APR', -310.00, 'FEE-003', 'unmatched', org);

  -- Statement lines for Savings Account
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba2, '2024-01-31', 'INTEREST CREDIT', 1250.00, 'INT-001', 'matched', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba2, '2024-02-28', 'INTEREST CREDIT', 1300.00, 'INT-002', 'matched', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba2, '2024-03-15', 'TRANSFER OUT - OPERATING', -25000.00, 'TRF-001', 'matched', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba2, '2024-04-01', 'MONTHLY ADMIN FEE', -75.00, 'FEE-004', 'unmatched', org);

  -- Statement lines for Petty Cash Account
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba3, '2024-01-10', 'CARD PURCHASE - OFFICE DEPOT', -450.00, 'POS-001', 'matched', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba3, '2024-02-05', 'CARD PURCHASE - POSTNET', -320.00, 'POS-002', 'matched', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba3, '2024-03-01', 'CASH DEPOSIT', 5000.00, 'DEP-005', 'matched', org);
  INSERT INTO cashbook.statement_lines (bank_account_id, statement_date, description, amount, reference, match_status, org_id)
    VALUES (ba3, '2024-03-20', 'UNKNOWN DEBIT', -180.00, 'UNK-001', 'unmatched', org);

  -- Bank reconciliations
  INSERT INTO cashbook.bank_reconciliations (bank_account_id, reconciliation_date, statement_balance, book_balance, difference, status, completed_at, org_id)
    VALUES (ba1, '2024-01-31', 291500.00, 291500.00, 0.00, 'completed', '2024-02-02 14:00:00', org);
  INSERT INTO cashbook.bank_reconciliations (bank_account_id, reconciliation_date, statement_balance, book_balance, difference, status, completed_at, org_id)
    VALUES (ba1, '2024-02-29', 306215.00, 303500.00, 2715.00, 'completed', '2024-03-03 10:00:00', org);
  INSERT INTO cashbook.bank_reconciliations (bank_account_id, reconciliation_date, statement_balance, book_balance, difference, status, org_id)
    VALUES (ba1, '2024-03-31', 312850.00, 305850.00, 7000.00, 'in_progress', org);
  INSERT INTO cashbook.bank_reconciliations (bank_account_id, reconciliation_date, statement_balance, book_balance, difference, status, org_id)
    VALUES (ba2, '2024-03-31', 127475.00, 127550.00, -75.00, 'in_progress', org);
  INSERT INTO cashbook.bank_reconciliations (bank_account_id, reconciliation_date, statement_balance, book_balance, difference, status, org_id)
    VALUES (ba3, '2024-03-31', 16550.00, 16730.00, -180.00, 'in_progress', org);

  RAISE NOTICE 'Cashbook seed data inserted: 3 bank accounts, 15 transactions, 17 statement lines, 5 reconciliations';
END $$;

-- ============================================================================
-- Buying Group seed data for Customer Master Summary report
-- ============================================================================
DO $$
DECLARE
  bg1 UUID; bg2 UUID; bg3 UUID;
  c1 UUID; c2 UUID; c3 UUID; c4 UUID; c5 UUID;
BEGIN
  -- Only seed if buying_groups table is empty
  IF EXISTS (SELECT 1 FROM crm.buying_groups LIMIT 1) THEN
    RAISE NOTICE 'Buying groups already seeded, skipping';
    RETURN;
  END IF;

  -- Create buying groups
  INSERT INTO crm.buying_groups (group_name, discount_rate)
    VALUES ('Gold', 10.00) RETURNING id INTO bg1;
  INSERT INTO crm.buying_groups (group_name, discount_rate)
    VALUES ('Silver', 5.00) RETURNING id INTO bg2;
  INSERT INTO crm.buying_groups (group_name, discount_rate)
    VALUES ('Bronze', 2.50) RETURNING id INTO bg3;

  -- Look up existing customer contacts (seeded by AR Aging block)
  SELECT id INTO c1 FROM core.contacts WHERE first_name = 'Alice' AND last_name = 'Johnson' LIMIT 1;
  SELECT id INTO c2 FROM core.contacts WHERE first_name = 'Bob' AND last_name = 'Smith' LIMIT 1;
  SELECT id INTO c3 FROM core.contacts WHERE first_name = 'Carol' AND last_name = 'Davis' LIMIT 1;
  SELECT id INTO c4 FROM core.contacts WHERE first_name = 'David' AND last_name = 'Wilson' LIMIT 1;
  SELECT id INTO c5 FROM core.contacts WHERE first_name = 'Emma' AND last_name = 'Taylor' LIMIT 1;

  -- Assign customers to buying groups
  IF c1 IS NOT NULL THEN
    INSERT INTO crm.customer_buying_groups (customer_id, buying_group_id) VALUES (c1, bg1);
  END IF;
  IF c2 IS NOT NULL THEN
    INSERT INTO crm.customer_buying_groups (customer_id, buying_group_id) VALUES (c2, bg2);
  END IF;
  IF c3 IS NOT NULL THEN
    INSERT INTO crm.customer_buying_groups (customer_id, buying_group_id) VALUES (c3, bg3);
  END IF;
  IF c4 IS NOT NULL THEN
    INSERT INTO crm.customer_buying_groups (customer_id, buying_group_id) VALUES (c4, bg1);
  END IF;
  -- c5 (Emma Taylor) deliberately left without a group to test 'Ungrouped'

  RAISE NOTICE 'Buying group seed data inserted: 3 groups, 4 customer assignments';
END $$;

-- ============================================================================
-- Sales Pipeline / Opportunity seed data
-- ============================================================================
-- Add assigned_to column if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'crm' AND table_name = 'opportunities' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE crm.opportunities ADD COLUMN assigned_to UUID;
  END IF;
END $$;

DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  c1 UUID; c2 UUID; c3 UUID; c4 UUID; c5 UUID;
  rep1 UUID; rep2 UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM crm.opportunities LIMIT 1) THEN
    RAISE NOTICE 'Opportunities already seeded, skipping';
    RETURN;
  END IF;

  -- Get existing customer contacts
  SELECT id INTO c1 FROM core.contacts WHERE first_name = 'Alice' AND last_name = 'Johnson' LIMIT 1;
  SELECT id INTO c2 FROM core.contacts WHERE first_name = 'Bob' AND last_name = 'Smith' LIMIT 1;
  SELECT id INTO c3 FROM core.contacts WHERE first_name = 'Carol' AND last_name = 'Davis' LIMIT 1;
  SELECT id INTO c4 FROM core.contacts WHERE first_name = 'David' AND last_name = 'Wilson' LIMIT 1;
  SELECT id INTO c5 FROM core.contacts WHERE first_name = 'Emma' AND last_name = 'Taylor' LIMIT 1;

  -- Create sales rep contacts
  SELECT id INTO rep1 FROM core.contacts WHERE email = 'rep1@jrny.co.za' LIMIT 1;
  IF rep1 IS NULL THEN
    INSERT INTO core.contacts (first_name, last_name, email, org_id) VALUES ('John', 'Sales', 'rep1@jrny.co.za', org) RETURNING id INTO rep1;
  END IF;
  SELECT id INTO rep2 FROM core.contacts WHERE email = 'rep2@jrny.co.za' LIMIT 1;
  IF rep2 IS NULL THEN
    INSERT INTO core.contacts (first_name, last_name, email, org_id) VALUES ('Jane', 'Closer', 'rep2@jrny.co.za', org) RETURNING id INTO rep2;
  END IF;

  -- Prospecting stage (10% probability)
  INSERT INTO crm.opportunities (opportunity_name, contact_id, stage, amount, close_date, org_id, created_at, assigned_to) VALUES
    ('New ERP Implementation - Acme Corp', c1, 'prospecting', 250000.00, '2025-06-30', org, '2024-11-01', rep1),
    ('CRM Expansion - Beta Inc', c2, 'prospecting', 80000.00, '2025-07-15', org, '2024-11-15', rep2),
    ('Cloud Migration - Gamma Ltd', c3, 'prospecting', 150000.00, '2025-08-01', org, '2024-12-01', rep1);

  -- Qualification stage (25% probability)
  INSERT INTO crm.opportunities (opportunity_name, contact_id, stage, amount, close_date, org_id, created_at, assigned_to) VALUES
    ('Inventory Module Upgrade', c4, 'qualification', 120000.00, '2025-05-30', org, '2024-10-01', rep2),
    ('Finance Suite Implementation', c1, 'qualification', 350000.00, '2025-06-15', org, '2024-09-15', rep1),
    ('Warehouse Management System', c5, 'qualification', 95000.00, '2025-05-15', org, '2024-10-20', rep2);

  -- Proposal stage (50% probability)
  INSERT INTO crm.opportunities (opportunity_name, contact_id, stage, amount, close_date, org_id, created_at, assigned_to) VALUES
    ('Multi-branch Deployment', c2, 'proposal', 420000.00, '2025-04-30', org, '2024-08-01', rep1),
    ('Procurement Automation', c4, 'proposal', 180000.00, '2025-04-15', org, '2024-08-15', rep2),
    ('Analytics Dashboard Package', c3, 'proposal', 65000.00, '2025-03-30', org, '2024-09-01', rep1);

  -- Negotiation stage (75% probability)
  INSERT INTO crm.opportunities (opportunity_name, contact_id, stage, amount, close_date, org_id, created_at, assigned_to) VALUES
    ('Enterprise License Renewal', c1, 'negotiation', 500000.00, '2025-03-15', org, '2024-06-01', rep1),
    ('Custom Reporting Module', c5, 'negotiation', 95000.00, '2025-03-01', org, '2024-07-01', rep2);

  -- Won (100% - closed won)
  INSERT INTO crm.opportunities (opportunity_name, contact_id, stage, amount, close_date, org_id, created_at, assigned_to) VALUES
    ('Basic ERP Package', c3, 'won', 75000.00, '2024-12-15', org, '2024-04-01', rep1),
    ('Support Contract Renewal', c2, 'won', 45000.00, '2024-11-30', org, '2024-08-01', rep2),
    ('Training Program', c4, 'won', 28000.00, '2024-10-20', org, '2024-06-15', rep1),
    ('Data Migration Service', c1, 'won', 120000.00, '2024-09-30', org, '2024-03-01', rep2);

  -- Lost (0% - closed lost)
  INSERT INTO crm.opportunities (opportunity_name, contact_id, stage, amount, close_date, org_id, created_at, assigned_to) VALUES
    ('Legacy System Replacement', c5, 'lost', 200000.00, '2024-11-01', org, '2024-05-01', rep1),
    ('International Rollout', c2, 'lost', 350000.00, '2024-12-01', org, '2024-04-15', rep2),
    ('Mobile App Development', c4, 'lost', 90000.00, '2024-10-15', org, '2024-06-01', rep1);

  RAISE NOTICE 'Opportunities seeded: 18 opportunities across 6 stages, 2 sales reps';
END $$;

-- ============================================================================
-- Customer Activity Log seed data
-- ============================================================================
-- Add performed_by column if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'crm' AND table_name = 'activities' AND column_name = 'performed_by'
  ) THEN
    ALTER TABLE crm.activities ADD COLUMN performed_by UUID;
  END IF;
END $$;

DO $$
DECLARE
  org UUID := '11111111-2222-3333-4444-555555555555';
  c1 UUID; c2 UUID; c3 UUID; c4 UUID; c5 UUID;
  rep1 UUID; rep2 UUID;
  opp1 UUID; opp2 UUID; opp3 UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM crm.activities LIMIT 1) THEN
    RAISE NOTICE 'Activities already seeded, skipping';
    RETURN;
  END IF;

  -- Get existing customer contacts
  SELECT id INTO c1 FROM core.contacts WHERE first_name = 'Alice' AND last_name = 'Johnson' LIMIT 1;
  SELECT id INTO c2 FROM core.contacts WHERE first_name = 'Bob' AND last_name = 'Smith' LIMIT 1;
  SELECT id INTO c3 FROM core.contacts WHERE first_name = 'Carol' AND last_name = 'Davis' LIMIT 1;
  SELECT id INTO c4 FROM core.contacts WHERE first_name = 'David' AND last_name = 'Wilson' LIMIT 1;
  SELECT id INTO c5 FROM core.contacts WHERE first_name = 'Emma' AND last_name = 'Taylor' LIMIT 1;

  -- Get sales reps
  SELECT id INTO rep1 FROM core.contacts WHERE email = 'rep1@jrny.co.za' LIMIT 1;
  SELECT id INTO rep2 FROM core.contacts WHERE email = 'rep2@jrny.co.za' LIMIT 1;

  -- Get some opportunities for linking
  SELECT id INTO opp1 FROM crm.opportunities WHERE opportunity_name = 'Enterprise License Renewal' LIMIT 1;
  SELECT id INTO opp2 FROM crm.opportunities WHERE opportunity_name = 'Multi-branch Deployment' LIMIT 1;
  SELECT id INTO opp3 FROM crm.opportunities WHERE opportunity_name = 'Inventory Module Upgrade' LIMIT 1;

  -- Recent activities (within last 30 days) - actively managed customers
  INSERT INTO crm.activities (activity_type, subject, contact_id, opportunity_id, notes, activity_date, org_id, performed_by) VALUES
    ('call', 'Follow-up on license renewal pricing', c1, opp1, 'Discussed volume discount options. Client wants proposal by EOW.', '2025-05-20 10:30:00', org, rep1),
    ('email', 'Sent updated proposal document', c1, opp1, 'Attached revised pricing with 3-year commitment discount.', '2025-05-22 14:15:00', org, rep1),
    ('meeting', 'Quarterly business review', c2, opp2, 'Reviewed deployment progress. 3 branches live, 2 remaining.', '2025-05-18 09:00:00', org, rep1),
    ('call', 'Check on implementation timeline', c2, opp2, 'Client confirmed go-live for remaining branches by end of June.', '2025-05-23 11:00:00', org, rep1),
    ('email', 'Technical requirements document', c4, opp3, 'Sent updated requirements based on last meeting notes.', '2025-05-19 16:45:00', org, rep2),
    ('meeting', 'Demo of inventory module', c4, opp3, 'Showed new features. Client impressed with barcode scanning.', '2025-05-21 14:00:00', org, rep2),
    ('call', 'Pricing clarification', c4, opp3, 'Answered questions about per-user vs per-warehouse pricing.', '2025-05-24 09:30:00', org, rep2),
    ('email', 'Meeting notes and next steps', c3, NULL, 'Sent summary of discovery call. Scheduled follow-up for next week.', '2025-05-17 12:00:00', org, rep1),
    ('call', 'Discovery call - new requirements', c3, NULL, 'Identified need for custom reporting. Will prepare demo.', '2025-05-15 10:00:00', org, rep1);

  -- Activities 30-60 days ago
  INSERT INTO crm.activities (activity_type, subject, contact_id, opportunity_id, notes, activity_date, org_id, performed_by) VALUES
    ('meeting', 'Initial scoping meeting', c1, opp1, 'Discussed renewal requirements and new module needs.', '2025-04-15 10:00:00', org, rep1),
    ('email', 'Follow-up with pricing sheet', c1, opp1, 'Sent standard pricing and license comparison.', '2025-04-16 09:00:00', org, rep1),
    ('call', 'Budget approval status', c2, opp2, 'Budget approved. Procurement to issue PO next week.', '2025-04-20 11:30:00', org, rep1),
    ('meeting', 'Technical deep dive', c4, opp3, 'Walked through integration requirements with IT team.', '2025-04-10 14:00:00', org, rep2),
    ('email', 'Integration specifications', c4, opp3, 'Sent API documentation and sample code.', '2025-04-12 08:30:00', org, rep2),
    ('call', 'Check-in on evaluation', c3, NULL, 'Client still evaluating. No blockers identified.', '2025-04-08 15:00:00', org, rep1);

  -- Activities 60-90 days ago
  INSERT INTO crm.activities (activity_type, subject, contact_id, opportunity_id, notes, activity_date, org_id, performed_by) VALUES
    ('email', 'Introduction and capabilities overview', c2, NULL, 'Sent company overview and case studies.', '2025-03-01 10:00:00', org, rep1),
    ('meeting', 'First meeting - needs assessment', c2, opp2, 'Identified multi-branch deployment as priority.', '2025-03-10 09:00:00', org, rep1),
    ('call', 'Introductory call', c4, NULL, 'Discussed current pain points with inventory management.', '2025-03-05 14:30:00', org, rep2),
    ('email', 'Product literature', c4, NULL, 'Sent brochure and ROI calculator.', '2025-03-06 09:15:00', org, rep2);

  -- Dormant customer (Emma - no activity in 45+ days)
  INSERT INTO crm.activities (activity_type, subject, contact_id, opportunity_id, notes, activity_date, org_id, performed_by) VALUES
    ('call', 'Initial outreach', c5, NULL, 'Left voicemail. Will try again next week.', '2025-03-20 10:00:00', org, rep2),
    ('email', 'Introduction email', c5, NULL, 'Sent introductory email with product overview.', '2025-03-21 11:00:00', org, rep2),
    ('call', 'Second attempt', c5, NULL, 'Spoke briefly. Client busy, asked to call back in April.', '2025-04-02 14:00:00', org, rep2);

  -- Older historical activities (90+ days)
  INSERT INTO crm.activities (activity_type, subject, contact_id, opportunity_id, notes, activity_date, org_id, performed_by) VALUES
    ('meeting', 'Annual review meeting', c1, NULL, 'Discussed renewal and expansion plans for 2025.', '2025-02-10 10:00:00', org, rep1),
    ('email', 'Year-end summary report', c1, NULL, 'Sent usage statistics and recommendations.', '2025-01-15 09:00:00', org, rep1),
    ('call', 'Holiday check-in', c3, NULL, 'Quick call to maintain relationship.', '2025-02-01 11:30:00', org, rep1),
    ('meeting', 'Product roadmap preview', c2, NULL, 'Shared upcoming features relevant to their needs.', '2025-02-20 14:00:00', org, rep1);

  RAISE NOTICE 'Activities seeded: 27 activities across 5 customers, 2 reps, 3 types';
END $$;
