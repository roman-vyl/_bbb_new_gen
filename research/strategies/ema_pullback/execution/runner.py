"""Stage 10 orchestration for active strategy specs."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from research.strategies.ema_pullback.config import ExecutionConfig
from research.strategies.ema_pullback.execution.backtest import run_strategy_spec
from research.strategies.ema_pullback.execution.data_loader import load_candles_once
from research.strategies.ema_pullback.execution.report_table import (
    comparison_row,
    print_comparison_table,
)
from research.strategies.ema_pullback.execution.results import (
    build_research_run_payload,
    build_run_id,
    write_research_results,
)
from research.strategies.ema_pullback.spec_instances import active_strategy_specs


_ROOT = Path(__file__).resolve().parents[4]


def run_single_config(cfg: ExecutionConfig) -> None:
    """Single active spec smoke output for ema_pullback Stage 10."""

    loaded = load_candles_once(cfg)
    spec = active_strategy_specs(symbol=cfg.symbol, base_timeframe=cfg.base_timeframe)[0]
    result = run_strategy_spec(
        spec,
        loaded.ohlcv,
        init_cash=cfg.init_cash,
        fees=cfg.fees,
        slippage=cfg.slippage,
    )

    print(
        f"family=ema_pullback variant={result.variant} "
        f"config_id={result.config_id} "
        f"symbol={spec.symbol} timeframe={spec.base_timeframe} "
        f"candles={loaded.candles_count}"
    )
    print("vectorbt_portfolio.sharpe_ratio (freq-aware):", result.metrics.sharpe)
    print("vectorbt_portfolio.trades.profit_factor:", result.metrics.profit_factor)
    print("vectorbt_portfolio.max_drawdown:", result.metrics.max_drawdown)
    print("status=ok")


def run_active_specs(base_config: ExecutionConfig) -> None:
    specs = active_strategy_specs(
        symbol=base_config.symbol,
        base_timeframe=base_config.base_timeframe,
    )
    loaded = load_candles_once(base_config)
    variant_results = [
        run_strategy_spec(
            spec,
            loaded.ohlcv,
            init_cash=base_config.init_cash,
            fees=base_config.fees,
            slippage=base_config.slippage,
        )
        for spec in specs
    ]

    print(
        f"family=ema_pullback symbol={base_config.symbol} "
        f"timeframe={base_config.base_timeframe} candles={loaded.candles_count} "
        f"variants={len(specs)}"
    )
    print_comparison_table([comparison_row(v) for v in variant_results])

    created_at = datetime.now(timezone.utc)
    run_id = build_run_id(
        created_at,
        "ema_pullback",
        base_config.symbol,
        base_config.base_timeframe,
    )
    payload = build_research_run_payload(
        run_id=run_id,
        created_at=created_at,
        family="ema_pullback",
        symbol=base_config.symbol,
        timeframe=base_config.base_timeframe,
        candles_count=loaded.candles_count,
        data_range_from_ms=loaded.from_open_time_ms,
        data_range_to_ms=loaded.to_open_time_ms,
        variants=[v.to_payload() for v in variant_results],
    )
    latest_path, run_path = write_research_results(payload)
    print(f"results_artifact={latest_path.relative_to(_ROOT).as_posix()}")
    print(f"run_artifact={run_path.relative_to(_ROOT).as_posix()}")
    print("status=ok")
