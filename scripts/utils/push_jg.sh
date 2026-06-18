#!/bin/bash
# Push to topnodrog/junctiongenerator (Vercel-deployed repo)
# Reads PAT from .gh_token file

set -e

REPO="topnodrog/junctiongenerator"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN_FILE="$SCRIPT_DIR/.gh_token"

if [ ! -f "$TOKEN_FILE" ]; then
    echo "ERROR: $TOKEN_FILE not found"
    exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")

# Get current remote HEAD SHA
echo "Fetching remote HEAD..."
REMOTE_SHA=$(curl -s -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$REPO/git/refs/heads/main" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['object']['sha'])")

echo "Remote HEAD: $REMOTE_SHA"

# Push each local commit that's ahead of remote
LOCAL_COMMITS=$(cd "$SCRIPT_DIR" && git log ${REMOTE_SHA}..HEAD --reverse --format="%H %s" 2>/dev/null)

if [ -z "$LOCAL_COMMITS" ]; then
    echo "No local commits to push."
    exit 0
fi

CURRENT_REMOTE="$REMOTE_SHA"

while IFS= read -r line; do
    COMMIT_SHA=$(echo "$line" | cut -d' ' -f1)
    COMMIT_MSG=$(echo "$line" | cut -d' ' -f2-)

    echo "Pushing: $COMMIT_MSG"

    # Get the tree for this local commit
    LOCAL_TREE=$(cd "$SCRIPT_DIR" && git log -1 --format="%T" "$COMMIT_SHA")

    # Create a new commit on top of remote
    NEW_SHA=$(curl -s -X POST \
        -H "Authorization: Bearer $TOKEN" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        -H "Content-Type: application/json" \
        -d "{\"message\":\"$COMMIT_MSG\",\"tree\":\"$LOCAL_TREE\",\"parents\":[\"$CURRENT_REMOTE\"]}" \
        "https://api.github.com/repos/$REPO/git/commits" | \
        python3 -c "import sys,json; print(json.load(sys.stdin)['sha'])")

    echo "  New commit: $NEW_SHA"

    # Update remote ref
    curl -s -X PATCH \
        -H "Authorization: Bearer $TOKEN" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        -H "Content-Type: application/json" \
        -d "{\"sha\":\"$NEW_SHA\"}" \
        "https://api.github.com/repos/$REPO/git/refs/heads/main" > /dev/null

    echo "  Updated remote ref."

    CURRENT_REMOTE="$NEW_SHA"
done <<< "$LOCAL_COMMITS"

echo "Done! All commits pushed to $REPO."
