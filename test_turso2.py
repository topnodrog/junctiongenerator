import subprocess, json, os

with open('/home/Kali/Junction_Generator/.turso-url') as f:
    turso_url = f.read().strip()
with open('/home/Kali/Junction_Generator/.turso-token') as f:
    turso_token = f.read().strip()

# Turso libsql:// URLs need to be converted to https:// for HTTP API
# libsql://x.turso.io -> https://x.turso.io
https_url = turso_url.replace('libsql://', 'https://')
print(f"HTTPS URL: {https_url[:60]}...")

payload = json.dumps({"statements": ["SELECT 1 as test"]})

# Test with https
result = subprocess.run(
    ['curl', '-s', '-X', 'POST',
     f'{https_url}/v3/pipeline',
     '-H', 'Content-Type: application/json',
     '-H', f'Authorization: Bearer ***     '-d', payload],
    capture_output=True, text=True
)
print(f"v3: {result.stdout[:200]}")

# Try without /v3
result2 = subprocess.run(
    ['curl', '-s', '-X', 'POST',
     f'{https_url}/',
     '-H', 'Content-Type: application/json',
     '-H', f'Authorization: Bearer ***     '-d', payload],
    capture_output=True, text=True
)
print(f"root: {result2.stdout[:200]}")
