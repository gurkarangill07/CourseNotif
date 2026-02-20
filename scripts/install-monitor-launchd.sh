#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_DIR="${HOME}/Library/LaunchAgents"
LABEL="com.coursenotif.monitor"
PLIST_PATH="${LAUNCH_DIR}/${LABEL}.plist"
GUI_DOMAIN="gui/$(id -u)"
RUN_CMD="set -a; source \"${ROOT_DIR}/.env.local\"; set +a; exec node \"${ROOT_DIR}/src/worker.js\""

mkdir -p "${LAUNCH_DIR}"

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>${RUN_CMD}</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>

  <key>StandardOutPath</key>
  <string>/tmp/coursenotif_monitor.out.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/coursenotif_monitor.err.log</string>
</dict>
</plist>
EOF

if launchctl print "${GUI_DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "${GUI_DOMAIN}/${LABEL}" || true
fi

launchctl bootstrap "${GUI_DOMAIN}" "${PLIST_PATH}"
launchctl enable "${GUI_DOMAIN}/${LABEL}" || true
launchctl kickstart -k "${GUI_DOMAIN}/${LABEL}"

echo "Installed and started ${LABEL}"
echo "plist: ${PLIST_PATH}"
echo "status: launchctl print ${GUI_DOMAIN}/${LABEL}"
