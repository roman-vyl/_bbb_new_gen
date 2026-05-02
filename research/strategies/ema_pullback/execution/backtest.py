"""StrategySpec vectorbt backtest backend for ema_pullback."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

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
    # #region debug trace
    print(
        "[spec]",
        {
            "variant": spec.variant,
            "fast_period": spec.anchor_stack.fast.period,
            "anchor_period": spec.anchor_stack.anchor.period,
            "slow_period": spec.anchor_stack.slow.period,
            "symbol": spec.symbol.strip().upper(),
            "timeframe": spec.base_timeframe.strip(),
        },
    )
    print(
        "[plan]",
        {
            "feature_ids": [f.feature_id for f in plan.features],
            "anchor_columns": dict(plan.anchor_columns),
            "exit_distance_columns": dict(plan.exit_distance_columns),
        },
    )
    # #endregion
    enriched = add_feature_columns_from_plan(ohlcv, plan)
    # #region debug trace
    for _feat in plan.features:
        _s = enriched[_feat.feature_id]
        _num = pd.to_numeric(_s, errors="coerce")
        _fvi = _s.first_valid_index()
        print(
            "[features]",
            _feat.feature_id,
            {
                "finite_count": int(np.isfinite(_num.to_numpy(dtype=float, copy=False)).sum()),
                "nan_count": int(_s.isna().sum()),
                "first_valid_index": None if _fvi is None else str(_fvi),
            },
        )
    # #endregion
    entries, exits = build_signals_from_spec(enriched, spec, plan)
    # #region debug trace
    _entries_raw = entries.fillna(False).astype(bool)
    _exits_b = exits.fillna(False).astype(bool)
    print(
        "[signals]",
        {
            "entries_raw_count": int(_entries_raw.sum()),
            "exits_count": int(_exits_b.sum()),
        },
    )
    # #endregion

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
    sl_stop = tm_kwargs["sl_stop"]
    tp_stop = tm_kwargs["tp_stop"]
    # ATR-based stops are NaN until warmup; opening without finite sl/tp yields no stop exits
    # and (with no signal exits) a single perpetual open trade in vectorbt.
    entries_for_portfolio = (
        entries.fillna(False).astype(bool) & sl_stop.notna() & tp_stop.notna()
    )
    # #region debug trace
    _sl = pd.to_numeric(sl_stop, errors="coerce")
    _tp = pd.to_numeric(tp_stop, errors="coerce")
    _both_stops_ok = sl_stop.notna() & tp_stop.notna()
    print(
        "[trade_management]",
        {
            "sl_stop_finite_count": int(np.isfinite(_sl.to_numpy(dtype=float, copy=False)).sum()),
            "tp_stop_finite_count": int(np.isfinite(_tp.to_numpy(dtype=float, copy=False)).sum()),
            "sl_stop_nan_count": int(sl_stop.isna().sum()),
            "tp_stop_nan_count": int(tp_stop.isna().sum()),
            "entries_dropped_nan_stops_count": int((_entries_raw & ~_both_stops_ok).sum()),
            "entries_for_portfolio_count": int(entries_for_portfolio.sum()),
        },
    )
    # #endregion

    pf = vbt.Portfolio.from_signals(
        close,
        entries_for_portfolio,
        exits,
        freq=freq,
        init_cash=float(init_cash),
        fees=float(fees),
        slippage=float(slippage),
        **tm_kwargs,
    )

    trade_records = extract_trade_records(pf, close)
    # #region debug trace
    _rec_df = pf.trades.records
    _n_tr = 0 if _rec_df is None else len(_rec_df)
    _open_n = _closed_n = 0
    if _rec_df is not None and _n_tr:
        _st = _rec_df["status"]
        _open_n = int((_st == 0).sum())
        _closed_n = int((_st == 1).sum())
    print(
        "[portfolio]",
        {
            "trades_count": _n_tr,
            "open_trades_count": _open_n,
            "closed_trades_count": _closed_n,
        },
    )
    if trade_records:
        _first, _last = trade_records[0], trade_records[-1]
        print(
            "[records]",
            "first",
            {
                "status": _first.get("status"),
                "entry_time_ms": _first.get("entry_time_ms"),
                "exit_time_ms": _first.get("exit_time_ms"),
            },
            "last",
            {
                "status": _last.get("status"),
                "entry_time_ms": _last.get("entry_time_ms"),
                "exit_time_ms": _last.get("exit_time_ms"),
            },
        )
    else:
        print("[records]", "no trades")
    _expected_variant = (
        f"ema_pullback_fast{spec.anchor_stack.fast.period}"
        f"_anchor{spec.anchor_stack.anchor.period}"
        f"_slow{spec.anchor_stack.slow.period}"
    )
    _cfg_id = strategy_spec_config_id(spec)
    _missing_features = [f.feature_id for f in plan.features if f.feature_id not in enriched.columns]
    _entries_raw_count = int(_entries_raw.sum())
    _entries_dropped_nan = int((_entries_raw & ~_both_stops_ok).sum())
    _entries_for_pf_count = int(entries_for_portfolio.sum())
    _pf_trade_count = int(pf.trades.count())
    _trade_ids = [r.get("trade_id") for r in trade_records]
    _trade_id_sequence_ok = _trade_ids == list(range(1, len(trade_records) + 1))
    _entry_ms_list = [r.get("entry_time_ms") for r in trade_records]
    _trade_times_monotonic = True
    if _entry_ms_list:
        _prev = _entry_ms_list[0]
        if _prev is None:
            _trade_times_monotonic = False
        else:
            for _t in _entry_ms_list[1:]:
                if _t is None or _prev is None or _t < _prev:
                    _trade_times_monotonic = False
                    break
                _prev = _t
    _all_closed_have_exit = all(
        r.get("exit_time_ms") is not None for r in trade_records if r.get("status") == "closed"
    )
    _entry_before_exit_ok = all(
        r.get("entry_time_ms") is not None
        and r.get("exit_time_ms") is not None
        and r.get("entry_time_ms") <= r.get("exit_time_ms")
        for r in trade_records
        if r.get("status") == "closed"
    )
    print(
        "[invariants]",
        {
            "variant_matches_spec": spec.variant == _expected_variant,
            "expected_variant": _expected_variant,
            "config_id_present": bool(_cfg_id),
            "anchor_columns_match_spec": (
                plan.anchor_columns["fast"] == f"ema_close_base_{spec.anchor_stack.fast.period}"
                and plan.anchor_columns["anchor"] == f"ema_close_base_{spec.anchor_stack.anchor.period}"
                and plan.anchor_columns["slow"] == f"ema_close_base_{spec.anchor_stack.slow.period}"
            ),
            "all_plan_features_present": len(_missing_features) == 0,
            "missing_features": _missing_features,
            "entries_filter_math_ok": _entries_raw_count - _entries_dropped_nan == _entries_for_pf_count,
            "trade_records_match_portfolio": len(trade_records) == _pf_trade_count,
            "trade_id_sequence_ok": _trade_id_sequence_ok,
            "trade_times_monotonic": _trade_times_monotonic,
            "all_closed_trades_have_exit_time": _all_closed_have_exit,
            "entry_before_exit": _entry_before_exit_ok,
        },
    )
    # #endregion

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
        trade_records=trade_records,
    )
