#!/usr/bin/env python3
"""Deploy Cloudflare Worker and set secrets."""

import urllib.request
import json
import os
import sys
import time
import secrets

# Configuration
ACCOUNT_ID = "14e1784eca55fb28383172384ac8990c"
WORKER_NAME = "jgt-mining-api"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Read secrets from files
def read_secret(filename):
    path = os.path.join(SCRIPT_DIR, filename)
    if os.path.exists(path):
        with open(path) as f:
            return f.read().strip()
    return None

CF_API_TOKEN = read_secret('.cf_token')
TURSO_AUTH_TOKEN = read_secret('.turso-token')

if not CF_API_TOKEN:
    print("ERROR: .cf_token file not found or empty")
    sys.exit(1)

if not TURSO_AUTH_TOKEN:
    print("ERROR: .turso-token file not found or empty")
    sys.exit(1)

print(f"CF Token length: {len(CF_API_TOKEN)}")
print(f"Turso Token length: {len(TURSO_AUTH_TOKEN)}")

def cf_api(method, path, data=None):
    url = f"https://api.cloudflare.com/client/v4{path}"
    body = json.dumps(data).encode() if data else None
    headers = {
        "Authorization": "Bearer " + CF_API_TOKEN,
        "Content-Type": "application/json"
    }
    req = urllib.request.Request(url, method=method, headers=headers, data=body)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except Exception as e:
        if hasattr(e, 'read'):
            print(f"API Error Body: {e.read().decode()[:500]}")
        raise

# Step 1: Verify token by listing workers
print("\n=== Step 1: Verifying API token ===")
result = cf_api("GET", f"/accounts/{ACCOUNT_ID}/workers/scripts")
if result.get("success"):
    print(f"Token valid! Found {len(result.get('result', []))} existing workers")
else:
    print(f"Token invalid: {result}")
    sys.exit(1)

# Step 2: Read worker script
print("\n=== Step 2: Reading worker script ===")
worker_path = os.path.join(SCRIPT_DIR, 'api', 'worker.js')
with open(worker_path) as f:
    worker_script = f.read()
print(f"Worker script: {len(worker_script)} bytes")

# Step 3: Deploy worker
print("\n=== Step 3: Deploying worker ===")
boundary = "----FormBoundary7MA4YWxkTrZu0gW"
body = (
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="metadata"\r\n'
    f"Content-Type: application/json\r\n\r\n"
    f'{{"main_module": "worker.js", "compatibility_date": "2024-01-01"}}\r\n'
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n'
    f"Content-Type: application/javascript+module\r\n\r\n"
    f"{worker_script}\r\n"
    f"--{boundary}--\r\n"
).encode()

url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{WORKER_NAME}"
req = urllib.request.Request(url, method="PUT", headers={
    "Authorization": "Bearer " + CF_API_TOKEN,
    "Content-Type": f"multipart/form-data; boundary={boundary}",
}, data=body)

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        if data.get("success"):
            print("Worker deployed successfully!")
        else:
            print(f"Deploy error: {json.dumps(data, indent=2)[:500]}")
            sys.exit(1)
except Exception as e:
    print(f"Deploy error: {e}")
    if hasattr(e, 'read'):
        print("Body:", e.read().decode()[:500])
    sys.exit(1)

# Step 4: Set secrets
print("\n=== Step 4: Setting secrets ===")

# TURSO_URL as a plain text binding
result = cf_api("PUT", 
    f"/accounts/{ACCOUNT_ID}/workers/scripts/{WORKER_NAME}/secrets",
    {"name": "TURSO_AUTH_TOKEN", "text": TURSO_AUTH_TOKEN, "type": "secret_text"}
)
if result.get("success"):
    print("TURSO_AUTH_TOKEN secret set!")
else:
    print(f"Error setting TURSO_AUTH_TOKEN: {result}")

# Generate random secrets for API_SECRET and CRON_SECRET
api_secret = secrets.token_hex(32)
cron_secret = secrets.token_hex(32)

for name, value in [("API_SECRET", api_secret), ("CRON_SECRET", cron_secret)]:
    result = cf_api("PUT",
        f"/accounts/{ACCOUNT_ID}/workers/scripts/{WORKER_NAME}/secrets",
        {"name": name, "text": value, "type": "secret_text"}
    )
    if result.get("success"):
        print(f"{name} secret set!")
    else:
        print(f"Error setting {name}: {result}")

# Step 5: Set environment variables
print("\n=== Step 5: Setting environment variables ===")
TURSO_URL = "https://jgt-mining-topnodrog.aws-us-east-2.turso.io"

# Update wrangler.toml with the env vars
wrangler_path = os.path.join(SCRIPT_DIR, 'api', 'wrangler.toml')
with open(wrangler_path) as f:
    wrangler_config = f.read()

# Replace the TURSO_URL in the config
if 'TURSO_URL =' in wrangler_config:
    import re
    wrangler_config = re.sub(r'TURSO_URL = ".*?"', f'TURSO_URL = "{TURSO_URL}"', wrangler_config)
    with open(wrangler_path, 'w') as f:
        f.write(wrangler_config)
    print(f"Updated wrangler.toml with TURSO_URL")

print(f"\n=== Deployment Complete ===")
print(f"Worker URL: https://{WORKER_NAME}.<subdomain>.workers.dev")
print(f"API Secret: {api_secret}")
print(f"Cron Secret: {cron_secret}")
print(f"\nSet these Vercel env vars:")
print(f"  NEXT_PUBLIC_API_URL=https://{WORKER_NAME}.<subdomain>.workers.dev")
