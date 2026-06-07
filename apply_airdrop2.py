import urllib.request, json

with open('/home/Kali/Junction_Generator/.turso-token') as f:
    token = f.read().strip()

url = "https://jgt-mining-topnodrog.aws-us-east-2.turso.io/v3/pipeline"

# Just create the table first
stmt = "CREATE TABLE IF NOT EXISTS airdrop_registrations (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT UNIQUE NOT NULL, email TEXT NOT NULL, registered_at TEXT DEFAULT (datetime('now')), notified INTEGER DEFAULT 0, claimed INTEGER DEFAULT 0)"

payload = {
    "requests": [
        {"type": "execute", "stmt": {"sql": stmt, "args": []}},
        {"type": "close"}
    ]
}
req = urllib.request.Request(url, method="POST", headers={
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token,
}, data=json.dumps(payload).encode())
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())
    result = data.get("results", [{}])[0]
    print(f"Create table: {result.get('type')}")

# Then create index
stmt2 = "CREATE INDEX IF NOT EXISTS idx_airdrop_wallet ON airdrop_registrations(wallet_address)"
payload2 = {
    "requests": [
        {"type": "execute", "stmt": {"sql": stmt2, "args": []}},
        {"type": "close"}
    ]
}
req2 = urllib.request.Request(url, method="POST", headers={
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token,
}, data=json.dumps(payload2).encode())
with urllib.request.urlopen(req2) as resp:
    data = json.loads(resp.read())
    result = data.get("results", [{}])[0]
    print(f"Create index: {result.get('type')}")

# Verify
payload3 = {
    "requests": [
        {"type": "execute", "stmt": {"sql": "SELECT name FROM sqlite_master WHERE type='table' AND name='airdrop_registrations'", "args": []}},
        {"type": "close"}
    ]
}
req3 = urllib.request.Request(url, method="POST", headers={
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token,
}, data=json.dumps(payload3).encode())
with urllib.request.urlopen(req3) as resp:
    data = json.loads(resp.read())
    rows = data["results"][0]["response"]["result"]["rows"]
    print(f"Table exists: {len(rows) > 0}")
