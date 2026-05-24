-- Seed inventory aging test data for the Inventory Aging per Warehouse report
-- This populates warehouses, stock_levels, and stock_movements with realistic data

-- Create 3 warehouses
INSERT INTO inventory.warehouses (id, warehouse_code, warehouse_name, location, org_id, branch_id)
VALUES
  ('a0000001-0000-0000-0000-000000000001', 'WH-JHB', 'Johannesburg Main', 'Johannesburg', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('a0000002-0000-0000-0000-000000000002', 'WH-CPT', 'Cape Town Depot', 'Cape Town', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('a0000003-0000-0000-0000-000000000003', 'WH-DBN', 'Durban Warehouse', 'Durban', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
ON CONFLICT (id) DO NOTHING;

-- Add more products for variety
INSERT INTO inventory.products (id, product_code, product_name, category, unit_cost, org_id)
VALUES
  ('b0000001-0000-0000-0000-000000000001', 'MOTOR-E', 'Motor Echo', 'Machinery', 450.00, '11111111-2222-3333-4444-555555555555'),
  ('b0000002-0000-0000-0000-000000000002', 'CABLE-F', 'Cable Foxtrot', 'Components', 18.50, '11111111-2222-3333-4444-555555555555'),
  ('b0000003-0000-0000-0000-000000000003', 'FILTER-G', 'Filter Golf', 'Consumables', 8.75, '11111111-2222-3333-4444-555555555555'),
  ('b0000004-0000-0000-0000-000000000004', 'VALVE-H', 'Valve Hotel', 'Components', 95.00, '11111111-2222-3333-4444-555555555555')
ON CONFLICT (id) DO NOTHING;

-- JHB warehouse: mix of all aging buckets
INSERT INTO inventory.stock_levels (product_id, warehouse_id, quantity, reorder_point, unit_cost, org_id, last_received_date)
VALUES
  -- 0-30 Days bucket (recent)
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000001-0000-0000-0000-000000000001', 50, 20, 80.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '10 days'),
  ('b0000002-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 200, 50, 18.50, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '5 days'),
  -- 31-60 Days bucket
  ('fea0bc3b-4fa8-412f-9e2b-4146d155e7ff', 'a0000001-0000-0000-0000-000000000001', 30, 10, 130.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '45 days'),
  -- 61-90 Days bucket
  ('1583c46a-36d7-436d-8c1e-8614fa0ef366', 'a0000001-0000-0000-0000-000000000001', 100, 30, 25.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '75 days'),
  -- 91-180 Days bucket
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 8, 5, 450.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '120 days'),
  ('b0000004-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001', 40, 15, 95.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '150 days'),
  -- 180+ Days bucket (obsolescence risk)
  ('ee369915-353d-4f5f-b359-56816fbf2814', 'a0000001-0000-0000-0000-000000000001', 500, 100, 12.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '200 days'),
  ('b0000003-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001', 300, 50, 8.75, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '250 days')
ON CONFLICT ON CONSTRAINT uq_stock_product_warehouse DO NOTHING;

-- CPT warehouse: mostly fresh stock
INSERT INTO inventory.stock_levels (product_id, warehouse_id, quantity, reorder_point, unit_cost, org_id, last_received_date)
VALUES
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000002-0000-0000-0000-000000000002', 75, 25, 80.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '3 days'),
  ('fea0bc3b-4fa8-412f-9e2b-4146d155e7ff', 'a0000002-0000-0000-0000-000000000002', 45, 15, 130.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '20 days'),
  ('b0000002-0000-0000-0000-000000000002', 'a0000002-0000-0000-0000-000000000002', 150, 40, 18.50, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '55 days'),
  ('1583c46a-36d7-436d-8c1e-8614fa0ef366', 'a0000002-0000-0000-0000-000000000002', 60, 20, 25.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '85 days'),
  ('b0000001-0000-0000-0000-000000000001', 'a0000002-0000-0000-0000-000000000002', 3, 2, 450.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '160 days')
ON CONFLICT ON CONSTRAINT uq_stock_product_warehouse DO NOTHING;

-- DBN warehouse: significant old stock (obsolescence risk)
INSERT INTO inventory.stock_levels (product_id, warehouse_id, quantity, reorder_point, unit_cost, org_id, last_received_date)
VALUES
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000003-0000-0000-0000-000000000003', 20, 15, 80.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '40 days'),
  ('b0000004-0000-0000-0000-000000000004', 'a0000003-0000-0000-0000-000000000003', 25, 10, 95.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '100 days'),
  ('ee369915-353d-4f5f-b359-56816fbf2814', 'a0000003-0000-0000-0000-000000000003', 800, 200, 12.00, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '220 days'),
  ('b0000003-0000-0000-0000-000000000003', 'a0000003-0000-0000-0000-000000000003', 150, 40, 8.75, '11111111-2222-3333-4444-555555555555', CURRENT_DATE - INTERVAL '190 days')
ON CONFLICT ON CONSTRAINT uq_stock_product_warehouse DO NOTHING;

-- Seed stock movements for months_of_supply calculation
INSERT INTO inventory.stock_movements (product_id, warehouse_id, movement_type, quantity, movement_date, org_id, branch_id)
VALUES
  -- Issues for JHB Widget Alpha (decent usage)
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000001-0000-0000-0000-000000000001', 'issue', -5, CURRENT_DATE - INTERVAL '15 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000001-0000-0000-0000-000000000001', 'issue', -8, CURRENT_DATE - INTERVAL '30 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000001-0000-0000-0000-000000000001', 'issue', -3, CURRENT_DATE - INTERVAL '60 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  -- Issues for JHB Supply Delta (slow-moving)
  ('ee369915-353d-4f5f-b359-56816fbf2814', 'a0000001-0000-0000-0000-000000000001', 'issue', -2, CURRENT_DATE - INTERVAL '40 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  -- Issues for CPT Widget Alpha (high usage)
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000002-0000-0000-0000-000000000002', 'issue', -10, CURRENT_DATE - INTERVAL '7 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000002-0000-0000-0000-000000000002', 'issue', -12, CURRENT_DATE - INTERVAL '45 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  -- Receipts (different type)
  ('6f0ae0db-846f-486b-b043-f2dc135848d5', 'a0000001-0000-0000-0000-000000000001', 'receipt', 20, CURRENT_DATE - INTERVAL '10 days', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
