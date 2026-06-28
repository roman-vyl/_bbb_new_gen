#!/usr/bin/env bash
# Stop Research Workbench dev servers (BFF + Vite).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=workbench-ports.sh
source "$SCRIPT_DIR/workbench-ports.sh"

ports=(8000 5173 8001)
echo "Stopping listeners on ports: ${ports[*]}..."

busy="$(stop_ports_with_retry "${ports[@]}" || true)"
if [[ -n "$busy" ]]; then
  echo "Still listening: $(echo "$busy" | tr '\n' ', ' | sed 's/, $//'). Close processes manually and run again." >&2
  exit 1
fi

echo "Workbench stopped."
