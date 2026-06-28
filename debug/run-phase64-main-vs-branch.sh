#!/usr/bin/env bash
# Phase 6.4 main vs branch market-load diagnostic orchestrator.
# Alternates: main-run1 → branch-run1 → main-run2 → branch-run2
#
# Usage: ./debug/run-phase64-main-vs-branch.sh
# Optional: PHASE64_ONLY=main-run1,branch-run1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BFF_PORT=8000
WEB_PORT=5173
BFF_PID=""
VITE_PID=""
ORIG_BRANCH=""
STASHED=false
BRANCH_NAME="new-workbench-chart-runtime-v2"

stop_port() {
  local port=$1
  local pids
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && kill -9 "$pid" 2>/dev/null || true
    done <<< "$pids"
  fi
}

stop_workbench() {
  echo "=== Stopping workbench ==="
  if [[ -x "$REPO_ROOT/scripts/stop-workbench.sh" ]]; then
    "$REPO_ROOT/scripts/stop-workbench.sh" || true
  fi
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
  stop_port "$BFF_PORT"
  stop_port "$WEB_PORT"
  sleep 1
  if lsof -nP -iTCP:"$BFF_PORT" -sTCP:LISTEN >/dev/null 2>&1 || lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "ERROR: ports still in use" >&2
    lsof -i :"$BFF_PORT" || true
    lsof -i :"$WEB_PORT" || true
    exit 1
  fi
  echo "Ports $BFF_PORT, $WEB_PORT are free"
}

resolve_python() {
  if [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then
    echo "$REPO_ROOT/.venv/bin/python"
  else
    command -v python3 || command -v python
  fi
}

wait_bff_healthy() {
  local python="$1"
  local deadline=$((SECONDS + 30))
  while ((SECONDS < deadline)); do
    if "$python" - "$BFF_PORT" <<'PY' 2>/dev/null; then
import json, sys, urllib.request
port = sys.argv[1]
with urllib.request.urlopen(f"http://127.0.0.1:{port}/openapi.json", timeout=3) as resp:
    spec = json.load(resp)
params = [p["name"] for p in spec.get("paths", {}).get("/api/market/chart-bundle", {}).get("get", {}).get("parameters", [])]
sys.exit(0 if "ema_fast" in params and "ema_period" not in params else 1)
PY
      return 0
    fi
    sleep 1
  done
  echo "ERROR: BFF not healthy" >&2
  return 1
}

wait_vite_ready() {
  local deadline=$((SECONDS + 60))
  while ((SECONDS < deadline)); do
    curl -sf "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "ERROR: Vite not ready" >&2
  return 1
}

start_workbench() {
  local python
  python="$(resolve_python)"
  stop_workbench

  (
    cd "$REPO_ROOT"
    exec "$python" -m uvicorn research_api.main:app --host 127.0.0.1 --port "$BFF_PORT"
  ) >/dev/null 2>&1 &
  BFF_PID=$!
  wait_bff_healthy "$python"

  (
    cd "$REPO_ROOT/frontend"
    if [[ -x "$HOME/Library/Application Support/fnm/fnm" ]]; then
      eval "$("$HOME/Library/Application Support/fnm/fnm" env --shell bash)"
    fi
    env VITE_EMA_PIPELINE_DEBUG=true npm run dev -- --host 127.0.0.1 --port "$WEB_PORT" --strictPort
  ) >/dev/null 2>&1 &
  VITE_PID=$!
  wait_vite_ready
  echo "Workbench ready on $(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD) @ $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
}

checkout_branch() {
  local target=$1
  cd "$REPO_ROOT"
  git checkout "$target" --quiet
}

run_capture() {
  local git_branch=$1
  local run=$2
  echo "=== Capture $git_branch run $run ==="
  (
    cd "$REPO_ROOT/frontend"
    node ../debug/capture-phase64-main-vs-branch-smoke.mjs --git-branch "$git_branch" --run "$run"
  )
}

ALL_SCENARIOS=(
  "main:1"
  "${BRANCH_NAME}:1"
  "main:2"
  "${BRANCH_NAME}:2"
)

SCENARIOS=()
if [[ -n "${PHASE64_ONLY:-}" ]]; then
  IFS=',' read -ra ONLY <<<"$PHASE64_ONLY"
  for item in "${ONLY[@]}"; do
    item="$(echo "$item" | tr -d ' ')"
    case "$item" in
      main-run1) SCENARIOS+=("main:1") ;;
      branch-run1) SCENARIOS+=("${BRANCH_NAME}:1") ;;
      main-run2) SCENARIOS+=("main:2") ;;
      branch-run2) SCENARIOS+=("${BRANCH_NAME}:2") ;;
      *) echo "Unknown PHASE64_ONLY: $item" >&2; exit 1 ;;
    esac
  done
else
  SCENARIOS=("${ALL_SCENARIOS[@]}")
fi

cleanup() {
  stop_workbench
  cd "$REPO_ROOT"
  if [[ -n "$ORIG_BRANCH" ]]; then
    git checkout "$ORIG_BRANCH" --quiet 2>/dev/null || true
  fi
  if [[ "$STASHED" == true ]]; then
    git stash pop --quiet 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "$REPO_ROOT"
ORIG_BRANCH="$(git branch --show-current)"
echo "Original branch: $ORIG_BRANCH"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Stashing local changes before branch switches …"
  git stash push -u -m "phase64-main-vs-branch-diagnostic" -- \
    frontend/src/features/chart/ChartPanel.tsx \
    frontend/src/features/workbenchChartRuntime/phase63AModelAdapterBridge.ts \
    frontend/src/features/workbenchChartRuntime/phase63BRenderWindowBridge.ts \
    frontend/src/features/workbenchChartRuntime/phase63FEmaOverlayDiagnostics.ts \
    frontend/src/features/workbenchChartRuntime/phase63FMarketLoadBridge.ts \
    frontend/src/shared/diagnostics/pipelineDebug.ts 2>/dev/null || git stash push -m "phase64-main-vs-branch-diagnostic"
  STASHED=true
fi

for scenario in "${SCENARIOS[@]}"; do
  git_branch="${scenario%%:*}"
  run="${scenario##*:}"
  if [[ "$git_branch" == "main" ]]; then
    checkout_branch main
  else
    checkout_branch "$BRANCH_NAME"
  fi
  start_workbench
  run_capture "$git_branch" "$run"
done

echo "=== All captures complete ==="
echo "Artifacts: $REPO_ROOT/debug/reports/phase64-main-vs-branch/"
