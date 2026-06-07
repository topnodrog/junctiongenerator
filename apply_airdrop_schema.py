import urllib.request, json

with open('/home/Kali/Junction_Generator/.turso-token') as f:
    token = f.read().strip()

url = "https://jgt-mining-topnodrog.aws-us-east-2.turso.io/v3/pipeline"

with open('/home/Kali/Junction_Generator/db/schema_airdrop.sql') as f:
    schema = f.read()

statements = [s.strip() for s in schema.split(';') if s.strip() and not s.strip().startswith('--')]

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
                print(f"ERROR [{i}]: {result.get('error', {}).get('message', 'unknown')}")
            else:
                print(f"OK [{i}]")
    except Exception as e:
        print(f"FAIL [{i}]: {e}")
