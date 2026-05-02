"""Shared CLI argument parsing for ema_pullback entrypoints."""

from __future__ import annotations

import argparse
from dataclasses import replace
from pathlib import Path
from typing import Sequence

from research.strategies.ema_pullback.config import DEFAULT_CONFIG, StrategyConfig


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="EMA pullback research runner for component-aware manual variants."
    )
    p.add_argument("--symbol", default=DEFAULT_CONFIG.symbol, help="Symbol in DB")
    p.add_argument("--tf", default=DEFAULT_CONFIG.timeframe, help="Timeframe")
    p.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="Override SQLite path (default: Settings / DATA_ENGINE_DB_PATH)",
    )
    p.add_argument("--init-cash", type=float, default=DEFAULT_CONFIG.init_cash, help="Initial cash")
    p.add_argument("--fees", type=float, default=DEFAULT_CONFIG.fees, help="Per-trade fee")
    p.add_argument("--slippage", type=float, default=DEFAULT_CONFIG.slippage, help="Per-trade slippage")
    return p.parse_args(argv)


def config_from_args(args: argparse.Namespace) -> StrategyConfig:
    return replace(
        DEFAULT_CONFIG,
        symbol=args.symbol.strip().upper(),
        timeframe=args.tf.strip(),
        db_path=args.db_path,
        init_cash=args.init_cash,
        fees=args.fees,
        slippage=args.slippage,
    )
