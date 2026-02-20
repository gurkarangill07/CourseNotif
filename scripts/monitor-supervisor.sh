#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_LOG="/tmp/coursenotif_monitor_supervisor.out.log"
ERR_LOG="/tmp/coursenotif_monitor_supervisor.err.log"
SLEEP_SECONDS="${MONITOR_SUPERVISOR_RESTART_SECONDS:-5}"

while true; do
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] starting worker" >> "${OUT_LOG}"
  set +e
  bash "${ROOT_DIR}/scripts/with-env.sh" node "${ROOT_DIR}/src/worker.js" >> "${OUT_LOG}" 2>> "${ERR_LOG}"
  exit_code=$?
  set -e
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] worker exited with code ${exit_code}; restarting in ${SLEEP_SECONDS}s" >> "${OUT_LOG}"
  sleep "${SLEEP_SECONDS}"
done
