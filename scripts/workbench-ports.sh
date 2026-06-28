#!/usr/bin/env bash
# Shared port cleanup for Research Workbench (macOS).
# Source: . "$(dirname "${BASH_SOURCE[0]}")/workbench-ports.sh"

test_port_listening() {
  local port=$1
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

stop_port_listeners() {
  local port=$1
  local pids
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -z "$pids" ]]; then
    return 0
  fi
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && kill -9 "$pid" 2>/dev/null || true
  done <<< "$pids"
}

stop_ports_with_retry() {
  local ports=("$@")
  local attempt port still_busy=()

  for ((attempt = 1; attempt <= 2; attempt++)); do
    for port in "${ports[@]}"; do
      stop_port_listeners "$port"
    done
    if ((attempt < 2)); then
      sleep 1
    fi
  done

  for port in "${ports[@]}"; do
    if test_port_listening "$port"; then
      still_busy+=("$port")
    fi
  done

  if ((${#still_busy[@]} > 0)); then
    printf '%s\n' "${still_busy[@]}"
  fi
}
