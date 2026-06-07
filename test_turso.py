import subprocess, json, os

# Read credentials from files
with open('/home/Kali/Junction_Generator/.turso-url') as f:
    turso_url = f.read().strip()
with open('/home/Kali/Junction_Generator/.turso-token') as f:
    turso_token = f.read().strip()

print(f"URL: {turso_url[:60]}...")
print(f"Token: {turso_token[:20]}...")

# Test connection with a simple query
payload = json.dumps({"statements": ["SELECT 1 as test"]})

# Try v3 endpoint
result = subprocess.run(
    ['curl', '-s', '-X', 'POST',
     f'{turso_url}/v3/pipeline',
     '-H', 'Content-Type: application/json',
     '-H', f'Authorization: Bearer {turso_token}',
     '-d', payload],
    capture_output=True, text=True
)
print(f"\nv3/pipeline response: {result.stdout[:300]}")

# Try v2 endpoint
result2 = subprocess.run(
    ['curl', '-s', '-X', 'POST',
     f'{turso_url}/v2/pipeline',
     '-H', 'Content-Type: application/json',
     '-H', f'Authorization: Bearer {turso_token}',
     '-d', payload],
    capture_output=True, text=True
)
print(f"v2/pipeline response: {result2.stdout[:300]}")

# Try the libSQL HTTP API format
result3 = subprocess.run(
    ['curl', '-s', '-X', 'POST',
     f'{turso_url}/',
     '-H', 'Content-Type: application/json',
     '-H', f'Authorization: Bearer {turso_token}',
     '-d', payload],
    capture_output=True, text=True
)
print(f"root response: {result3.stdout[:300]}")
