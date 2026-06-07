#!/usr/bin/env python3
import subprocess, json, os, re

with open('/home/Kali/Junction_Generator/.git/local-credential', 'r') as f:
    cred = f.read().strip()
token = re.search(r'://[^:]+:([^@]+)@', cred).group(1)

def api(path):
    r = subprocess.run([
        'curl', '-sL', '--max-time', '15',
        '-H', 'Authorization: Bearer ' + token,
        '-H', 'Accept: application/vnd.github+json',
        'https://api.github.com' + path
    ], capture_output=True, text=True)
    return json.loads(r.stdout)

# Latest commit
c = api('/repos/topnodrog/Junction_Generator/commits/main')
print("Latest SHA:", c.get('sha','')[:12])
print("Message:", c.get('commit',{}).get('message','')[:80])
print("Date:", c.get('commit',{}).get('committer',{}).get('date'))

# Deployments
deps = api('/repos/topnodrog/Junction_Generator/deployments?per_page=5')
print(f"\nDeployments ({len(deps)}):")
for d in deps[:5]:
    print(f"  SHA:{d.get('sha','')[:12]} Env:{d.get('environment')} Created:{d.get('created_at')}")
    # Get deployment statuses
    statuses = api(f"/repos/topnodrog/Junction_Generator/deployments/{d.get('id')}/statuses?per_page=3")
    for s in statuses[:2]:
        print(f"    Status: {s.get('state')} - {s.get('description','')[:60]}")

# Check Pages status
pages = api('/repos/topnodrog/Junction_Generator/pages')
print(f"\nPages: {pages}")
