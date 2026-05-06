"""StrategySpec orchestration for ema_pullback research runs."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

from research.experiments.config_loader import LoadedExternalConfig, load_strategy_config_file
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
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec
from research.strategies.ema_pullback.spec_instances import active_strategy_specs


_ROOT = Path(__file__).resolve().parents[4]


def run_single_config(cfg: ExecutionConfig) -> None:
    """Single strategy-spec smoke run."""

    loaded = load_candles_once(cfg)
    spec = active_strategy_specs(cfg.symbol, cfg.timeframe)[0]
    result = run_strategy_spec(
        spec,
        loaded.ohlcv,
        init_cash=cfg.init_cash,
        fees=cfg.fees,
        slippage=cfg.slippage,
    )

    print(
        f"family={cfg.family} variant={result.variant} "
        f"config_id={result.config_id} "
        f"symbol={result.symbol} timeframe={result.timeframe} "
        f"candles={loaded.candles_count}"
    )
    print_comparison_table([comparison_row(result)])
    print("status=ok")


def run_active_strategy_specs(base_config: ExecutionConfig) -> None:
    loaded = load_candles_once(base_config)
    specs = active_strategy_specs(base_config.symbol, base_config.timeframe)
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
        f"family={base_config.family} symbol={base_config.symbol} "
        f"timeframe={base_config.timeframe} candles={loaded.candles_count} "
        f"variants={len(specs)}"
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


def run_strategy_specs_from_config(base_config: ExecutionConfig, config_source_file: str | Path) -> None:
    loaded_config = load_strategy_config_file(config_source_file)
    specs = _validated_specs_for_single_market(loaded_config)
    run_config = replace(
        base_config,
        family=loaded_config.family,
        symbol=specs[0].symbol,
        timeframe=specs[0].base_timeframe,
        init_cash=(
            loaded_config.execution.init_cash
            if loaded_config.execution.init_cash is not None
            else base_config.init_cash
        ),
        fees=loaded_config.execution.fees if loaded_config.execution.fees is not None else base_config.fees,
        slippage=(
            loaded_config.execution.slippage
            if loaded_config.execution.slippage is not None
            else base_config.slippage
        ),
    )
    loaded = load_candles_once(run_config)
    variant_results = [
        run_strategy_spec(
            spec,
            loaded.ohlcv,
            init_cash=run_config.init_cash,
            fees=run_config.fees,
            slippage=run_config.slippage,
        )
        for spec in specs
    ]

    print(
        f"family={run_config.family} experiment_id={loaded_config.experiment_id} "
        f"symbol={run_config.symbol} timeframe={run_config.timeframe} "
        f"candles={loaded.candles_count} variants={len(specs)}"
    )
    print_comparison_table([comparison_row(v) for v in variant_results])

    created_at = datetime.now(timezone.utc)
    run_id = build_run_id(
        created_at,
        run_config.family,
        run_config.symbol,
        run_config.timeframe,
    )
    payload = build_research_run_payload(
        run_id=run_id,
        created_at=created_at,
        family=run_config.family,
        symbol=run_config.symbol,
        timeframe=run_config.timeframe,
        candles_count=loaded.candles_count,
        data_range_from_ms=loaded.from_open_time_ms,
        data_range_to_ms=loaded.to_open_time_ms,
        variants=[v.to_payload() for v in variant_results],
        batch_metadata=_batch_success_metadata(loaded_config),
    )
    latest_path, run_path = write_research_results(payload)
    print(f"results_artifact={latest_path.relative_to(_ROOT).as_posix()}")
    print(f"run_artifact={run_path.relative_to(_ROOT).as_posix()}")
    print("status=ok")


def _validated_specs_for_single_market(
    loaded_config: LoadedExternalConfig,
) -> tuple[EmaPullbackStrategySpec, ...]:
    specs = tuple(loaded_config.specs)
    if not specs:
        raise ValueError("external config produced no strategy specs")
    first = specs[0]
    if not isinstance(first, EmaPullbackStrategySpec):
        raise TypeError("external config produced unsupported strategy spec type")
    for spec in specs:
        if not isinstance(spec, EmaPullbackStrategySpec):
            raise TypeError("external config produced unsupported strategy spec type")
        if spec.symbol != first.symbol or spec.base_timeframe != first.base_timeframe:
            raise ValueError("all external config instances must share symbol and base_timeframe in MVP")
    return specs


def _batch_success_metadata(loaded_config: LoadedExternalConfig) -> dict[str, object]:
    entries = [
        {
            **entry.to_payload(),
            "status": "success",
        }
        for entry in loaded_config.entries
    ]
    return {
        **loaded_config.identity_payload(),
        "validation_phase_status": "passed",
        "entries": entries,
        "counters": {
            "total": len(entries),
            "success": len(entries),
            "failed": 0,
        },
    }
