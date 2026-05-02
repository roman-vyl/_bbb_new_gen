"""StrategySpec vectorbt backtest backend for ema_pullback."""

from __future__ import annotations

import math
from typing import Any

from data_engine.contracts import pandas_freq_alias

from research.strategies.ema_pullback.execution.result_models import (
    VariantMetrics,
    VariantResult,
)
from research.strategies.ema_pullback.execution.results import extract_trade_records
from research.strategies.ema_pullback.execution.signals import build_signals_from_spec
from research.strategies.ema_pullback.execution.trade_management import build_stops_from_trade_management
from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec import strategy_spec_config_id, strategy_spec_to_dict
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec


def ensure_finite_metric(name: str, value: float) -> float:
    """Return finite metric value; normalize non-finite edge cases to 0.0."""

    if not math.isfinite(value):
        return 0.0
    return value


def run_strategy_spec(
    spec: EmaPullbackStrategySpec,
    ohlcv: Any,
    *,
    init_cash: float = 100.0,
    fees: float = 0.0,
    slippage: float = 0.0,
) -> VariantResult:
    """Run one strategy spec over shared OHLCV."""
    try:
        import vectorbt as vbt
    except ImportError as exc:  # pragma: no cover - exercised when extra missing
        raise SystemExit(
            "vectorbt (and research extras) are required. "
            'Install with: pip install -e ".[research]"'
        ) from exc

    plan = build_feature_plan_from_strategy_spec(spec)
    enriched = add_feature_columns_from_plan(ohlcv, plan)
    entries, exits = build_signals_from_spec(enriched, spec, plan)

    close = enriched["close"].astype(float)
    if close.isna().any():
        raise SystemExit("close contains NaN — check DB / repair pipeline.")

    fast_col = plan.anchor_columns["fast"]
    slow_col = plan.anchor_columns["slow"]
    ema_f = enriched[fast_col]
    ema_s = enriched[slow_col]
    if ema_f.isna().any() or ema_s.isna().any():
        raise SystemExit("EMA columns contain NaN (unexpected for ewm on finite close).")

    freq = pandas_freq_alias(spec.base_timeframe)
    tm_kwargs = build_stops_from_trade_management(enriched, spec, plan)
    pf = vbt.Portfolio.from_signals(
        close,
        entries,
        exits,
        freq=freq,
        init_cash=float(init_cash),
        fees=float(fees),
        slippage=float(slippage),
        **tm_kwargs,
    )

    sharpe = ensure_finite_metric("sharpe_ratio", float(pf.sharpe_ratio()))
    trades = pf.trades
    pf_val = trades.profit_factor()
    profit_factor = float(pf_val) if hasattr(pf_val, "item") else float(pf_val)
    profit_factor = ensure_finite_metric("profit_factor", profit_factor)

    max_dd = pf.max_drawdown()
    max_dd_f = float(max_dd) if hasattr(max_dd, "item") else float(max_dd)
    max_dd_f = ensure_finite_metric("max_drawdown", max_dd_f)

    return VariantResult(
        variant=spec.variant,
        config_id=strategy_spec_config_id(spec),
        symbol=spec.symbol.strip().upper(),
        timeframe=spec.base_timeframe.strip(),
        strategy_spec=strategy_spec_to_dict(spec),
        metrics=VariantMetrics(
            trades=int(trades.count()),
            sharpe=sharpe,
            profit_factor=profit_factor,
            max_drawdown=max_dd_f,
        ),
        trade_records=extract_trade_records(pf, close),
    )
