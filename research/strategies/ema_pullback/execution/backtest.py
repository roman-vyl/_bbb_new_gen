"""Single-instance vectorbt backtest backend for ema_pullback."""

from __future__ import annotations

import math
from typing import Any

from data_engine.contracts import pandas_freq_alias

from research.strategies.ema_pullback.components.risk import portfolio_risk_from_config
from research.strategies.ema_pullback.execution.result_models import (
    VariantMetrics,
    VariantResult,
)
from research.strategies.ema_pullback.execution.results import extract_trade_records
from research.strategies.ema_pullback.execution.signals import (
    ema_crossover_signals,
    ema_pullback_pipeline_signals_from_strategy_spec,
)
from research.strategies.ema_pullback.execution.trade_management import (
    resolve_portfolio_kwargs_for_signals,
    resolve_trade_management_profile,
)
from research.strategies.ema_pullback.features import add_feature_columns
from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import (
    build_feature_plan_from_strategy_spec,
    distance_columns_for_rule_based_trade_management,
    ema_feature_id,
)
from research.strategies.ema_pullback.spec import strategy_spec_identity
from research.strategies.ema_pullback.instance import StrategyInstance


def ensure_finite_metric(name: str, value: float) -> float:
    """Return value if finite; otherwise exit with a clear error (no status=ok)."""

    if not math.isfinite(value):
        raise SystemExit(
            f"backtest metric {name!r} is not finite (got {value!r}); "
            "refusing to print status=ok."
        )
    return value


def run_strategy_instance(instance: StrategyInstance, ohlcv: Any) -> VariantResult:
    """Run one strategy instance over shared OHLCV."""

    try:
        import vectorbt as vbt
    except ImportError as exc:  # pragma: no cover - exercised when extra missing
        raise SystemExit(
            "vectorbt (and research extras) are required. "
            'Install with: pip install -e ".[research]"'
        ) from exc

    cfg = instance.config
    if cfg.strategy_spec is not None:
        plan = build_feature_plan_from_strategy_spec(cfg.strategy_spec)
        enriched = add_feature_columns_from_plan(ohlcv, plan)
        entries, exits = ema_pullback_pipeline_signals_from_strategy_spec(
            enriched,
            strategy_spec=cfg.strategy_spec,
            direction_component=cfg.direction_component,
            blockers_component=cfg.blockers_component,
            setup_component=cfg.setup_component,
            trigger_component=cfg.trigger_component,
            exits_component=cfg.exits_component,
            risk_component=cfg.risk_component,
        )
    else:
        enriched = add_feature_columns(
            ohlcv,
            profile_id=cfg.feature_profile,
            ema_fast=cfg.ema_fast,
            ema_slow=cfg.ema_slow,
        )
        entries, exits = ema_crossover_signals(
            enriched,
            ema_fast=cfg.ema_fast,
            ema_slow=cfg.ema_slow,
            direction_component=cfg.direction_component,
            blockers_component=cfg.blockers_component,
            setup_component=cfg.setup_component,
            trigger_component=cfg.trigger_component,
            exits_component=cfg.exits_component,
            risk_component=cfg.risk_component,
            feature_profile=cfg.feature_profile,
        )

    close = enriched["close"].astype(float)
    if close.isna().any():
        raise SystemExit("close contains NaN — check DB / repair pipeline.")

    if cfg.strategy_spec is not None:
        stack = cfg.strategy_spec.anchor_stack
        ema_cols = (
            ema_feature_id(stack.fast),
            ema_feature_id(stack.anchor),
            ema_feature_id(stack.slow),
        )
    else:
        ema_cols = (f"ema_{cfg.ema_fast}", f"ema_{cfg.ema_slow}")
    for col in ema_cols:
        if enriched[col].isna().any():
            raise SystemExit("EMA columns contain NaN (unexpected for ewm on finite close).")

    freq = pandas_freq_alias(cfg.timeframe)
    risk = portfolio_risk_from_config(cfg)
    trade_mgmt = resolve_trade_management_profile(cfg.trade_management_profile)
    stop_col: str | None = None
    take_col: str | None = None
    if cfg.strategy_spec is not None:
        stop_col, take_col = distance_columns_for_rule_based_trade_management(cfg.strategy_spec)
    tm_kwargs = resolve_portfolio_kwargs_for_signals(
        trade_mgmt,
        df=enriched,
        close=close,
        feature_profile_id=cfg.feature_profile,
        stop_distance_column=stop_col,
        take_distance_column=take_col,
    )
    pf = vbt.Portfolio.from_signals(
        close,
        entries,
        exits,
        freq=freq,
        init_cash=risk.init_cash,
        fees=risk.fees,
        slippage=risk.slippage,
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

    spec_payload = strategy_spec_identity(cfg.strategy_spec) if cfg.strategy_spec is not None else None

    return VariantResult(
        variant=cfg.variant,
        config_id=instance.config_id,
        symbol=cfg.symbol.strip().upper(),
        timeframe=cfg.timeframe.strip(),
        feature_profile=cfg.feature_profile,
        components={
            "direction": cfg.direction_component,
            "blockers": cfg.blockers_component,
            "setup": cfg.setup_component,
            "trigger": cfg.trigger_component,
            "exits": cfg.exits_component,
            "risk": cfg.risk_component,
        },
        trade_management_profile=cfg.trade_management_profile,
        params={
            "ema_fast": cfg.ema_fast,
            "ema_slow": cfg.ema_slow,
            "init_cash": float(cfg.init_cash),
            "fees": float(cfg.fees),
            "slippage": float(cfg.slippage),
        },
        metrics=VariantMetrics(
            trades=int(trades.count()),
            sharpe=sharpe,
            profit_factor=profit_factor,
            max_drawdown=max_dd_f,
        ),
        trade_records=extract_trade_records(pf, close),
        strategy_spec=spec_payload,
    )
