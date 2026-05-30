#!/usr/bin/env python3
"""One-time migration: update existing query parameters to use correct types.

This script updates existing report queries in the JRNYBI database to use:
- type: "date" for date parameters (instead of "text")
- type: "query" for lookup-backed dropdowns (instead of "text")
- type: "enum" for fixed-value dropdowns (instead of "text")

Run after jrny_reports.py has created the lookup queries.

Usage:
    python seed/update_param_types.py --api-key KEY [--base-url URL]
"""
import json
import os
import sys
import urllib.request
import urllib.error

BASE_URL = os.environ.get("JRNYBI_BASE_URL", "http://localhost:5001")
API_KEY = os.environ.get("JRNYBI_ADMIN_API_KEY", "")


def api_call(method, path, data=None):
    url = f"{BASE_URL}{path}"
    headers = {
        "Authorization": f"Key {API_KEY}",
        "Content-Type": "application/json",
    }
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def find_lookup_ids():
    """Find existing lookup query IDs by name."""
    result = api_call("GET", "/api/queries?q=Lookup&page_size=100")
    lookup_ids = {}
    name_to_key = {
        "Lookup: Suppliers": "supplier_lookup",
        "Lookup: Warehouses": "warehouse_lookup",
        "Lookup: Product Categories": "category_lookup",
        "Lookup: GL Account Codes": "account_code_lookup",
        "Lookup: Bank Accounts": "bank_account_lookup",
        "Lookup: PO Statuses": "po_status_lookup",
        "Lookup: Products": "product_lookup",
        "Lookup: Vendor Groups": "vendor_group_lookup",
        "Lookup: Customer Groups": "customer_group_lookup",
        "Lookup: Stock Movement Types": "movement_type_lookup",
    }
    for q in result.get("results", []):
        key = name_to_key.get(q["name"])
        if key:
            lookup_ids[key] = q["id"]
    return lookup_ids


# Parameter name -> new type definition
# For "query" type, the queryId will be resolved from lookup_ids
PARAM_UPDATES = {
    "supplier_name": {"type": "query", "lookup": "supplier_lookup"},
    "product_code": {"type": "query", "lookup": "product_lookup"},
    "category": {"type": "query", "lookup": "category_lookup"},
    "vendor_group": {"type": "query", "lookup": "vendor_group_lookup"},
    "account_code": {"type": "query", "lookup": "account_code_lookup"},
    "bank_account": {"type": "query", "lookup": "bank_account_lookup"},
    "customer_group": {"type": "query", "lookup": "customer_group_lookup"},
    "status": {"type": "query", "lookup": "po_status_lookup"},
    "health_status": {"type": "enum", "enumOptions": "Good\nWatch\nRisk"},
    "dimension_type": {"type": "enum", "enumOptions": "Entity\nFunction\nProject"},
    "warehouse": {"type": "query", "lookup": "warehouse_lookup"},
    "supplier": {"type": "query", "lookup": "supplier_lookup"},
    "product": {"type": "query", "lookup": "product_lookup"},
    "movement_type": {"type": "query", "lookup": "movement_type_lookup"},
}

# Date parameters in pipeline/activity queries that need fixing
DATE_PARAM_TITLES = {
    "Close Date From", "Close Date To",
    "Activity Date From", "Activity Date To",
}


def update_query_params(query_id, query_name, params, lookup_ids):
    """Update a query's parameters if any need type changes.

    Returns True if changes were made.
    """
    changed = False
    new_params = []

    for param in params:
        p = dict(param)  # shallow copy
        name = p.get("name", "")
        title = p.get("title", "")
        current_type = p.get("type", "")

        # Fix date parameters that are "text" (pipeline/activity queries)
        if name in ("start_date", "end_date") and current_type == "text" and title in DATE_PARAM_TITLES:
            p["type"] = "date"
            if not p.get("value"):
                p["value"] = "2024-01-01" if name == "start_date" else "2024-12-31"
            changed = True

        # Fix lookup/enum parameters
        elif name in PARAM_UPDATES and current_type == "text":
            update = PARAM_UPDATES[name]
            if update["type"] == "query":
                lookup_key = update["lookup"]
                if lookup_key in lookup_ids:
                    p["type"] = "query"
                    p["queryId"] = lookup_ids[lookup_key]
                    changed = True
                else:
                    sys.stderr.write(f"  WARNING: lookup '{lookup_key}' not found, keeping text for {name}\n")
            elif update["type"] == "enum":
                p["type"] = "enum"
                p["enumOptions"] = update["enumOptions"]
                changed = True

        new_params.append(p)

    if changed:
        # Update the query via API
        try:
            api_call("POST", f"/api/queries/{query_id}", {
                "options": {"parameters": new_params}
            })
            sys.stderr.write(f"  UPDATED: {query_name} (id={query_id})\n")
        except urllib.error.HTTPError as e:
            err = e.read().decode() if e.fp else ""
            sys.stderr.write(f"  ERROR updating {query_name}: {e.code} {err}\n")
    return changed


def main():
    global API_KEY, BASE_URL

    # Parse CLI args
    import argparse
    parser = argparse.ArgumentParser(description="Update report parameter types")
    parser.add_argument("--api-key", default=API_KEY)
    parser.add_argument("--base-url", default=BASE_URL)
    args = parser.parse_args()
    API_KEY = args.api_key
    BASE_URL = args.base_url

    if not API_KEY:
        sys.stderr.write("Error: No API key. Set JRNYBI_ADMIN_API_KEY or pass --api-key.\n")
        sys.exit(1)

    # Find lookup query IDs
    sys.stderr.write("Finding lookup queries...\n")
    lookup_ids = find_lookup_ids()
    sys.stderr.write(f"  Found {len(lookup_ids)} lookup queries: {lookup_ids}\n")

    if not lookup_ids:
        sys.stderr.write("No lookup queries found. Run jrny_reports.py first.\n")
        sys.exit(1)

    # Fetch all report queries
    sys.stderr.write("Fetching all queries...\n")
    page = 1
    updated = 0
    checked = 0

    while True:
        result = api_call("GET", f"/api/queries?page={page}&page_size=50")
        queries = result.get("results", [])
        if not queries:
            break

        for q in queries:
            params = q.get("options", {}).get("parameters", [])
            if not params:
                continue

            checked += 1
            # Check if any params need updating
            needs_update = False
            for p in params:
                name = p.get("name", "")
                title = p.get("title", "")
                ptype = p.get("type", "")

                if name in PARAM_UPDATES and ptype == "text":
                    needs_update = True
                    break
                if name in ("start_date", "end_date") and ptype == "text" and title in DATE_PARAM_TITLES:
                    needs_update = True
                    break

            if needs_update:
                if update_query_params(q["id"], q["name"], params, lookup_ids):
                    updated += 1

        if len(queries) < 50:
            break
        page += 1

    sys.stderr.write(f"\nDone! Checked {checked} queries, updated {updated}.\n")

    # Output summary as JSON
    summary = {"checked": checked, "updated": updated, "lookup_ids": lookup_ids}
    sys.stdout.write(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
