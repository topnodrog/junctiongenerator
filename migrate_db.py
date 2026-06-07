import urllib.request, json

with open('/home/Kali/Junction_Generator/.turso-token') as f:
    token = f.read().strip()

url = "https://jgt-mining-topnodrog.aws-us-east-2.turso.io/v3/pipeline"

statements = [
    "ALTER TABLE users ADD COLUMN referrer_code TEXT",
    "ALTER TABLE users ADD COLUMN referral_reward REAL DEFAULT 0",
    "CREATE TABLE IF NOT EXISTS ad_campaigns (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, cta TEXT DEFAULT 'Learn More', cta_url TEXT NOT NULL, sponsor TEXT NOT NULL, image_url TEXT, budget REAL NOT NULL, total_budget REAL NOT NULL, daily_budget REAL, impressions INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')), wallet_address TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_code)",
    "CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status)",
]

for i, stmt in enumerate(statements):
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
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            result = data.get("results", [{}])[0]
            if result.get("type") == "error":
                err_msg = result.get("error", {}).get("message", "unknown")
                print(f"ERROR [{i}]: {err_msg}")
            else:
                print(f"OK [{i}]: {stmt[:60]}...")
    except Exception as e:
        print(f"FAIL [{i}]: {e}")
