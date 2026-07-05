#!/usr/bin/env bash
# Same as dev-workbench.sh, but Vite starts with VITE_EMA_PIPELINE_DEBUG=true.
# Pass --chart-events-api for Phase 6.4 chart-events smoke (forwards to dev-workbench.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/dev-workbench.sh" --pipeline-debug "$@"
