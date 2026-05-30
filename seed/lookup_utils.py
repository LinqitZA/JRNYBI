"""Shared lookup query utilities for seed scripts.

Provides functions to find or create lookup queries that power
query-based dropdown parameters in report queries.
"""
import json
import sys
import urllib.request
import urllib.error


# Lookup query definitions — identical to LOOKUP_QUERIES in jrny_reports.py
# These are small queries that return distinct values for dropdown filters.
LOOKUPS = {
    "supplier_lookup": {
        "name": "Lookup: Suppliers",
        "query": "SELECT DISTINCT vendor_name AS supplier_name FROM reporting.v_purchase_orders WHERE vendor_name IS NOT NULL ORDER BY vendor_name",
    },
    "warehouse_lookup": {
        "name": "Lookup: Warehouses",
        "query": "SELECT DISTINCT warehouse_name FROM reporting.v_inventory_levels WHERE warehouse_name IS NOT NULL ORDER BY warehouse_name",
    },
    "category_lookup": {
        "name": "Lookup: Product Categories",
        "query": "SELECT DISTINCT product_category AS category FROM reporting.v_inventory_levels WHERE product_category IS NOT NULL ORDER BY product_category",
    },
    "product_lookup": {
        "name": "Lookup: Products",
        "query": "SELECT DISTINCT product_code || ' - ' || product_name AS product_code FROM reporting.v_grn_summary WHERE product_code IS NOT NULL ORDER BY 1",
    },
    "movement_type_lookup": {
        "name": "Lookup: Stock Movement Types",
        "query": "SELECT DISTINCT movement_type FROM reporting.v_stock_movements WHERE movement_type IS NOT NULL ORDER BY movement_type",
    },
}


def _api_call(method, path, data=None, base_url="http://localhost:5001", api_key=""):
    """Make an API call to JRNYBI."""
    url = f"{base_url}{path}"
    headers = {
        "Authorization": f"Key {api_key}",
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


def resolve_lookup_id(lookup_key, base_url="http://localhost:5001", api_key="", ds_id=1):
    """Find or create a lookup query and return its ID.

    Args:
        lookup_key: Key into LOOKUPS dict (e.g. 'supplier_lookup')
        base_url: JRNYBI server URL
        api_key: Admin API key
        ds_id: Data source ID

    Returns:
        int: query ID of the lookup query, or None if not found/created
    """
    if lookup_key not in LOOKUPS:
        sys.stderr.write(f"Unknown lookup key: {lookup_key}\n")
        return None

    lookup_def = LOOKUPS[lookup_key]
    name = lookup_def["name"]

    # Try to find existing lookup query
    try:
        result = _api_call("GET", f"/api/queries?q={name.replace(' ', '+')}&page_size=100",
                           base_url=base_url, api_key=api_key)
        for q in result.get("results", []):
            if q["name"] == name:
                return q["id"]
    except Exception:
        pass

    # Create the lookup query if not found
    try:
        result = _api_call("POST", "/api/queries", {
            "name": name,
            "description": f"Auto-created lookup query for dropdown parameters.",
            "data_source_id": ds_id,
            "query": lookup_def["query"],
            "options": {"parameters": []},
            "tags": ["jrny-lookup"],
        }, base_url=base_url, api_key=api_key)
        sys.stderr.write(f"Created lookup query: {name} (id={result['id']})\n")
        return result["id"]
    except Exception as e:
        sys.stderr.write(f"Failed to create lookup {name}: {e}\n")
        return None
