-- Additional stock movement test data for Stock Movement History report
-- Adds adjustments, transfers, and receipts with reference_type/reference_id

INSERT INTO inventory.stock_movements (product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, movement_date, org_id, branch_id)
VALUES
  -- Receipts with PO references
  ('fea0bc3b-4fa8-412f-9e2b-4146d155e7ff', 'a0000001-0000-0000-0000-000000000001', 'receipt', 30, 'purchase_order', 'c0000001-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '45 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('1583c46a-36d7-436d-8c1e-8614fa0ef366', 'a0000001-0000-0000-0000-000000000001', 'receipt', 100, 'purchase_order', 'c0000002-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '75 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'receipt', 10, 'purchase_order', 'c0000003-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '120 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000002-0000-0000-0000-000000000002', 'receipt', 75, 'purchase_order', 'c0000004-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '3 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('b0000002-0000-0000-0000-000000000002', 'a0000002-0000-0000-0000-000000000002', 'receipt', 150, 'purchase_order', 'c0000005-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '55 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),

  -- Issues with sales_order references
  ('fea0bc3b-4fa8-412f-9e2b-4146d155e7ff', 'a0000001-0000-0000-0000-000000000001', 'issue', -5, 'sales_order', 'd0000001-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '30 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('1583c46a-36d7-436d-8c1e-8614fa0ef366', 'a0000001-0000-0000-0000-000000000001', 'issue', -15, 'sales_order', 'd0000002-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '20 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('b0000002-0000-0000-0000-000000000002', 'a0000002-0000-0000-0000-000000000002', 'issue', -20, 'sales_order', 'd0000003-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '10 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'issue', -2, 'sales_order', 'd0000004-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '50 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),

  -- Adjustments (cycle count corrections)
  ('ee369915-353d-4f5f-b359-56816fbf2814', 'a0000001-0000-0000-0000-000000000001', 'adjustment', 10, 'cycle_count', 'e0000001-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '25 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('b0000003-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001', 'adjustment', -5, 'cycle_count', 'e0000002-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '35 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('b0000004-0000-0000-0000-000000000004', 'a0000003-0000-0000-0000-000000000003', 'adjustment', -3, 'cycle_count', 'e0000003-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '15 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),

  -- Transfers between warehouses
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000001-0000-0000-0000-000000000001', 'transfer', -10, 'transfer', 'f0000001-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '8 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000003-0000-0000-0000-000000000003', 'transfer', 10, 'transfer', 'f0000001-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '8 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('b0000004-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001', 'transfer', -5, 'transfer', 'f0000002-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '12 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('b0000004-0000-0000-0000-000000000004', 'a0000003-0000-0000-0000-000000000003', 'transfer', 5, 'transfer', 'f0000002-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '12 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),

  -- More recent activity
  ('b0000002-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 'issue', -30, 'sales_order', 'd0000005-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '2 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('fea0bc3b-4fa8-412f-9e2b-4146d155e7ff', 'a0000002-0000-0000-0000-000000000002', 'receipt', 45, 'purchase_order', 'c0000006-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '20 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
ON CONFLICT DO NOTHING;
