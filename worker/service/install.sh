#!/bin/bash
# Installs the screenshot worker as the LaunchAgent skin.combo.screenshot-worker: started at login and again whenever
# it exits (at most once a minute), at background priority. An older job with the same label is replaced.
# launchd's jobs can't read ~/Documents, ~/Desktop or ~/Downloads (macOS privacy protection), so the worker's files
# (src/, service/, viewer-dist/) are copied to ~/Library/Application Support/combo-skin/ and run from there: run this
# again after a "git pull" or "npm run build". Run it from anywhere: worker/service/install.sh
# (--print: show the plist, change nothing).
# Settings: COMBO_API_URL (default http://127.0.0.1:8000), WORKER_VIEWER_PORT (5321 or 5320, default 5321),
# WORKER_NODE (default: node on PATH), WORKER_PROFILE_DIR (default ~/.cache/cs2-combo-worker/chrome-profile),
# WORKER_SERVICE_LABEL (another label, for a trial run: its log is named after it).
set -euo pipefail

label="${WORKER_SERVICE_LABEL:-skin.combo.screenshot-worker}"
api="${COMBO_API_URL:-http://127.0.0.1:8000}"
port="${WORKER_VIEWER_PORT:-5321}"
here="$(cd "$(dirname "$0")" && pwd)"
checkout="$(cd "$here/.." && pwd)"
name="${label#skin.combo.}"
worker="$HOME/Library/Application Support/combo-skin/$name"
logs="$HOME/Library/Logs/combo-skin"
log="$logs/$name.log"
profile="${WORKER_PROFILE_DIR:-$HOME/.cache/cs2-combo-worker/chrome-profile}"
agents="$HOME/Library/LaunchAgents"
plist="$agents/$label.plist"
domain="gui/$(id -u)"

node="${WORKER_NODE:-$(command -v node || true)}"
[ -n "$node" ] && [ -x "$node" ] || { echo "node is not on PATH (or set WORKER_NODE to its absolute path)" >&2; exit 1; }
case "$node" in /*) ;; *) echo "WORKER_NODE must be an absolute path: $node" >&2; exit 1 ;; esac
major="$("$node" --version 2> /dev/null | sed -E 's/^v([0-9]+).*/\1/')"
[ "${major:-0}" -ge 24 ] 2> /dev/null || { echo "The worker needs Node 24 or later; $node is $("$node" --version 2> /dev/null || echo unknown)" >&2; exit 1; }
case "$port" in 5320 | 5321) ;; *) echo "WORKER_VIEWER_PORT must be 5320 or 5321: the asset bucket's CORS allows only these." >&2; exit 1 ;; esac
path="$(dirname "$node"):/usr/bin:/bin:/usr/sbin:/sbin"

case "$label" in *[!A-Za-z0-9.-]* | '' | .* | *..*) echo "Refusing the label $label" >&2; exit 1 ;; esac
for value in "$label" "$worker" "$node" "$path" "$api" "$log" "$profile"; do
  case "$value" in
    *'|'* | *'&'* | *'<'* | *'>'* | *'\'*) echo "Refusing a value with | & < > or \\: $value" >&2; exit 1 ;;
  esac
done

# Waits until launchd has the job no more: a stopping worker first releases its job and closes Chrome.
gone() {
  for _ in $(seq 1 45); do
    launchctl print "$domain/$label" > /dev/null 2>&1 || return 0
    sleep 1
  done
  echo "$label is still stopping after 45 s" >&2
  return 1
}

fill() {
  sed -e "s|__LABEL__|$label|g" -e "s|__WORKER__|$worker|g" -e "s|__NODE__|$node|g" -e "s|__PATH__|$path|g" \
    -e "s|__API_URL__|$api|g" -e "s|__VIEWER_PORT__|$port|g" -e "s|__LOG__|$log|g" -e "s|__PROFILE__|$profile|g" \
    "$here/skin.combo.screenshot-worker.plist.template"
}

if [ "${1:-}" = --print ]; then fill; exit 0; fi
[ $# -eq 0 ] || { echo "Usage: install.sh [--print]" >&2; exit 2; }

[ -f "$checkout/viewer-dist/worker-build.json" ] || { echo "No viewer build: run \"npm run build\" in worker/ first." >&2; exit 1; }

# The viewer's port must be free, or held by this service itself (a reinstall).
mine="$(launchctl print "$domain/$label" 2> /dev/null | sed -nE 's/^[[:space:]]*pid = ([0-9]+)$/\1/p' | head -n 1 || true)"
for pid in $(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2> /dev/null || true); do
  if [ "$pid" != "$mine" ]; then
    echo "Port $port is in use (pid $pid: $(ps -o command= -p "$pid" 2> /dev/null | cut -c 1-80))." >&2
    echo "Stop the worker started by hand (Ctrl+C in its Terminal tab), or what else uses the port, then run install.sh again." >&2
    exit 1
  fi
done

mkdir -p "$logs" "$agents"
fill > "$plist.new"
plutil -lint "$plist.new" > /dev/null

# The old worker releases its job and closes Chrome before its files are replaced and the new one takes the port.
if launchctl bootout "$domain/$label" 2> /dev/null; then gone; fi
for _ in $(seq 1 30); do
  [ -z "$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2> /dev/null || true)" ] && break
  sleep 1
done
mkdir -p "$worker"
rsync -a --delete "$checkout/package.json" "$checkout/src" "$checkout/service" "$checkout/viewer-dist" "$worker/"
mv "$plist.new" "$plist"
launchctl bootstrap "$domain" "$plist"

echo "Installed $label: API $api, viewer on 127.0.0.1:$port"
echo "Runs from: $worker (release $(sed -nE 's/.*"release": *"([^"]+)".*/\1/p' "$worker/viewer-dist/worker-build.json"))"
echo "Log:       $log"
echo "Check it:  $here/status.sh"
