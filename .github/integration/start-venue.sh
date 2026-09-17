#!/usr/bin/env bash
# Start a throwaway venue in Docker for venue.test.ts and print the env the
# suite needs (appended to $GITHUB_ENV in CI).
#
#   VENUE_IMAGE  image to run (default: the pinned release below)
#   VENUE_PORT   host port (default 8080; the venue must report the same URL,
#                so the port is also written into the config)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
image="${VENUE_IMAGE:-ghcr.io/covia-ai/covia:0.9.8}"
port="${VENUE_PORT:-8080}"
name="${VENUE_CONTAINER:-covia-sdk-it-venue}"
base="http://localhost:${port}"

config="$(mktemp -d)/venue.json"
sed "s/\"port\": 8080/\"port\": ${port}/" "$here/venue.json" > "$config"
chmod 644 "$config"

docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --rm --name "$name" -p "${port}:${port}" \
  -v "$config:/app/config/venue.json:ro" "$image" /app/config/venue.json >/dev/null

for _ in $(seq 1 60); do
  curl -sf "$base/api/v1/status" >/dev/null && break
  sleep 2
done
if ! curl -sf "$base/api/v1/status" >/dev/null; then
  echo "Venue did not become ready at $base" >&2
  docker logs "$name" >&2 || true
  exit 1
fi

# The image ships no data assets; venue.test.ts expects the Iris Dataset.
# Asset ids are content hashes, so this id is stable across runs.
iris="$(curl -sf -X POST -H 'Content-Type: application/json' \
  --data-binary @"$here/iris.json" "$base/api/v1/assets" | tr -d '"')"

env_lines="VENUE_HOST=$base
VENUE_URL=$base
VENUE_NAME=SDK Integration Venue
MIN_ASSETS_VENUE=1
VALID_ASSET=$iris
VALID_OP=v/test/ops/random
VALID_OP2=v/test/ops/delay
VALID_OP2_INPUT={\"delay\":8000}"

echo "Venue $image ready at $base" >&2
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "$env_lines" >> "$GITHUB_ENV"
else
  echo "$env_lines"
fi
