#!/bin/bash
# Starts the worker for its LaunchAgent: reads the token from the login keychain, then runs Node in this process's
# place. Usage: start.sh <node>. The token goes only into Node's environment: never into a file, an argument or the log.
set -euo pipefail

node="$1"
worker="$(cd "$(dirname "$0")/.." && pwd)"
service=combo-skin-worker
user="${USER:-$(id -un)}"

if ! token="$(security find-generic-password -a "$user" -s "$service" -w 2> /dev/null)" || [ -z "$token" ]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) error The worker's token can't be read from the login keychain (account $user, service $service)." >&2
  echo "  Add it with: security add-generic-password -a \"\$USER\" -s $service -w   (the service tries again in a minute)" >&2
  exit 2
fi

export COMBO_WORKER_TOKEN="$token"
unset token
exec "$node" "$worker/src/main.mjs"
