#!/usr/bin/env bash
# Phase 6.4 A/B perf smoke orchestrator.
# Alternates OFF/ON with full workbench restart + fresh Playwright context per run.
#
# Usage: ./debug/run-phase64-perf-ab.sh
# Optional: PHASE64_ONLY=OFF1,ON2  (comma-separated labels)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../scripts/workbench-ports.sh
source "$REPO_ROOT/scripts/workbench-ports.sh"

BFF_PORT=8000
WEB_PORT=5173
BFF_PID=""
VITE_PID=""
BFF_LOG=""
VITE_LOG=""

cleanup_processes() {
  if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
  fi
  if [[ -n "$BFF_PID" ]] && kill -0 "$BFF_PID" 2>/dev/null; then
    kill "$BFF_PID" 2>/dev/null || true
    wait "$BFF_PID" 2>/dev/null || true
  fi
  VITE_PID=""
  BFF_PID=""
}

stop_workbench() {
  echo "=== Stopping workbench ==="
  "$REPO_ROOT/scripts/stop-workbench.sh" || true
  cleanup_processes
  busy="$(stop_ports_with_retry "$BFF_PORT" "$WEB_PORT" || true)"
  if [[ -n "$busy" ]]; then
    echo "Ports still busy after stop: $busy — force killing listeners"
    stop_ports_with_retry "$BFF_PORT" "$WEB_PORT" >/dev/null || true
    sleep 1
    busy="$(stop_ports_with_retry "$BFF_PORT" "$WEB_PORT" || true)"
    if [[ -n "$busy" ]]; then
      echo "ERROR: ports still in use: $busy" >&2
      exit 1
    fi
  fi
  echo "Ports $BFF_PORT, $WEB_PORT are free"
}

resolve_python() {
  if [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then
    echo "$REPO_ROOT/.venv/bin/python"
    return 0
  fi
  command -v python3 || command -v python
}

wait_bff_healthy() {
  local python="$1"
  local deadline=$((SECONDS + 30))
  while ((SECONDS < deadline)); do
    if "$python" - "$BFF_PORT" <<'PY' 2>/dev/null; then
import json
import sys
import urllib.request

port = sys.argv[1]
with urllib.request.urlopen(f"http://127.0.0.1:{port}/openapi.json", timeout=3) as resp:
    spec = json.load(resp)
params = [
    p["name"]
    for p in spec.get("paths", {})
    .get("/api/market/chart-bundle", {})
    .get("get", {})
    .get("parameters", [])
]
if "ema_fast" in params and "ema_period" not in params:
    sys.exit(0)
sys.exit(1)
PY
      return 0
    fi
    sleep 1
  done
  echo "ERROR: BFF not healthy on port $BFF_PORT within 30s" >&2
  return 1
}

wait_vite_ready() {
  local deadline=$((SECONDS + 60))
  while ((SECONDS < deadline)); do
    if curl -sf "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: Vite not ready on port $WEB_PORT within 60s" >&2
  return 1
}

start_workbench() {
  local mode=$1
  local python
  python="$(resolve_python)"

  stop_workbench

  BFF_LOG="$(mktemp "${TMPDIR:-/tmp}/phase64-bff-XXXXXX")"
  VITE_LOG="$(mktemp "${TMPDIR:-/tmp}/phase64-vite-XXXXXX")"

  echo "=== Starting BFF (mode=$mode) ==="
  (
    cd "$REPO_ROOT"
    exec "$python" -m uvicorn research_api.main:app --host 127.0.0.1 --port "$BFF_PORT"
  ) >"$BFF_LOG" 2>&1 &
  BFF_PID=$!

  wait_bff_healthy "$python"

  echo "=== Starting Vite (mode=$mode) ==="
  local vite_env=(env)
  vite_env+=(VITE_EMA_PIPELINE_DEBUG=true)
  if [[ "$mode" == "ON" ]]; then
    vite_env+=(VITE_CHART_EVENTS_API=1)
  fi

  (
    cd "$REPO_ROOT/frontend"
    if [[ -x "$HOME/Library/Application Support/fnm/fnm" ]]; then
      eval "$("$HOME/Library/Application Support/fnm/fnm" env --shell bash)"
    fi
    "${vite_env[@]}" npm run dev -- --host 127.0.0.1 --port "$WEB_PORT" --strictPort
  ) >"$VITE_LOG" 2>&1 &
  VITE_PID=$!

  wait_vite_ready
  echo "Workbench ready (BFF pid=$BFF_PID, Vite pid=$VITE_PID)"
}

run_capture() {
  local mode=$1
  local run=$2
  echo "=== Capture $mode run $run ==="
  (
    cd "$REPO_ROOT/frontend"
    node ../debug/capture-phase64-events-vs-trace-perf-smoke.mjs --mode "$mode" --run "$run"
  )
}

ALL_SCENARIOS=(
  "OFF:1"
  "ON:1"
  "OFF:2"
  "ON:2"
  "OFF:3"
  "ON:3"
)

SCENARIOS=()
if [[ -n "${PHASE64_ONLY:-}" ]]; then
  IFS=',' read -ra ONLY_LABELS <<<"$PHASE64_ONLY"
  for label in "${ONLY_LABELS[@]}"; do
    label="$(echo "$label" | tr '[:lower:]' '[:upper:]' | tr -d ' ')"
    case "$label" in
      OFF1) SCENARIOS+=("OFF:1") ;;
      ON1) SCENARIOS+=("ON:1") ;;
      OFF2) SCENARIOS+=("OFF:2") ;;
      ON2) SCENARIOS+=("ON:2") ;;
      OFF3) SCENARIOS+=("OFF:3") ;;
      ON3) SCENARIOS+=("ON:3") ;;
      *) echo "Unknown PHASE64_ONLY label: $label" >&2; exit 1 ;;
    esac
  done
else
  SCENARIOS=("${ALL_SCENARIOS[@]}")
fi

trap 'cleanup_processes; stop_workbench' EXIT

echo "Branch: $(git -C "$REPO_ROOT" branch --show-current)"
echo "Commit: $(git -C "$REPO_ROOT" rev-parse HEAD)"
echo "Scenarios: ${SCENARIOS[*]}"

for scenario in "${SCENARIOS[@]}"; do
  mode="${scenario%%:*}"
  run="${scenario##*:}"
  start_workbench "$mode"
  run_capture "$mode" "$run"
done

echo "=== All captures complete ==="
echo "Raw JSON: $REPO_ROOT/debug/reports/phase64-perf/"
