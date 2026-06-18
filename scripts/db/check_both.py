#!/usr/bin/env python3
"""Check both repos and their recent commits."""
import subprocess, json, re, tempfile, os

with open('/home/Kali/Junction_Generator/.git/local-credential', 'r') as f:
    cred = f.read().strip()
token = re.search(r'://[^:]+:([^@]+)@', cred).group(1)

# Write curl config to avoid token-in-string issues
cfg = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
cfg.write('header = "Authorization: Bearer ' + token + '"\n')
cfg.write('header = "Accept: application/vnd.github+json"\n')
cfg.close()

def api(path):
    r = subprocess.run([
        'curl', '-sL', '--max-time', '15', '-K', cfg.name,
        'https://api.github.com' + path
    ], capture_output=True, text=True)
    return json.loads(r.stdout)

try:
    for repo in ['topnodrog/junctiongenerator', 'topnodrog/Junction_Generator']:
        try:
            data = api(f'/repos/{repo}')
            if 'message' in data:
                print(f"{repo}: {data['message']}")
                continue
            print(f"\n{repo}:")
            print(f"  Full name: {data.get('full_name')}")
            print(f"  Default branch: {data.get('default_branch')}")
            print(f"  Updated: {data.get('updated_at')}")
            
            commits = api(f'/repos/{repo}/commits?per_page=3')
            for c in commits[:3]:
                msg = c['commit']['message'].split('\n')[0][:60]
                print(f"  Commit: {c['sha'][:8]} - {msg}")
        except Exception as e:
            print(f"{repo}: Error - {e}")
finally:
    os.unlink(cfg.name)
