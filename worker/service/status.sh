#!/bin/bash
# The screenshot worker's LaunchAgent: loaded or not, running or not, its last exit, and the log's last lines.
# Usage: status.sh [lines]. WORKER_SERVICE_LABEL: another label than skin.combo.screenshot-worker.
set -uo pipefail

label="${WORKER_SERVICE_LABEL:-skin.combo.screenshot-worker}"
lines="${1:-15}"
log="$HOME/Library/Logs/combo-skin/${label#skin.combo.}.log"
domain="gui/$(id -u)"

if info="$(launchctl print "$domain/$label" 2> /dev/null)"; then
  field() { printf '%s\n' "$info" | sed -nE "s/^[[:space:]]*$1 = (.*)$/\\1/p" | head -n 1; }
  state="$(field state)"
  pid="$(field pid)"
  echo "$label: loaded, ${state:-unknown}${pid:+ (pid $pid)}, runs: $(field runs), last exit: $(field 'last exit code')"
else
  echo "$label: not loaded"
fi
if [ -f "$log" ]; then
  echo "--- $log"
  tail -n "$lines" "$log"
fi
