import subprocess, json, os

with open('/home/Kali/Junction_Generator/.turso-url') as f:
    turso_url = f.read().strip()
with open('/home/Kali/Junction_Generator/.turso-token') as f:
    turso_token = f.read().strip()

https_url = turso_url.replace('libsql://', 'https://')
print(f"URL: {https_url[:60]}...")

payload = json.dumps({"statements": ["SELECT 1 as test"]})

# Use env var for token to avoid string escaping issues
env = os.environ.copy()
env['TURSO_TOKEN'] = turso_token

# Write a small shell script instead
with open('/tmp/turso_test.sh', 'w') as f:
    f.write('#!/bin/bash\n')
    f.write(f'curl -s -X POST "{https_url}/v3/pipeline" \\\n')
    f.write(f'  -H "Content-Type: application/json" \\\n')
    f.write(f'  -H "Authorization: Bearer {turso_token}" \\\n')
    f.write(f'  -d \'{payload}\'\n')

os.chmod('/tmp/turso_test.sh', 0o755)
result = subprocess.run(['bash', '/tmp/turso_test.sh'], capture_output=True, text=True)
print(f"Response: {result.stdout[:300]}")
