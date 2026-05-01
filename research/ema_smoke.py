"""Phase 4 smoke: SQLite candles -> pandas EMA -> vectorbt -> metrics.

Thin entrypoint; pipeline lives in ``research/strategies/ema_atr_directional/run.py``.

Run from repo root (after ``pip install -e ".[research]"``):

    python research/ema_smoke.py

Uses ``DATA_ENGINE_DB_PATH`` like the rest of the engine (see ``Settings``).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow ``python research/ema_smoke.py`` without PYTHONPATH tricks.
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from research.strategies.ema_atr_directional.run import (
    config_from_args,
    parse_args,
    run_with_config,
)


def main() -> None:
    """Same CLI as historical ``ema_smoke``; delegates to family runner."""

    run_with_config(config_from_args(parse_args()))


if __name__ == "__main__":
    main()
