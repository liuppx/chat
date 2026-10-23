#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

ACTION="${1:-start}"
PID_FILE="${ROOT_DIR}/.chat.pid"
LOG_FILE="${ROOT_DIR}/server.log"
SERVER_ENTRY="${ROOT_DIR}/server.js"
STOP_TIMEOUT_SECONDS="${STOP_TIMEOUT_SECONDS:-30}"
FORCE_STOP_TIMEOUT_SECONDS="${FORCE_STOP_TIMEOUT_SECONDS:-5}"

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: node is required but was not found in PATH." >&2
    exit 1
  fi
}

load_env() {
  local env_template="${ROOT_DIR}/.env.template"
  local env_file="${ROOT_DIR}/.env"

  if [ ! -f "${env_file}" ] && [ -f "${env_template}" ]; then
    cp "${env_template}" "${env_file}"
  fi

  if [ -f "${env_file}" ]; then
    set -a
    . "${env_file}"
    set +a
  fi
}

is_running() {
  local pid="$1"
  if [ -z "${pid}" ]; then
    return 1
  fi
  ps -p "${pid}" -o stat= 2>/dev/null | grep -qv '^Z'
}

validate_stop_timeouts() {
  [[ "${STOP_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] || { echo "Invalid STOP_TIMEOUT_SECONDS: ${STOP_TIMEOUT_SECONDS}" >&2; exit 1; }
  [[ "${FORCE_STOP_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] || { echo "Invalid FORCE_STOP_TIMEOUT_SECONDS: ${FORCE_STOP_TIMEOUT_SECONDS}" >&2; exit 1; }
}

find_pid() {
  if [ -f "${PID_FILE}" ]; then
    cat "${PID_FILE}" 2>/dev/null || true
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"${PORT:-3020}" 2>/dev/null | head -n 1 || true
  fi
}

start_server() {
  require_node
  load_env

  export NODE_ENV=production
  export PORT="${PORT:-3020}"

  if [ ! -f "${SERVER_ENTRY}" ]; then
    echo "Error: server.js not found at ${SERVER_ENTRY}" >&2
    exit 1
  fi

  local pid
  pid="$(find_pid)"
  if is_running "${pid}"; then
    echo "Already running (pid: ${pid})"
    exit 0
  fi
  if [ -n "${pid}" ] && [ -f "${PID_FILE}" ]; then
    rm -f "${PID_FILE}"
  fi

  cd "${ROOT_DIR}"
  nohup node "${SERVER_ENTRY}" > "${LOG_FILE}" 2>&1 &
  echo $! > "${PID_FILE}"
  echo "Started (pid: $(cat "${PID_FILE}"))"
}

stop_server() {
  validate_stop_timeouts
  local pid
  pid="$(find_pid)"
  if ! is_running "${pid}"; then
    echo "Not running"
    [ -f "${PID_FILE}" ] && rm -f "${PID_FILE}"
    return 0
  fi

  kill -TERM "${pid}" >/dev/null 2>&1 || true
  for (( waited = 0; waited < STOP_TIMEOUT_SECONDS; waited++ )); do
    if ! is_running "${pid}"; then
      rm -f "${PID_FILE}"
      echo "Stopped"
      return 0
    fi
    sleep 1
  done

  echo "Graceful stop timed out after ${STOP_TIMEOUT_SECONDS}s; sending SIGKILL" >&2
  kill -KILL "${pid}" >/dev/null 2>&1 || true
  for (( waited = 0; waited < FORCE_STOP_TIMEOUT_SECONDS; waited++ )); do
    if ! is_running "${pid}"; then
      rm -f "${PID_FILE}"
      echo "Stopped (forced)"
      return 0
    fi
    sleep 1
  done

  if is_running "${pid}"; then
    echo "Error: chat process ${pid} did not exit after SIGKILL" >&2
    return 1
  fi
  rm -f "${PID_FILE}"
  echo "Stopped (forced)"
}

case "${ACTION}" in
  start)
    start_server
    ;;
  stop)
    stop_server
    ;;
  restart)
    if ! stop_server; then
      exit 1
    fi
    start_server
    ;;
  *)
    echo "Usage: $0 {start|stop|restart}"
    exit 1
    ;;
esac
