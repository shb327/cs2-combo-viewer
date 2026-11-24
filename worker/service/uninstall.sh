#!/bin/bash
# Stops the screenshot worker's LaunchAgent and removes it with the copy it ran from (the job in hand is released).
# Logs and the Chrome profile are kept.
# WORKER_SERVICE_LABEL: another label than skin.combo.screenshot-worker.
set -euo pipefail

label="${WORKER_SERVICE_LABEL:-skin.combo.screenshot-worker}"
case "$label" in *[!A-Za-z0-9.-]* | '' | .* | *..*) echo "Refusing the label $label" >&2; exit 1 ;; esac
copy="$HOME/Library/Application Support/combo-skin/${label#skin.combo.}"
plist="$HOME/Library/LaunchAgents/$label.plist"
domain="gui/$(id -u)"

# Waits until launchd has the job no more: a stopping worker first releases its job and closes Chrome.
gone() {
  for _ in $(seq 1 45); do
    launchctl print "$domain/$label" > /dev/null 2>&1 || return 0
    sleep 1
  done
  echo "$label is still stopping after 45 s" >&2
  return 1
}

if launchctl bootout "$domain/$label" 2> /dev/null; then gone; echo "Stopped $label"; else echo "$label was not loaded"; fi
if [ -f "$plist" ]; then rm "$plist"; echo "Removed $plist"; fi
if [ -f "$copy/service/start.sh" ]; then rm -r "$copy"; echo "Removed $copy"; fi
echo "Logs kept in $HOME/Library/Logs/combo-skin/"
