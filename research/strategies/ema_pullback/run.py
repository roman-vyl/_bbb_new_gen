"""CLI entrypoint for ema_pullback research runs.

EMA pullback research runner for component-aware manual variants.
It runs fixed/manual variants for one ema_pullback family over shared candles.
EMA periods are defined in ``variants.py`` (not via CLI), while component ids
come from ``StrategyConfig`` defaults/selection.

Run from repo root (after ``pip install -e ".[research]"``):

    python research/strategies/ema_pullback/run.py
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any, Sequence

# Allow running this file without PYTHONPATH tricks.
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from research.strategies.ema_pullback.config import (  # noqa: E402
    DEFAULT_CONFIG,
    StrategyConfig,
)
from research.strategies.ema_pullback.execution.backtest import (  # noqa: E402
    ensure_finite_metric,
    run_strategy_instance,
)
from research.strategies.ema_pullback.execution.data_loader import (  # noqa: E402
    load_candles_once,
)
from research.strategies.ema_pullback.execution.report_table import (  # noqa: E402
    comparison_row,
    print_comparison_table,
)
from research.strategies.ema_pullback.execution.runner import (  # noqa: E402
    run_manual_variants,
)
from research.strategies.ema_pullback.instance import StrategyInstance  # noqa: E402


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


def run_with_config(cfg: StrategyConfig) -> None:
    """Historical single-config smoke runner, now using the shared backend."""

    instance = StrategyInstance.from_config(cfg)
    loaded = load_candles_once(instance.config)
    result = run_strategy_instance(instance, loaded.ohlcv)

    print(
        f"family={instance.config.family} variant={result.variant} "
        f"config_id={result.config_id} "
        f"symbol={result.symbol} timeframe={result.timeframe} "
        f"candles={loaded.candles_count}"
    )
    print("vectorbt_portfolio.sharpe_ratio (freq-aware):", result.metrics.sharpe)
    print("vectorbt_portfolio.trades.profit_factor:", result.metrics.profit_factor)
    print("vectorbt_portfolio.max_drawdown:", result.metrics.max_drawdown)
    print("status=ok")


def _load_candles_once(cfg: StrategyConfig) -> Any:
    """Compatibility wrapper for historical private helper imports."""

    return load_candles_once(cfg)


def _comparison_row(variant_result: Any) -> dict[str, float | str]:
    """Compatibility wrapper for historical private helper imports."""

    return comparison_row(variant_result)


def _run_instance_on_ohlcv(instance: StrategyInstance, ohlcv: Any) -> dict[str, Any]:
    """Compatibility wrapper returning the historical Stage 9 payload dict."""

    return run_strategy_instance(instance, ohlcv).to_payload()


def _print_comparison_table(rows: list[dict[str, float | str]]) -> None:
    """Compatibility wrapper for historical private helper imports."""

    print_comparison_table(rows)


def main() -> None:
    run_manual_variants(config_from_args(parse_args()))


if __name__ == "__main__":
    main()
