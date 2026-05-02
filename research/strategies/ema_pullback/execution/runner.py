"""Manual-variant orchestration for ema_pullback research runs."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from research.strategies.ema_pullback.config import StrategyConfig
from research.strategies.ema_pullback.execution.backtest import run_strategy_instance
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
from research.strategies.ema_pullback.variants import build_manual_variants


_ROOT = Path(__file__).resolve().parents[4]


def run_manual_variants(base_config: StrategyConfig) -> None:
    variants = build_manual_variants(base_config)
    loaded = load_candles_once(base_config)
    variant_results = [
        run_strategy_instance(instance, loaded.ohlcv) for instance in variants
    ]

    print(
        f"family={base_config.family} symbol={base_config.symbol} "
        f"timeframe={base_config.timeframe} candles={loaded.candles_count} "
        f"variants={len(variants)}"
    )
    print_comparison_table([comparison_row(v) for v in variant_results])

    created_at = datetime.now(timezone.utc)
    run_id = build_run_id(
        created_at,
        base_config.family,
        base_config.symbol,
        base_config.timeframe,
    )
    payload = build_research_run_payload(
        run_id=run_id,
        created_at=created_at,
        family=base_config.family,
        symbol=base_config.symbol,
        timeframe=base_config.timeframe,
        candles_count=loaded.candles_count,
        data_range_from_ms=loaded.from_open_time_ms,
        data_range_to_ms=loaded.to_open_time_ms,
        variants=[v.to_payload() for v in variant_results],
    )
    latest_path, run_path = write_research_results(payload)
    print(f"results_artifact={latest_path.relative_to(_ROOT).as_posix()}")
    print(f"run_artifact={run_path.relative_to(_ROOT).as_posix()}")
    print("status=ok")
