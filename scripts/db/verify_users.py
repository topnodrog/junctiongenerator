import urllib.request, json

with open('/home/Kali/Junction_Generator/.turso-token') as f:
    token = f.read().strip()

url = "https://jgt-mining-topnodrog.aws-us-east-2.turso.io/v3/pipeline"
payload = {
    "requests": [
        {"type": "execute", "stmt": {"sql": "PRAGMA table_info(users)", "args": []}},
        {"type": "close"}
    ]
}
req = urllib.request.Request(url, method="POST", headers={
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token,
}, data=json.dumps(payload).encode())
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())
    rows = data["results"][0]["response"]["result"]["rows"]
    for row in rows:
        print(f"  {row[1]['value']} ({row[2]['value']})")
