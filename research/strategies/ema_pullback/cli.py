"""Shared CLI argument parsing for ema_pullback entrypoints."""

from __future__ import annotations

import argparse
from dataclasses import replace
from pathlib import Path
from typing import Sequence

from research.strategies.ema_pullback.config import DEFAULT_EXECUTION_CONFIG, ExecutionConfig


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="EMA pullback Stage 10 strategy-spec runner."
    )
    p.add_argument("--symbol", default=DEFAULT_EXECUTION_CONFIG.symbol, help="Symbol in DB")
    p.add_argument("--tf", default=DEFAULT_EXECUTION_CONFIG.base_timeframe, help="Timeframe")
    p.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="Override SQLite path (default: Settings / DATA_ENGINE_DB_PATH)",
    )
    p.add_argument(
        "--init-cash",
        type=float,
        default=DEFAULT_EXECUTION_CONFIG.init_cash,
        help="Initial cash",
    )
    p.add_argument("--fees", type=float, default=DEFAULT_EXECUTION_CONFIG.fees, help="Per-trade fee")
    p.add_argument(
        "--slippage",
        type=float,
        default=DEFAULT_EXECUTION_CONFIG.slippage,
        help="Per-trade slippage",
    )
    return p.parse_args(argv)


def config_from_args(args: argparse.Namespace) -> ExecutionConfig:
    return replace(
        DEFAULT_EXECUTION_CONFIG,
        symbol=args.symbol.strip().upper(),
        base_timeframe=args.tf.strip(),
        db_path=args.db_path,
        init_cash=args.init_cash,
        fees=args.fees,
        slippage=args.slippage,
    )
