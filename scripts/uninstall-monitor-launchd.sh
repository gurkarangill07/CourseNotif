#!/usr/bin/env bash
set -euo pipefail

LABEL="com.coursenotif.monitor"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
GUI_DOMAIN="gui/$(id -u)"

if launchctl print "${GUI_DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "${GUI_DOMAIN}/${LABEL}" || true
fi

rm -f "${PLIST_PATH}"

echo "Uninstalled ${LABEL}"
