#!/usr/bin/env bash
# Start Research Workbench: BFF (8000) + Vite (5173).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=workbench-ports.sh
source "$SCRIPT_DIR/workbench-ports.sh"

SKIP_STOP=false
PIPELINE_DEBUG=false
CHART_EVENTS_API=false
BFF_PORT=8000
WEB_PORT=5173

usage() {
  cat <<'EOF'
Usage: dev-workbench.sh [options]

Options:
  --skip-stop         Do not free ports before start
  --pipeline-debug    Start Vite with VITE_EMA_PIPELINE_DEBUG=true
  --chart-events-api  Start Vite with VITE_CHART_EVENTS_API=1
  --bff-port PORT     BFF port (default: 8000)
  --web-port PORT     Vite port (default: 5173)
  -h, --help          Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-stop)
      SKIP_STOP=true
      shift
      ;;
    --pipeline-debug)
      PIPELINE_DEBUG=true
      shift
      ;;
    --chart-events-api)
      CHART_EVENTS_API=true
      shift
      ;;
    --bff-port)
      BFF_PORT=$2
      shift 2
      ;;
    --web-port)
      WEB_PORT=$2
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

write_err() {
  echo "$1" >&2
  exit 1
}

resolve_python() {
  if [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then
    echo "$REPO_ROOT/.venv/bin/python"
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi
  return 1
}

resolve_npm() {
  if command -v npm >/dev/null 2>&1; then
    command -v npm
    return 0
  fi

  local fnm_bin="$HOME/Library/Application Support/fnm/fnm"
  if [[ -x "$fnm_bin" ]]; then
    # fnm may not be on PATH in fresh Terminal windows; load its env first.
    eval "$("$fnm_bin" env --shell bash)"
    if command -v npm >/dev/null 2>&1; then
      command -v npm
      return 0
    fi
  fi

  return 1
}

start_terminal_session() {
  local title=$1
  local script_body=$2
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/workbench.XXXXXX")"
  {
    echo '#!/usr/bin/env bash'
    printf 'echo -ne "\\033]0;%s\\007"\n' "$title"
    echo "$script_body"
  } >"$tmp"
  chmod +x "$tmp"
  osascript -e "tell application \"Terminal\" to do script \"bash '$tmp'\"" >/dev/null
}

# --- Preflight ---
if ! PYTHON="$(resolve_python)"; then
  write_err "Python not found. Install Python 3.11+ and add it to PATH, or create .venv in repo root."
fi

if ! NPM="$(resolve_npm)"; then
  write_err "npm not found. Install Node.js (e.g. fnm/brew) and ensure npm is on PATH."
fi

if ! py_ver="$("$PYTHON" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>&1)"; then
  write_err "Python not found. Install Python 3.11+ and add it to PATH."
fi

py_major="${py_ver%%.*}"
py_minor="${py_ver#*.}"
py_minor="${py_minor%%.*}"
if ((py_major < 3 || (py_major == 3 && py_minor < 11))); then
  write_err "Python 3.11+ required (found $py_ver). Install Python and retry."
fi

if ! "$PYTHON" -c "import fastapi, uvicorn" 2>/dev/null; then
  write_err 'Missing workbench-api deps. Run: source .venv/bin/activate && pip install -e ".[dev,workbench-api,research]"'
fi

if ! "$PYTHON" -c "import pandas" 2>/dev/null; then
  write_err 'Missing research deps for BFF. Run: source .venv/bin/activate && pip install -e ".[dev,workbench-api,research]"'
fi

if [[ ! -d "$REPO_ROOT/frontend/node_modules" ]]; then
  write_err "frontend/node_modules missing. Run: cd frontend && npm install"
fi

# --- Stop ports ---
if [[ "$SKIP_STOP" != true ]]; then
  echo "Freeing ports $BFF_PORT, $WEB_PORT..."
  busy="$(stop_ports_with_retry "$BFF_PORT" "$WEB_PORT" || true)"
  if [[ -n "$busy" ]]; then
    write_err "Port(s) still in use: $(echo "$busy" | tr '\n' ', ' | sed 's/, $//'). Run scripts/stop-workbench.sh or close processes manually."
  fi
fi

# --- Start BFF (no --reload: single process per port) ---
bff_body=$(cat <<EOF
cd '$REPO_ROOT' || exit 1
printf '%s\n' 'Research Workbench BFF  http://127.0.0.1:$BFF_PORT'
'$PYTHON' -m uvicorn research_api.main:app --host 127.0.0.1 --port $BFF_PORT
EOF
)
start_terminal_session "Research Workbench BFF" "$bff_body"
echo "Starting BFF on port $BFF_PORT..."

# --- Health-check: split market endpoints + legacy chart-bundle ---
health_ok=false
deadline=$((SECONDS + 15))
while ((SECONDS < deadline)); do
  sleep 1
  health_code=0
  "$PYTHON" - "$BFF_PORT" <<'PY' || health_code=$?
import json
import sys
import urllib.error
import urllib.request

port = sys.argv[1]
try:
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/openapi.json", timeout=3) as resp:
        spec = json.load(resp)
except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
    sys.exit(1)

params = [
    p["name"]
    for p in spec.get("paths", {})
    .get("/api/market/chart-bundle", {})
    .get("get", {})
    .get("parameters", [])
]
if "ema_fast" in params and "ema_period" not in params:
    sys.exit(0)
if "ema_period" in params:
    sys.exit(2)
sys.exit(1)
PY

  case "$health_code" in
    0)
      health_ok=true
      break
      ;;
    2)
      echo "Port $BFF_PORT serves OLD BFF (ema_period). Stopping listeners..."
      stop_ports_with_retry "$BFF_PORT" >/dev/null || true
      write_err "Stale BFF on port $BFF_PORT. Run scripts/stop-workbench.sh, close zombie python processes, then dev-workbench.sh again."
      ;;
  esac
