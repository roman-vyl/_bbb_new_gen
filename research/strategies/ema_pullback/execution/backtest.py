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
from research.strategies.ema_pullback.execution.signals import ema_crossover_signals
from research.strategies.ema_pullback.execution.trade_management import (
    resolve_portfolio_kwargs_for_signals,
    resolve_trade_management_profile,
)
from research.strategies.ema_pullback.features import add_feature_columns
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

    ema_f = enriched[f"ema_{cfg.ema_fast}"]
    ema_s = enriched[f"ema_{cfg.ema_slow}"]
    if ema_f.isna().any() or ema_s.isna().any():
        raise SystemExit("EMA columns contain NaN (unexpected for ewm on finite close).")

    freq = pandas_freq_alias(cfg.timeframe)
    risk = portfolio_risk_from_config(cfg)
    trade_mgmt = resolve_trade_management_profile(cfg.trade_management_profile)
    tm_kwargs = resolve_portfolio_kwargs_for_signals(
        trade_mgmt,
        df=enriched,
        close=close,
        feature_profile_id=cfg.feature_profile,
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
    )
