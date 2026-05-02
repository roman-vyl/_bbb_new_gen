from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.execution.signals import build_signals_from_spec
from research.strategies.ema_pullback.execution.trade_management import (
    build_stops_from_trade_management,
)
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec_instances import ema_pullback_fast20_anchor200_slow1000_spec


def _signal_frame() -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=5, freq="h", tz="UTC")
    return pd.DataFrame(
        {
            "close": [198.0, 199.0, 201.0, 202.0, 203.0],
            "low": [205.0, 200.0, 201.0, 201.0, 201.0],
            "ema_close_base_20": [210.0, 210.0, 210.0, 211.0, 212.0],
            "ema_close_base_200": [200.0, 200.0, 200.0, 200.0, 200.0],
            "ema_close_base_1000": [150.0, 150.0, 150.0, 150.0, 150.0],
            "atr_close_base_14_x1_5": [1.5, 1.5, 1.5, 1.5, 1.5],
            "atr_close_base_14_x4_0": [4.0, 4.0, 4.0, 4.0, 4.0],
        },
        index=idx,
    )


def test_direction_uses_fast_anchor_slow_columns() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    entries, _ = build_signals_from_spec(_signal_frame(), spec, plan)
    assert bool(entries.iloc[2]) is True


def test_pullback_uses_anchor_column_and_lookback() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    entries, _ = build_signals_from_spec(_signal_frame(), spec, plan)
    assert bool(entries.iloc[2]) is True


def test_reclaim_uses_anchor_column() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    entries, _ = build_signals_from_spec(_signal_frame(), spec, plan)
    assert bool(entries.iloc[2]) is True


def test_trade_management_uses_ready_distance_columns() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    stops = build_stops_from_trade_management(_signal_frame(), spec, plan)
    assert "sl_stop" in stops
    assert "tp_stop" in stops


def test_trade_management_stop_math_matches_stage10_formula() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    df = _signal_frame()
    stops = build_stops_from_trade_management(df, spec, plan)
    pd.testing.assert_series_equal(stops["sl_stop"], df["atr_close_base_14_x1_5"] / df["close"])
    pd.testing.assert_series_equal(stops["tp_stop"], df["atr_close_base_14_x4_0"] / df["close"])
