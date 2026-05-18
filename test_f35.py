#!/usr/bin/env python3
"""Feature #35 verification: Data source creation restricted to super-admin users only"""

import json
import urllib.request
import urllib.error
import sys

BASE_URL = "http://localhost:5001"
ADMIN_KEY = "BBw0fb0ZdZ3iip5Xkd90bCQPOJP7hcTo5JtOwZMI"
# User 7: rls-test-malicious@jrny-test.co.za, groups=[2] (non-admin)
REGULAR_USER_KEY = "MRBCb9ZtA28vBTEJFX21WNjLnOmgV4QnSxp2p43M"

results = {}

def make_request(method, path, api_key=None, data=None):
    url = BASE_URL + path
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Key {api_key}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            try:
                body = json.loads(resp.read())
            except Exception:
                body = {}
            return resp.status, body
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read())
        except Exception:
            body = {}
        return e.code, body

# ===== Step 1: Verify regular user's group membership =====
print("=== Step 1: Verify non-admin user ===")
status, user_detail = make_request("GET", "/api/users/7", ADMIN_KEY)
print(f"GET /api/users/7 → {status}")
if status == 200:
    groups = user_detail.get("groups", [])
    email = user_detail.get("email", "")
    group_names = [g.get("name", "") if isinstance(g, dict) else str(g) for g in groups]
    print(f"User: {email} | groups: {group_names}")
    is_admin = any("admin" in str(g).lower() for g in groups)
    print(f"Is admin: {is_admin}")
    results["user_verified"] = not is_admin
else:
    print(f"Could not verify user 7: {user_detail}")
    # Try to get users list to find a regular user
    status2, users_data = make_request("GET", "/api/users", ADMIN_KEY)
    print(f"GET /api/users → {status2} | data: {str(users_data)[:200]}")
    results["user_verified"] = False

print()

# ===== Step 2: Non-admin POST /api/data_sources (expect 403) =====
print("=== Step 2: Non-admin POST /api/data_sources ===")
ds_payload = {
    "name": "Test DS Regular User",
    "type": "pg",
    "options": {"host": "localhost", "port": 5432, "dbname": "test", "user": "test", "password": "test"}
}
status, resp = make_request("POST", "/api/data_sources", REGULAR_USER_KEY, ds_payload)
print(f"POST /api/data_sources as regular user → {status}")
print(f"Response: {json.dumps(resp)[:200]}")
if status == 403:
    print("PASS: Got 403 Forbidden")
    results["post_403"] = True
else:
    print(f"FAIL: Expected 403, got {status}")
    results["post_403"] = False

print()

# ===== Step 3: Non-admin PUT /api/data_sources/1 (expect 403) =====
print("=== Step 3: Non-admin PUT /api/data_sources/1 ===")
status, resp = make_request("PUT", "/api/data_sources/1", REGULAR_USER_KEY, {"name": "Hacked"})
print(f"PUT /api/data_sources/1 as regular user → {status}")
print(f"Response: {json.dumps(resp)[:200]}")
if status == 403:
    print("PASS: Got 403 Forbidden")
    results["put_403"] = True
else:
    print(f"FAIL: Expected 403, got {status}")
    results["put_403"] = False

print()

# ===== Step 4: Non-admin DELETE /api/data_sources/1 (expect 403) =====
print("=== Step 4: Non-admin DELETE /api/data_sources/1 ===")
status, resp = make_request("DELETE", "/api/data_sources/1", REGULAR_USER_KEY)
print(f"DELETE /api/data_sources/1 as regular user → {status}")
print(f"Response: {json.dumps(resp)[:200]}")
if status == 403:
    print("PASS: Got 403 Forbidden")
    results["delete_403"] = True
else:
    print(f"FAIL: Expected 403, got {status}")
    results["delete_403"] = False

print()

# ===== Step 5: Admin GET /api/users (to find current users) =====
print("=== Step 5: Admin GET /api/users ===")
status, users_data = make_request("GET", "/api/users", ADMIN_KEY)
print(f"GET /api/users → {status}")
if isinstance(users_data, dict) and "results" in users_data:
    for u in users_data["results"]:
        groups = u.get("groups", [])
        group_names = [g.get("name", "") if isinstance(g, dict) else str(g) for g in groups]
        print(f"  id={u.get('id')} email={u.get('email')} groups={group_names}")
print()

# ===== Step 6: Admin POST /api/data_sources (expect 200/201) =====
print("=== Step 6: Admin POST /api/data_sources ===")
ds_payload = {
    "name": "Test DS Admin Feature35",
    "type": "pg",
    "options": {"host": "localhost", "port": 5432, "dbname": "test", "user": "test", "password": "test"}
}
status, resp = make_request("POST", "/api/data_sources", ADMIN_KEY, ds_payload)
print(f"POST /api/data_sources as admin → {status}")
print(f"Response: {json.dumps(resp)[:300]}")
if status in (200, 201):
    print("PASS: Admin can create data source")
    results["admin_post"] = True
    created_id = resp.get("id")
    if created_id:
        del_status, _ = make_request("DELETE", f"/api/data_sources/{created_id}", ADMIN_KEY)
        print(f"Cleanup: DELETE /api/data_sources/{created_id} → {del_status}")
elif status == 400:
    print("PASS (acceptable): Auth passed, got 400 validation error (auth check succeeded)")
    results["admin_post"] = True
else:
    print(f"FAIL: Expected 200/201, got {status}")
    results["admin_post"] = False

print()
print("=== SUMMARY ===")
all_pass = all(results.values())
for k, v in results.items():
    print(f"  {k}: {'PASS' if v else 'FAIL'}")
print(f"\nOverall: {'ALL PASS' if all_pass else 'SOME FAILURES'}")
sys.exit(0 if all_pass else 1)
