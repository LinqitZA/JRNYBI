#!/usr/bin/env python3
"""Create Slow-Moving and Dead Stock report via JRNYBI API.

Creates:
  - Query 1: Product-level slow/dead stock detail with holding cost
  - Query 2: Summary KPIs (total dead stock value, % of total inventory)
  - Query 3: Dead stock value by category and warehouse
  - Visualizations: Detail table, KPI counters, bar chart
  - Dashboard: "Slow-Moving and Dead Stock" tagged report:inventory
"""
import json
import sys
import urllib.request
import urllib.error

API_KEY = "adminTestKey123456789012345678901234"
BASE_URL = "http://localhost:5001"
DS_ID = 1


def api_call(method, path, data=None):
    url = f"{BASE_URL}{path}"
    headers = {
        "Authorization": f"Key {API_KEY}",
        "Content-Type": "application/json",
    }
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        sys.stderr.write(f"HTTP {e.code} on {method} {path}: {err_body}\n")
        raise


def main():
    # Check if already exists
    result = api_call("GET", "/api/queries?q=Slow-Moving+Dead+Stock&page_size=100")
    existing = [q for q in result.get("results", []) if "Slow-Moving" in q["name"] or "Dead Stock" in q["name"]]
    if existing:
        sys.stderr.write(f"SKIP: {len(existing)} Slow-Moving/Dead Stock queries already exist\n")
        return

    # -------------------------------------------------------------------------
    # Query 1: Slow/Dead Stock Detail
    # -------------------------------------------------------------------------
    q1_sql = """WITH last_outbound AS (
  SELECT
    sm.product_id,
    sm.warehouse_id,
    MAX(sm.movement_date) AS last_movement_date
  FROM inventory.stock_movements sm
  WHERE sm.movement_type IN ('issue', 'transfer')
    AND sm.quantity < 0
  GROUP BY sm.product_id, sm.warehouse_id
),
stock_analysis AS (
  SELECT
    p.product_code,
    p.product_name,
    p.category AS product_category,
    w.warehouse_name AS warehouse,
    sl.quantity AS quantity_on_hand,
    COALESCE(sl.unit_cost, p.unit_cost, 0) AS unit_cost,
    (sl.quantity * COALESCE(sl.unit_cost, p.unit_cost, 0))::NUMERIC(12,2) AS holding_cost,
    lo.last_movement_date::DATE AS last_outbound_date,
    COALESCE(CURRENT_DATE - lo.last_movement_date::DATE, 9999) AS days_since_last_movement,
    CASE
      WHEN lo.last_movement_date IS NULL THEN 'Dead (Never Sold)'
      WHEN CURRENT_DATE - lo.last_movement_date::DATE > 180 THEN 'Dead (180+ Days)'
      WHEN CURRENT_DATE - lo.last_movement_date::DATE > 90 THEN 'Very Slow (90-180 Days)'
      WHEN CURRENT_DATE - lo.last_movement_date::DATE > 60 THEN 'Slow (60-90 Days)'
      ELSE 'Active'
    END AS movement_category,
    sl.org_id
  FROM inventory.stock_levels sl
  JOIN inventory.products p ON p.id = sl.product_id
  JOIN inventory.warehouses w ON w.id = sl.warehouse_id
  LEFT JOIN last_outbound lo ON lo.product_id = sl.product_id AND lo.warehouse_id = sl.warehouse_id
  WHERE sl.quantity > 0
)
SELECT *
FROM stock_analysis
WHERE movement_category != 'Active'
  AND ('{{ warehouse }}' = '' OR warehouse = '{{ warehouse }}')
ORDER BY
  CASE movement_category
    WHEN 'Dead (Never Sold)' THEN 1
    WHEN 'Dead (180+ Days)' THEN 2
    WHEN 'Very Slow (90-180 Days)' THEN 3
    WHEN 'Slow (60-90 Days)' THEN 4
  END,
  holding_cost DESC"""

    q1 = api_call("POST", "/api/queries", {
        "name": "Slow-Moving and Dead Stock - Detail",
        "description": "Identifies products with no outbound movements in 60+ days. Shows holding cost, days since last movement, and movement category for clearance/write-off decisions.",
        "data_source_id": DS_ID,
        "query": q1_sql,
        "options": {
            "parameters": [
                {"name": "warehouse", "title": "Warehouse", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q1_id = q1["id"]
    sys.stderr.write(f"Query 1 (Detail) created: id={q1_id}\n")

    # -------------------------------------------------------------------------
    # Query 2: Summary KPIs
    # -------------------------------------------------------------------------
    q2_sql = """WITH last_outbound AS (
  SELECT
    sm.product_id,
    sm.warehouse_id,
    MAX(sm.movement_date) AS last_movement_date
  FROM inventory.stock_movements sm
  WHERE sm.movement_type IN ('issue', 'transfer')
    AND sm.quantity < 0
  GROUP BY sm.product_id, sm.warehouse_id
),
stock_analysis AS (
  SELECT
    sl.quantity AS quantity_on_hand,
    (sl.quantity * COALESCE(sl.unit_cost, p.unit_cost, 0))::NUMERIC(12,2) AS holding_cost,
    CASE
      WHEN lo.last_movement_date IS NULL THEN 'Dead'
      WHEN CURRENT_DATE - lo.last_movement_date::DATE > 180 THEN 'Dead'
      WHEN CURRENT_DATE - lo.last_movement_date::DATE > 90 THEN 'Very Slow'
      WHEN CURRENT_DATE - lo.last_movement_date::DATE > 60 THEN 'Slow'
      ELSE 'Active'
    END AS movement_category
  FROM inventory.stock_levels sl
  JOIN inventory.products p ON p.id = sl.product_id
  LEFT JOIN last_outbound lo ON lo.product_id = sl.product_id AND lo.warehouse_id = sl.warehouse_id
  WHERE sl.quantity > 0
)
SELECT
  SUM(CASE WHEN movement_category IN ('Dead', 'Very Slow', 'Slow') THEN holding_cost ELSE 0 END) AS slow_dead_value,
  SUM(CASE WHEN movement_category = 'Dead' THEN holding_cost ELSE 0 END) AS dead_stock_value,
  SUM(holding_cost) AS total_inventory_value,
  ROUND(100.0 * SUM(CASE WHEN movement_category IN ('Dead', 'Very Slow', 'Slow') THEN holding_cost ELSE 0 END)
    / NULLIF(SUM(holding_cost), 0), 1) AS pct_slow_dead,
  COUNT(CASE WHEN movement_category IN ('Dead', 'Very Slow', 'Slow') THEN 1 END) AS slow_dead_items,
  COUNT(*) AS total_items
FROM stock_analysis"""

    q2 = api_call("POST", "/api/queries", {
        "name": "Slow-Moving and Dead Stock - KPIs",
        "description": "Summary KPIs: total slow/dead stock value, percentage of total inventory, and item counts.",
        "data_source_id": DS_ID,
        "query": q2_sql,
        "options": {"parameters": []},
        "tags": ["inventory", "jrny-report"],
    })
    q2_id = q2["id"]
    sys.stderr.write(f"Query 2 (KPIs) created: id={q2_id}\n")

    # -------------------------------------------------------------------------
    # Query 3: Dead stock value by category and warehouse (for bar chart)
    # -------------------------------------------------------------------------
    q3_sql = """WITH last_outbound AS (
  SELECT
    sm.product_id,
    sm.warehouse_id,
    MAX(sm.movement_date) AS last_movement_date
  FROM inventory.stock_movements sm
  WHERE sm.movement_type IN ('issue', 'transfer')
    AND sm.quantity < 0
  GROUP BY sm.product_id, sm.warehouse_id
)
SELECT
  w.warehouse_name AS warehouse,
  CASE
    WHEN lo.last_movement_date IS NULL THEN 'Dead (Never Sold)'
    WHEN CURRENT_DATE - lo.last_movement_date::DATE > 180 THEN 'Dead (180+ Days)'
    WHEN CURRENT_DATE - lo.last_movement_date::DATE > 90 THEN 'Very Slow (90-180 Days)'
    WHEN CURRENT_DATE - lo.last_movement_date::DATE > 60 THEN 'Slow (60-90 Days)'
    ELSE 'Active'
  END AS movement_category,
  COUNT(*) AS item_count,
  SUM(sl.quantity * COALESCE(sl.unit_cost, p.unit_cost, 0))::NUMERIC(12,2) AS total_value
FROM inventory.stock_levels sl
JOIN inventory.products p ON p.id = sl.product_id
JOIN inventory.warehouses w ON w.id = sl.warehouse_id
LEFT JOIN last_outbound lo ON lo.product_id = sl.product_id AND lo.warehouse_id = sl.warehouse_id
WHERE sl.quantity > 0
  AND (lo.last_movement_date IS NULL OR CURRENT_DATE - lo.last_movement_date::DATE > 60)
  AND ('{{ warehouse }}' = '' OR w.warehouse_name = '{{ warehouse }}')
GROUP BY w.warehouse_name,
  CASE
    WHEN lo.last_movement_date IS NULL THEN 'Dead (Never Sold)'
    WHEN CURRENT_DATE - lo.last_movement_date::DATE > 180 THEN 'Dead (180+ Days)'
    WHEN CURRENT_DATE - lo.last_movement_date::DATE > 90 THEN 'Very Slow (90-180 Days)'
    WHEN CURRENT_DATE - lo.last_movement_date::DATE > 60 THEN 'Slow (60-90 Days)'
    ELSE 'Active'
  END
ORDER BY warehouse,
  CASE movement_category
    WHEN 'Dead (Never Sold)' THEN 1
    WHEN 'Dead (180+ Days)' THEN 2
    WHEN 'Very Slow (90-180 Days)' THEN 3
    WHEN 'Slow (60-90 Days)' THEN 4
  END"""

    q3 = api_call("POST", "/api/queries", {
        "name": "Slow-Moving and Dead Stock - By Warehouse",
        "description": "Dead and slow-moving stock value broken down by warehouse and movement category for clearance planning.",
        "data_source_id": DS_ID,
        "query": q3_sql,
        "options": {
            "parameters": [
                {"name": "warehouse", "title": "Warehouse", "type": "text", "value": ""},
            ]
        },
        "tags": ["inventory", "jrny-report"],
    })
    q3_id = q3["id"]
    sys.stderr.write(f"Query 3 (By Warehouse) created: id={q3_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 1: Detail Table
    # -------------------------------------------------------------------------
    v1 = api_call("POST", "/api/visualizations", {
        "query_id": q1_id,
        "name": "Slow/Dead Stock Detail",
        "type": "TABLE",
        "options": {
            "itemsPerPage": 50,
            "columns": [
                {"name": "product_code", "title": "Code", "visible": True},
                {"name": "product_name", "title": "Product", "visible": True},
                {"name": "product_category", "title": "Category", "visible": True},
                {"name": "warehouse", "title": "Warehouse", "visible": True},
                {"name": "quantity_on_hand", "title": "Qty", "visible": True, "displayAs": "number", "numberFormat": "0,0", "alignContent": "right"},
                {"name": "unit_cost", "title": "Unit Cost", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "holding_cost", "title": "Holding Cost", "visible": True, "displayAs": "number", "numberFormat": "0,0.00", "alignContent": "right"},
                {"name": "last_outbound_date", "title": "Last Outbound", "visible": True},
                {"name": "days_since_last_movement", "title": "Days Inactive", "visible": True, "alignContent": "right"},
                {"name": "movement_category", "title": "Category", "visible": True},
            ],
        },
    })
    v1_id = v1["id"]
    sys.stderr.write(f"Vis 1 (Detail Table) created: id={v1_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 2: KPI — Total Dead Stock Value
    # -------------------------------------------------------------------------
    v2 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "Total Dead Stock Value",
        "type": "COUNTER",
        "options": {
            "counterColName": "dead_stock_value",
            "counterLabel": "Dead Stock Value (180+ Days / Never Sold)",
            "targetColName": "total_inventory_value",
            "targetRowNumber": 1,
            "stringDecimal": 2,
            "stringDecChar": ".",
            "stringThouSep": ",",
            "formatTargetValue": True,
        },
    })
    v2_id = v2["id"]
    sys.stderr.write(f"Vis 2 (Dead Stock KPI) created: id={v2_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 3: KPI — % of Total Inventory at Risk
    # -------------------------------------------------------------------------
    v3 = api_call("POST", "/api/visualizations", {
        "query_id": q2_id,
        "name": "% Inventory at Risk",
        "type": "COUNTER",
        "options": {
            "counterColName": "pct_slow_dead",
            "counterLabel": "% of Inventory Value (Slow + Dead)",
            "targetColName": "slow_dead_items",
            "targetRowNumber": 1,
            "stringDecimal": 1,
            "stringDecChar": ".",
            "stringThouSep": ",",
            "formatTargetValue": True,
        },
    })
    v3_id = v3["id"]
    sys.stderr.write(f"Vis 3 (% Risk KPI) created: id={v3_id}\n")

    # -------------------------------------------------------------------------
    # Visualization 4: Bar chart — Dead stock by category/warehouse
    # -------------------------------------------------------------------------
    v4 = api_call("POST", "/api/visualizations", {
        "query_id": q3_id,
        "name": "Dead Stock by Warehouse",
        "type": "CHART",
        "options": {
            "globalSeriesType": "column",
            "columnMapping": {
                "warehouse": "x",
                "total_value": "y",
                "movement_category": "series",
            },
            "seriesOptions": {
                "Slow (60-90 Days)": {"type": "column", "yAxis": 0, "color": "#eab308"},
                "Very Slow (90-180 Days)": {"type": "column", "yAxis": 0, "color": "#f97316"},
                "Dead (180+ Days)": {"type": "column", "yAxis": 0, "color": "#dc2626"},
                "Dead (Never Sold)": {"type": "column", "yAxis": 0, "color": "#7f1d1d"},
            },
            "series": {"stacking": "stack"},
            "sortX": True,
            "legend": {"enabled": True},
            "xAxis": {"type": "category", "title": {"text": "Warehouse"}},
            "yAxis": [{"type": "linear", "title": {"text": "Holding Cost Value"}}],
            "numberFormat": "0,0.00",
        },
    })
    v4_id = v4["id"]
    sys.stderr.write(f"Vis 4 (Bar Chart) created: id={v4_id}\n")

    # -------------------------------------------------------------------------
    # Create Dashboard
    # -------------------------------------------------------------------------
    dash = api_call("POST", "/api/dashboards", {"name": "Slow-Moving and Dead Stock"})
    dash_id = dash["id"]
    dash_slug = dash.get("slug", "")
    sys.stderr.write(f"Dashboard created: id={dash_id}, slug={dash_slug}\n")

    # Add Widgets
    # Row 0: KPI counters side by side
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v2_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 5, "col": 0, "row": 0}},
    })
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v3_id,
        "width": 3,
        "options": {"position": {"autoHeight": True, "sizeX": 3, "sizeY": 5, "col": 3, "row": 0}},
    })
    # Row 5: Bar chart (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v4_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 10, "col": 0, "row": 5}},
    })
    # Row 15: Detail table (full width)
    api_call("POST", "/api/widgets", {
        "dashboard_id": dash_id,
        "visualization_id": v1_id,
        "width": 6,
        "options": {"position": {"autoHeight": True, "sizeX": 6, "sizeY": 14, "col": 0, "row": 15}},
    })
    sys.stderr.write("Widgets added.\n")

    # Publish
    api_call("POST", f"/api/dashboards/{dash_id}", {
        "is_draft": False,
        "tags": ["inventory", "jrny-report", "report:inventory"],
    })
    sys.stderr.write("Dashboard published with tags [inventory, jrny-report, report:inventory].\n")

    summary = {
        "q1_id": q1_id,
        "q2_id": q2_id,
        "q3_id": q3_id,
        "v1_id": v1_id,
        "v2_id": v2_id,
        "v3_id": v3_id,
        "v4_id": v4_id,
        "dash_id": dash_id,
        "dash_slug": dash_slug,
    }
    sys.stdout.write(json.dumps(summary))


if __name__ == "__main__":
    main()
