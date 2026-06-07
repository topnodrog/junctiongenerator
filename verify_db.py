import urllib.request, json

with open('/home/Kali/Junction_Generator/.turso-token') as f:
    token = f.read().strip()

url = "https://jgt-mining-topnodrog.aws-us-east-2.turso.io/v3/pipeline"
payload = {
    "requests": [
        {"type": "execute", "stmt": {"sql": "SELECT name FROM sqlite_master WHERE type='table'", "args": []}},
        {"type": "close"}
    ]
}
req = urllib.request.Request(url, method="POST", headers={
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token,
}, data=json.dumps(payload).encode())
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())
    print(json.dumps(data, indent=2)[:1000])
