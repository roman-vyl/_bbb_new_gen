"""Tests for Step 16 exit_reason attribution."""

from __future__ import annotations

import pytest

import pandas as pd

from research.strategies.ema_pullback.execution.exit_attribution import (
    ExitAttributionContext,
    classify_exit_reason,
)


def _ctx_one_sl(*, idx: pd.DatetimeIndex, sl: float, inst: str = "atr_sl") -> ExitAttributionContext:
    close = pd.Series(100.0, index=idx, dtype=float)
    ratio = pd.Series(sl, index=idx, dtype=float)
    nan_s = pd.Series(float("nan"), index=idx, dtype=float)
    return ExitAttributionContext(
        index=idx,
        instance_ids=(inst,),
        exit_kinds=("stop_loss",),
        long_signal_by_rule=(None,),
        short_signal_by_rule=(None,),
        distance_ratio_by_rule=(ratio,),
        sl_stop_agg=ratio,
        tp_stop_agg=nan_s,
    )


def test_classify_open_trade() -> None:
    idx = pd.date_range("2024-01-01", periods=3, freq="h", tz="UTC")
    ctx = _ctx_one_sl(idx=idx, sl=0.02)
    row = {"status": 0, "direction": 0, "entry_idx": 0, "exit_idx": 0}
    close = pd.Series([100.0, 101.0, 102.0], index=idx)
    o = h = l = close
    assert classify_exit_reason(row=row, close=close, high=h, low=l, open_=o, ctx=ctx) == "open"


def test_classify_long_stop_loss_hit() -> None:
    idx = pd.date_range("2024-01-01", periods=5, freq="h", tz="UTC")
    sl = 0.02
    ctx = _ctx_one_sl(idx=idx, sl=sl, inst="atr_stop_1")
    close = pd.Series([100.0, 100.0, 100.0, 100.0, 100.0], index=idx)
    high = pd.Series([100.0, 100.0, 100.0, 100.0, 100.0], index=idx)
    low = pd.Series([100.0, 100.0, 100.0, 97.0, 100.0], index=idx)
    open_ = pd.Series([100.0, 100.0, 100.0, 99.0, 100.0], index=idx)
    row = {"status": 1, "direction": 0, "entry_idx": 1, "exit_idx": 3}
    assert classify_exit_reason(row=row, close=close, high=high, low=low, open_=open_, ctx=ctx) == (
        "stop_loss:atr_stop_1"
    )


def test_classify_long_take_profit_hit() -> None:
    idx = pd.date_range("2024-01-01", periods=5, freq="h", tz="UTC")
    nan_s = pd.Series(float("nan"), index=idx, dtype=float)
    tp = 0.05
    ratio = pd.Series(tp, index=idx, dtype=float)
    ctx = ExitAttributionContext(
        index=idx,
        instance_ids=("tp1",),
        exit_kinds=("take_profit",),
        long_signal_by_rule=(None,),
        short_signal_by_rule=(None,),
        distance_ratio_by_rule=(ratio,),
        sl_stop_agg=nan_s,
        tp_stop_agg=ratio,
    )
    close = pd.Series([100.0, 100.0, 100.0, 100.0, 100.0], index=idx)
    high = pd.Series([100.0, 100.0, 100.0, 106.0, 100.0], index=idx)
    low = pd.Series([100.0, 100.0, 100.0, 100.0, 100.0], index=idx)
    open_ = pd.Series([100.0, 100.0, 100.0, 100.0, 100.0], index=idx)
    row = {"status": 1, "direction": 0, "entry_idx": 1, "exit_idx": 3}
    assert classify_exit_reason(row=row, close=close, high=high, low=low, open_=open_, ctx=ctx) == (
        "take_profit:tp1"
    )


def test_classify_stop_wins_over_signal_same_bar() -> None:
    idx = pd.date_range("2024-01-01", periods=5, freq="h", tz="UTC")
    sl = 0.02
    ratio = pd.Series(sl, index=idx, dtype=float)
    nan_s = pd.Series(float("nan"), index=idx, dtype=float)
    sig = pd.Series([False, False, False, True, False], index=idx, dtype=bool)
    ctx = ExitAttributionContext(
        index=idx,
        instance_ids=("atr_sl", "rsi_x"),
        exit_kinds=("stop_loss", "signal"),
        long_signal_by_rule=(None, sig),
        short_signal_by_rule=(None, pd.Series(False, index=idx)),
        distance_ratio_by_rule=(ratio, None),
        sl_stop_agg=ratio,
        tp_stop_agg=nan_s,
    )
    close = pd.Series([100.0, 100.0, 100.0, 100.0, 100.0], index=idx)
    high = pd.Series([100.0, 100.0, 100.0, 100.0, 100.0], index=idx)
    low = pd.Series([100.0, 100.0, 100.0, 97.0, 100.0], index=idx)
    open_ = pd.Series([100.0, 100.0, 100.0, 99.0, 100.0], index=idx)
    row = {"status": 1, "direction": 0, "entry_idx": 1, "exit_idx": 3}
    assert classify_exit_reason(row=row, close=close, high=high, low=low, open_=open_, ctx=ctx) == (
        "stop_loss:atr_sl"
    )


def test_classify_short_stop_loss_hit() -> None:
    idx = pd.date_range("2024-01-01", periods=5, freq="h", tz="UTC")
    sl = 0.02
    ratio = pd.Series(sl, index=idx, dtype=float)
    nan_s = pd.Series(float("nan"), index=idx, dtype=float)
    ctx = ExitAttributionContext(
        index=idx,
        instance_ids=("sl_s",),
        exit_kinds=("stop_loss",),
        long_signal_by_rule=(None,),
        short_signal_by_rule=(None,),
        distance_ratio_by_rule=(ratio,),
        sl_stop_agg=ratio,
        tp_stop_agg=nan_s,
    )
    close = pd.Series([100.0, 100.0, 100.0, 100.0, 100.0], index=idx)
    high = pd.Series([100.0, 100.0, 100.0, 104.0, 100.0], index=idx)
    low = pd.Series([100.0, 100.0, 100.0, 100.0, 100.0], index=idx)
    open_ = pd.Series([100.0, 100.0, 100.0, 103.0, 100.0], index=idx)
    row = {"status": 1, "direction": 1, "entry_idx": 1, "exit_idx": 3}
    assert classify_exit_reason(row=row, close=close, high=high, low=low, open_=open_, ctx=ctx) == (
        "stop_loss:sl_s"
    )
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    nan_s = pd.Series(float("nan"), index=idx, dtype=float)
    sig = pd.Series([False, False, True, False], index=idx, dtype=bool)
    ctx = ExitAttributionContext(
        index=idx,
        instance_ids=("rsi_exit_1",),
        exit_kinds=("signal",),
        long_signal_by_rule=(sig,),
        short_signal_by_rule=(pd.Series(False, index=idx),),
        distance_ratio_by_rule=(None,),
        sl_stop_agg=nan_s,
        tp_stop_agg=nan_s,
    )
    close = pd.Series([100.0, 100.0, 100.0, 100.0], index=idx)
    high = low = open_ = close
    row = {"status": 1, "direction": 0, "entry_idx": 1, "exit_idx": 2}
    assert classify_exit_reason(row=row, close=close, high=high, low=low, open_=open_, ctx=ctx) == (
        "signal:rsi_exit_1"
    )
