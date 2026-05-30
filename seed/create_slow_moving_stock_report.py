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
    q1_sql = """SELECT
  product_code,
  product_name,
  category AS product_category,
  warehouse_name AS warehouse,
  quantity_on_hand,
  COALESCE(stock_value_at_cost / NULLIF(quantity_on_hand, 0), 0) AS unit_cost,
  stock_value_at_cost AS holding_cost,
  last_outbound_date,
  days_since_outbound AS days_since_last_movement,
  slow_moving_bucket AS movement_category
FROM reporting.v_slow_moving_stock
WHERE ('{{ warehouse }}' = '' OR warehouse_name = '{{ warehouse }}')
ORDER BY
  CASE slow_moving_bucket
    WHEN 'Dead Stock (No Outbound)' THEN 1
    WHEN '365+ Days' THEN 2
    WHEN '181-365 Days' THEN 3
    WHEN '91-180 Days' THEN 4
    WHEN '61-90 Days' THEN 5
  END,
  stock_value_at_cost DESC"""

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
    q2_sql = """WITH all_stock AS (
  SELECT
    SUM(stock_value_at_cost) AS total_inventory_value,
    COUNT(*) AS total_items
  FROM reporting.v_inventory_levels
  WHERE quantity_on_hand > 0
),
slow_stock AS (
  SELECT
    SUM(stock_value_at_cost) AS slow_dead_value,
    SUM(CASE WHEN days_since_outbound > 180 OR last_outbound_date IS NULL THEN stock_value_at_cost ELSE 0 END) AS dead_stock_value,
    COUNT(*) AS slow_dead_items
  FROM reporting.v_slow_moving_stock
)
SELECT
  ss.slow_dead_value,
  ss.dead_stock_value,
  ast.total_inventory_value,
  ROUND(100.0 * ss.slow_dead_value / NULLIF(ast.total_inventory_value, 0), 1) AS pct_slow_dead,
  ss.slow_dead_items,
  ast.total_items
FROM slow_stock ss
CROSS JOIN all_stock ast"""

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
    q3_sql = """SELECT
  warehouse_name AS warehouse,
  slow_moving_bucket AS movement_category,
  COUNT(*) AS item_count,
  SUM(stock_value_at_cost) AS total_value
FROM reporting.v_slow_moving_stock
WHERE ('{{ warehouse }}' = '' OR warehouse_name = '{{ warehouse }}')
GROUP BY warehouse_name, slow_moving_bucket
ORDER BY warehouse_name,
  CASE slow_moving_bucket
    WHEN 'Dead Stock (No Outbound)' THEN 1
    WHEN '365+ Days' THEN 2
    WHEN '181-365 Days' THEN 3
    WHEN '91-180 Days' THEN 4
    WHEN '61-90 Days' THEN 5
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
                "61-90 Days": {"type": "column", "yAxis": 0, "color": "#eab308"},
                "91-180 Days": {"type": "column", "yAxis": 0, "color": "#f97316"},
                "181-365 Days": {"type": "column", "yAxis": 0, "color": "#dc2626"},
                "365+ Days": {"type": "column", "yAxis": 0, "color": "#991b1b"},
                "Dead Stock (No Outbound)": {"type": "column", "yAxis": 0, "color": "#7f1d1d"},
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
