#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="/tmp/coursenotif_monitor_supervisor.pid"

if [[ -f "${PID_FILE}" ]]; then
  existing_pid="$(cat "${PID_FILE}")"
  if [[ -n "${existing_pid}" ]] && kill -0 "${existing_pid}" >/dev/null 2>&1; then
    echo "Monitor supervisor already running (pid=${existing_pid})."
    exit 0
  fi
  rm -f "${PID_FILE}"
fi

nohup bash "${ROOT_DIR}/scripts/monitor-supervisor.sh" >/tmp/coursenotif_monitor_supervisor.nohup.log 2>&1 &
new_pid=$!
echo "${new_pid}" > "${PID_FILE}"

echo "Started monitor supervisor (pid=${new_pid})."
echo "PID file: ${PID_FILE}"
echo "Logs: /tmp/coursenotif_monitor_supervisor.out.log /tmp/coursenotif_monitor_supervisor.err.log"
