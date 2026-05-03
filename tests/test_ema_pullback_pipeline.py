from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.execution.signals import (
    build_signals_from_spec,
    compose_blocker_signals,
    compose_signal_exit_signals,
)
from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec_instances import (
    default_ema_pullback_strategy_spec,
    make_ema_pullback_strategy_spec,
)


def _ohlcv() -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=8, freq="h", tz="UTC")
    close = pd.Series([99.0, 98.0, 101.0, 102.0, 103.0, 104.0, 100.0, 105.0], index=idx)
    return pd.DataFrame(
        {
            "open": close,
            "high": close + 0.2,
            "low": pd.Series([101.0, 99.0, 100.0, 103.0, 104.0, 105.0, 98.0, 106.0], index=idx),
            "close": close,
            "volume": 1.0,
        },
        index=idx,
    )


def test_build_signals_from_spec_uses_component_registry_and_plan_columns() -> None:
    spec = default_ema_pullback_strategy_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(), plan)

    # Enforce deterministic component behavior for this unit test.
    df[plan.anchor_columns["fast"]] = [11, 12, 10, 14, 15, 16, 11, 17]
    df[plan.anchor_columns["anchor"]] = [10, 11, 10, 13, 14, 15, 10, 16]
    df[plan.anchor_columns["slow"]] = [9, 10, 9, 12, 13, 14, 9, 15]

    signals = build_signals_from_spec(df, spec, plan)
    assert signals.entries.dtype == bool
    assert signals.exits.dtype == bool
    assert signals.short_entries.dtype == bool
    assert signals.short_exits.dtype == bool
    assert len(signals.entries) == len(df)
    assert len(signals.exits) == len(df)
    assert len(signals.short_entries) == len(df)
    assert len(signals.short_exits) == len(df)
    assert bool(signals.exits.any()) is False
    assert bool(signals.short_entries.any()) is False
    assert bool(signals.short_exits.any()) is False
    assert bool(signals.entries.isna().any()) is False


def test_build_signals_from_spec_can_emit_short_entries_when_enabled() -> None:
    spec = make_ema_pullback_strategy_spec(enabled_sides=("long", "short"))
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(), plan)

    df["close"] = [102.0, 101.0, 99.0, 98.0, 97.0, 96.0, 95.0, 94.0]
    df["high"] = [101.0] * len(df)
    df[plan.anchor_columns["fast"]] = [90.0] * len(df)
    df[plan.anchor_columns["anchor"]] = [100.0] * len(df)
    df[plan.anchor_columns["slow"]] = [110.0] * len(df)

    signals = build_signals_from_spec(df, spec, plan)
    assert bool(signals.entries.any()) is False
    assert signals.short_entries.tolist() == [False, False, True, False, False, False, False, False]
    assert bool(signals.short_entries.isna().any()) is False


def test_blocker_and_signal_exit_composition_semantics() -> None:
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    left = pd.Series([True, True, False, True], index=idx)
    right = pd.Series([True, False, True, True], index=idx)

    blockers = compose_blocker_signals((left, right))
    exits = compose_signal_exit_signals((left, right))

    assert blockers.tolist() == [True, False, False, True]
    assert exits.tolist() == [True, True, True, True]
