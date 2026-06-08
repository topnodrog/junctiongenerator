#!/usr/bin/env python3
"""Push local HEAD to topnodrog/junctiongenerator via GitHub REST API.
Reads .gh_token, creates blobs for all local files, builds tree, commits, updates ref."""
import subprocess, json, sys, os, base64

REPO = "topnodrog/junctiongenerator"
SCRIPT_DIR = "/home/Kali/Junction_Generator"
TOKEN_FILE = os.path.join(SCRIPT_DIR, ".gh_token")

with open(TOKEN_FILE) as f:
    TOKEN = f.read().strip()
AUTH = "Authorization: Bearer " + TOKEN

def api(method, url, data=None):
    cmd = ["curl", "-s", "-X", method,
           "-H", AUTH,
           "-H", "Accept: application/vnd.github+json"]
    if data is not None:
        # Write JSON to temp file to avoid "argument list too long"
        tmp = os.path.join(os.path.dirname(SCRIPT_DIR), ".tmp_api_data.json")
        with open(tmp, "w") as tf:
            json.dump(data, tf)
        cmd += ["-H", "Content-Type: application/json", "-d", "@" + tmp]
    cmd.append(url)
    r = subprocess.run(cmd, capture_output=True, text=True)
    # Clean up temp file
    tmp = os.path.join(os.path.dirname(SCRIPT_DIR), ".tmp_api_data.json")
    if os.path.exists(tmp):
        os.remove(tmp)
    return json.loads(r.stdout)

# Get remote HEAD and tree
ref = api("GET", "https://api.github.com/repos/" + REPO + "/git/refs/heads/main")
REMOTE_SHA = ref["object"]["sha"]
ci = api("GET", "https://api.github.com/repos/" + REPO + "/git/commits/" + REMOTE_SHA)
REMOTE_TREE = ci["tree"]["sha"]

# Get local HEAD
result = subprocess.run(["git", "log", "-1", "--format=%H %s"],
    capture_output=True, text=True, cwd=SCRIPT_DIR)
LOCAL_SHA = result.stdout.strip().split(" ")[0]
LOCAL_MSG = result.stdout.strip().split(" ", 1)[1] if " " in result.stdout.strip() else "update"

print("Remote: " + REMOTE_SHA[:12])
print("Local:  " + LOCAL_SHA[:12] + " - " + LOCAL_MSG[:60])

if LOCAL_SHA == REMOTE_SHA:
    print("Already in sync. Nothing to push.")
    sys.exit(0)

# Get list of all files tracked by git locally
result = subprocess.run(["git", "ls-files"],
    capture_output=True, text=True, cwd=SCRIPT_DIR)
local_files = [f for f in result.stdout.strip().split("\n") if f]
print("Local files: " + str(len(local_files)))

# Get remote tree for comparison
tree = api("GET", "https://api.github.com/repos/" + REPO + "/git/trees/" + REMOTE_TREE + "?recursive=1")

# Build new tree from local files
SKIP_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2",
             ".ttf", ".eot", ".mp3", ".mp4", ".mov", ".zip", ".gz", ".exe"}

new_items = []
skipped = 0
for fpath_str in local_files:
    full_path = os.path.join(SCRIPT_DIR, fpath_str)
    if not os.path.exists(full_path):
        continue
    ext = os.path.splitext(fpath_str)[1].lower()
    if ext in SKIP_EXTS:
        skipped += 1
        continue
    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception:
        skipped += 1
        continue
    if len(content) > 500000:  # skip huge files
        skipped += 1
        continue
    blob = api("POST", "https://api.github.com/repos/" + REPO + "/git/blobs",
        {"content": content, "encoding": "utf-8"})
    new_items.append({"path": fpath_str, "mode": "100644", "type": "blob", "sha": blob["sha"]})

print("Created " + str(len(new_items)) + " blobs, skipped " + str(skipped))

# Create new tree
nt = api("POST", "https://api.github.com/repos/" + REPO + "/git/trees",
    {"base_tree": REMOTE_TREE, "tree": new_items})
print("Tree: " + nt["sha"][:12])

# Use local HEAD commit message
msg = LOCAL_MSG
print("Commit: " + msg[:60])

# Create commit
nc = api("POST", "https://api.github.com/repos/" + REPO + "/git/commits",
    {"message": msg, "tree": nt["sha"], "parents": [REMOTE_SHA]})
print("Commit SHA: " + nc["sha"][:12])

# Update ref
api("PATCH", "https://api.github.com/repos/" + REPO + "/git/refs/heads/main",
    {"sha": nc["sha"]})
print("SUCCESS! Pushed to " + REPO)

# Verify key files
print("\nVerifying...")
for check_file in ["README.md", "src/app/page.tsx"]:
    try:
        d = api("GET", "https://api.github.com/repos/" + REPO + "/contents/" + check_file)
        content_remote = base64.b64decode(d["content"]).decode("utf-8")
        with open(os.path.join(SCRIPT_DIR, check_file), "r") as f:
            content_local = f.read()
        match = content_remote == content_local
        print("  " + check_file + ": " + ("OK" if match else "MISMATCH"))
    except Exception as e:
        print("  " + check_file + ": ERROR - " + str(e))
