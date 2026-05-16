"""StrategySpec vectorbt backtest backend for ema_pullback."""

from __future__ import annotations

import math
from typing import Any

from data_engine.contracts import pandas_freq_alias
import pandas as pd

from research.strategies.ema_pullback.execution.result_models import (
    OpenTradesBreakdown,
    SideMetrics,
    VariantMetrics,
    VariantResult,
)
from research.strategies.ema_pullback.execution.results import extract_trade_records
from research.strategies.ema_pullback.execution.exits import build_exit_outputs_from_spec
from research.strategies.ema_pullback.execution.signals import build_signals_from_spec
from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec import strategy_spec_config_id, strategy_spec_to_dict
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec


def ensure_finite_metric(name: str, value: float) -> float:
    """Return finite metric value; normalize non-finite edge cases to 0.0."""

    if not math.isfinite(value):
        return 0.0
    return value


def _nullable_finite(value: float) -> float | None:
    if not math.isfinite(value):
        return None
    return value


def _open_high_low_for_vectorbt(enriched: pd.DataFrame) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Require real OHLC columns for vectorbt stop semantics (Step 15); fail-fast if missing or non-finite."""

    missing = [c for c in ("open", "high", "low") if c not in enriched.columns]
    if missing:
        raise SystemExit(
            "enriched OHLCV must contain columns open, high, low for vectorbt stop execution; "
            f"missing: {', '.join(repr(c) for c in missing)}"
        )
    open_s = enriched["open"].astype(float)
    high_s = enriched["high"].astype(float)
    low_s = enriched["low"].astype(float)
    for name, series in (("open", open_s), ("high", high_s), ("low", low_s)):
        if series.isna().any():
            raise SystemExit(f"{name} contains NaN — check DB / repair pipeline.")
    return open_s, high_s, low_s


def _build_side_metrics(records: list[dict[str, Any]], init_cash: float) -> SideMetrics:
    trades = len(records)
    pnl_values = [float(record.get("pnl") or 0.0) for record in records]
    pnl = sum(pnl_values)
    return_pct = pnl / float(init_cash) if float(init_cash) != 0.0 else 0.0

    if trades == 0:
        return SideMetrics(
            trades=0,
            pnl=0.0,
            return_pct=0.0,
            profit_factor=None,
            win_rate=None,
        )

    gross_profit = sum(value for value in pnl_values if value > 0.0)
    gross_loss = abs(sum(value for value in pnl_values if value < 0.0))
    if gross_loss == 0.0:
        profit_factor = None
    else:
        profit_factor = _nullable_finite(gross_profit / gross_loss)

    win_rate = sum(1 for value in pnl_values if value > 0.0) / trades
    return SideMetrics(
        trades=trades,
        pnl=pnl,
        return_pct=return_pct,
        profit_factor=profit_factor,
        win_rate=win_rate,
    )


def build_trade_side_metrics(
    trade_records: list[dict[str, Any]],
    init_cash: float,
    *,
    sharpe: float,
    max_drawdown: float,
) -> VariantMetrics:
    """Realized PnL / PF / win_rate use ``status == \"closed\"`` only; open rows are counted in ``open_trades``."""

    closed = [record for record in trade_records if record.get("status") == "closed"]
    open_recs = [record for record in trade_records if record.get("status") == "open"]
    open_trades = OpenTradesBreakdown(
        long=sum(1 for record in open_recs if record.get("direction") == "long"),
        short=sum(1 for record in open_recs if record.get("direction") == "short"),
        total=len(open_recs),
    )

    long_closed = [record for record in closed if record.get("direction") == "long"]
    short_closed = [record for record in closed if record.get("direction") == "short"]
    return VariantMetrics(
        long=_build_side_metrics(long_closed, init_cash),
        short=_build_side_metrics(short_closed, init_cash),
        total=_build_side_metrics(closed, init_cash),
        sharpe=ensure_finite_metric("sharpe_ratio", sharpe),
        max_drawdown=ensure_finite_metric("max_drawdown", max_drawdown),
        open_trades=open_trades,
    )


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
    open_s, high_s, low_s = _open_high_low_for_vectorbt(enriched)
    signals = build_signals_from_spec(enriched, spec, plan)
    exit_outputs = build_exit_outputs_from_spec(enriched, spec, plan)

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
    stop_kwargs = exit_outputs.stop_kwargs()
    sl_stop = stop_kwargs["sl_stop"]
    tp_stop = stop_kwargs["tp_stop"]
    # ATR-based stops are NaN until warmup.
    # Gate entries only by configured distance exits:
    # - both SL+TP -> require both ready
    # - only one distance side -> require that side ready
    # - signal-only exits -> no distance readiness gating
    stop_ready = pd.Series(True, index=close.index, dtype=bool)
    if sl_stop.notna().any():
        stop_ready = stop_ready & sl_stop.notna()
    if tp_stop.notna().any():
        stop_ready = stop_ready & tp_stop.notna()
    entries_for_portfolio = signals.entries.fillna(False).astype(bool) & stop_ready
    short_entries_for_portfolio = signals.short_entries.fillna(False).astype(bool) & stop_ready

    pf = vbt.Portfolio.from_signals(
        close,
        entries_for_portfolio,
        exit_outputs.exits,
        short_entries=short_entries_for_portfolio,
        short_exits=exit_outputs.short_exits,
        open=open_s,
        high=high_s,
        low=low_s,
        freq=freq,
        init_cash=float(init_cash),
        fees=float(fees),
        slippage=float(slippage),
        **stop_kwargs,
    )

    trade_records = extract_trade_records(
        pf,
        close,
        high=high_s,
        low=low_s,
        open_s=open_s,
        attribution=exit_outputs.attribution,
    )

    sharpe = ensure_finite_metric("sharpe_ratio", float(pf.sharpe_ratio()))
    max_dd_raw = pf.max_drawdown()
    max_dd_f = float(max_dd_raw) if hasattr(max_dd_raw, "item") else float(max_dd_raw)
    max_dd_f = ensure_finite_metric("max_drawdown", max_dd_f)

    return VariantResult(
        variant=spec.variant,
        config_id=strategy_spec_config_id(spec),
        symbol=spec.symbol.strip().upper(),
        timeframe=spec.base_timeframe.strip(),
        strategy_spec=strategy_spec_to_dict(spec),
        metrics=build_trade_side_metrics(
            trade_records,
            float(init_cash),
            sharpe=sharpe,
            max_drawdown=max_dd_f,
        ),
        component_counters=list(signals.output_counters + exit_outputs.output_counters),
        trade_records=trade_records,
    )
