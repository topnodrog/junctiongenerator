#!/bin/bash
set -euo pipefail

metadata() {
  curl --fail --silent --show-error \
    -H 'Metadata-Flavor: Google' \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"
}

REPOSITORY_URL="$(metadata jgc-repository-url)"
REPOSITORY_REF="$(metadata jgc-repository-ref)"
ADVERTISE_HOST="$(metadata jgc-advertise-host)"
SEED_URL="$(metadata jgc-seed-url)"
DATA_DEVICE="/dev/disk/by-id/google-jgc-seed-data"
DATA_DIRECTORY="/var/lib/jgc"
SOURCE_DIRECTORY="/opt/jgc/source"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --yes --no-install-recommends ca-certificates curl git docker.io
systemctl enable --now docker

for _ in $(seq 1 60); do
  test -b "$DATA_DEVICE" && break
  sleep 1
done
test -b "$DATA_DEVICE"

if ! blkid "$DATA_DEVICE" >/dev/null 2>&1; then
  mkfs.ext4 -F -L jgc-seed-data "$DATA_DEVICE"
fi

mkdir -p "$DATA_DIRECTORY"
DATA_UUID="$(blkid -s UUID -o value "$DATA_DEVICE")"
if ! grep -q "UUID=$DATA_UUID" /etc/fstab; then
  printf 'UUID=%s %s ext4 defaults,nofail 0 2\n' "$DATA_UUID" "$DATA_DIRECTORY" >> /etc/fstab
fi
mountpoint -q "$DATA_DIRECTORY" || mount "$DATA_DIRECTORY"

if test ! -d "$SOURCE_DIRECTORY/.git"; then
  mkdir -p "$(dirname "$SOURCE_DIRECTORY")"
  git clone --filter=blob:none "$REPOSITORY_URL" "$SOURCE_DIRECTORY"
fi
git -C "$SOURCE_DIRECTORY" fetch --depth 1 origin "$REPOSITORY_REF"
git -C "$SOURCE_DIRECTORY" checkout --detach FETCH_HEAD

IMAGE_TAG="jgc-node:$(git -C "$SOURCE_DIRECTORY" rev-parse --short=12 HEAD)"
docker build --pull --tag "$IMAGE_TAG" "$SOURCE_DIRECTORY/packages/jgc-node"

docker rm --force jgc-node >/dev/null 2>&1 || true
docker run --detach \
  --name jgc-node \
  --restart unless-stopped \
  --publish 127.0.0.1:19444:19444 \
  --publish 127.0.0.1:7777:7777 \
  --volume "$DATA_DIRECTORY:/data" \
  --env JGC_P2P_HOST=0.0.0.0 \
  --env JGC_STATUS_HOST=0.0.0.0 \
  --env JGC_DATA_DIR=/data \
  --env JGC_ADVERTISE_URL="wss://$ADVERTISE_HOST" \
  --env JGC_SEEDS="$SEED_URL" \
  --env JGC_PRODUCE=true \
  --env JGC_PARTICIPATE=true \
  --env JGC_BLOCK_INTERVAL_SEC=600 \
  --env JGC_RESET_TO_GENESIS=738588b974ed62ed52e74a946371bc8b6d84508b6c38203f56ada38fce4bab36 \
  --env JGC_RESET_ID=settlement-txid-v1 \
  "$IMAGE_TAG"

mkdir -p /etc/jgc /var/lib/caddy/data /var/lib/caddy/config
cat >/etc/jgc/Caddyfile <<EOF
$ADVERTISE_HOST {
  tls {
    issuer acme {
      disable_http_challenge
    }
  }

  handle /healthz {
    respond "ok" 200
  }

  # Public, deliberately narrow read-only explorer surface. The operator-only
  # /status endpoint is not routed and remains reachable only on loopback/IAP.
  handle /explorer {
    reverse_proxy 127.0.0.1:7777
  }

  handle /balance {
    reverse_proxy 127.0.0.1:7777
  }

  reverse_proxy 127.0.0.1:19444
}
EOF

docker rm --force jgc-caddy >/dev/null 2>&1 || true
docker run --detach \
  --name jgc-caddy \
  --restart unless-stopped \
  --network host \
  --volume /etc/jgc/Caddyfile:/etc/caddy/Caddyfile:ro \
  --volume /var/lib/caddy/data:/data \
  --volume /var/lib/caddy/config:/config \
  caddy:2.10.2-alpine

docker image prune --force --filter 'until=168h' >/dev/null

for _ in $(seq 1 60); do
  NODE_HEALTH="$(docker inspect --format '{{.State.Health.Status}}' jgc-node 2>/dev/null || true)"
  test "$NODE_HEALTH" = "healthy" && break
  sleep 2
done
test "$NODE_HEALTH" = "healthy"

echo "JGC startup complete: data=$DATA_DIRECTORY image=$IMAGE_TAG"
curl --fail --silent --show-error http://127.0.0.1:7777/status
echo