done

if [[ "$health_ok" != true ]]; then
  stop_ports_with_retry "$BFF_PORT" >/dev/null || true
  write_err "BFF did not become healthy on port $BFF_PORT within 15s (expected ema_fast in chart-bundle OpenAPI)."
fi

echo "BFF OK (chart-bundle: ema_fast / ema_anchor / ema_slow)"

fnm_preamble=''
if [[ -x "$HOME/Library/Application Support/fnm/fnm" ]]; then
  fnm_preamble='if [[ -x "$HOME/Library/Application Support/fnm/fnm" ]]; then eval "$("$HOME/Library/Application Support/fnm/fnm" env --shell bash)"; fi'
fi

# --- Start Vite ---
vite_title="Research Workbench UI"
vite_env_exports=()
vite_env_hints=()
if [[ "$PIPELINE_DEBUG" == true ]]; then
  vite_title+=" (pipeline debug)"
  vite_env_exports+=("export VITE_EMA_PIPELINE_DEBUG=true")
  vite_env_hints+=("VITE_EMA_PIPELINE_DEBUG=true - use __pipelineDebugFlush in DevTools")
fi
if [[ "$CHART_EVENTS_API" == true ]]; then
  vite_title+=" (chart-events)"
  vite_env_exports+=("export VITE_CHART_EVENTS_API=1")
  vite_env_hints+=("VITE_CHART_EVENTS_API=1 - /chart-events display path enabled")
fi

vite_env_block=""
if ((${#vite_env_exports[@]} > 0)); then
  vite_env_block="$(printf '%s\n' "${vite_env_exports[@]}")"
fi
vite_hint_block=""
if ((${#vite_env_hints[@]} > 0)); then
  vite_hint_block="$(printf "printf '%%s\\n' '%s'\n" "${vite_env_hints[@]}")"
fi

vite_body=$(cat <<EOF
cd '$REPO_ROOT/frontend' || exit 1
$fnm_preamble
printf '%s\n' 'Research Workbench UI  http://127.0.0.1:$WEB_PORT'
$vite_env_block
$vite_hint_block
npm run dev -- --host 127.0.0.1 --port $WEB_PORT --strictPort
EOF
)

start_terminal_session "$vite_title" "$vite_body"

echo ""
echo "Workbench started."
echo "  UI:   http://127.0.0.1:$WEB_PORT/"
echo "  BFF:  http://127.0.0.1:$BFF_PORT/docs"
echo "  Stop: scripts/stop-workbench.sh"
echo "  After backend code changes: stop, then dev again (BFF has no auto-reload)."
if [[ "$PIPELINE_DEBUG" == true ]]; then
  echo "  Pipeline debug: DevTools -> __pipelineDebugHelp() / __pipelineDebugFlush('scenario')"
  echo "  See debug/README.md"
fi
if [[ "$CHART_EVENTS_API" == true ]]; then
  echo "  Chart-events API: VITE_CHART_EVENTS_API=1 (expect api.fetchChartEvents in pipeline export)"
fi
