"""CLI entrypoint for ema_pullback manual-variant research runs.

Run from repo root (after ``pip install -e ".[research]"``):

    python research/strategies/ema_pullback/run.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running this file without PYTHONPATH tricks.
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from research.strategies.ema_pullback.cli import config_from_args, parse_args  # noqa: E402
from research.strategies.ema_pullback.execution.runner import (  # noqa: E402
    run_manual_variants,
)


def main() -> None:
    run_manual_variants(config_from_args(parse_args()))


if __name__ == "__main__":
    main()
