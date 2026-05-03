from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.components import resolve_component
from research.strategies.ema_pullback.spec import (
    BlockerRuleSpec,
    ExitRuleSpec,
    RsiFeatureSpec,
)


def _frame() -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    return pd.DataFrame(
        {
            "close": [99.0, 100.0, 101.0, 102.0],
            "high": [101.0, 102.0, 103.0, 104.0],
            "low": [101.0, 99.0, 103.0, 104.0],
            "ema_close_base_20": [11.0, 12.0, 10.0, 14.0],
            "ema_close_base_200": [10.0, 11.0, 10.0, 13.0],
            "ema_close_base_1000": [9.0, 10.0, 9.0, 12.0],
        },
        index=idx,
    )


def test_registry_resolves_new_stage10_components() -> None:
    assert callable(resolve_component("direction", "ema_anchor_stack_trend").func)
    assert callable(resolve_component("blockers", "no_blockers").func)
    assert callable(resolve_component("blockers", "counter_candle_blocker").func)
    assert callable(resolve_component("blockers", "rsi_extreme_blocker").func)
    assert callable(resolve_component("setup", "pullback_to_anchor").func)
    assert callable(resolve_component("trigger", "reclaim_anchor").func)
    assert callable(resolve_component("trigger", "touch_anchor").func)
    assert callable(resolve_component("exits", "no_signal_exit").func)
    assert callable(resolve_component("exits", "rsi_signal_exit").func)
    assert callable(resolve_component("exits", "atr_stop_loss").func)
    assert callable(resolve_component("exits", "atr_take_profit").func)
    assert callable(resolve_component("risk", "no_risk_filter").func)


def test_direction_component_uses_columns_not_period_constants() -> None:
    df = _frame()
    fn = resolve_component("direction", "ema_anchor_stack_trend").func
    out = fn(df, "ema_close_base_20", "ema_close_base_200", "ema_close_base_1000")
    assert out.tolist() == [True, True, False, True]


def test_direction_component_supports_short_side() -> None:
    df = _frame()
    fn = resolve_component("direction", "ema_anchor_stack_trend").func
    out = fn(df, "ema_close_base_1000", "ema_close_base_200", "ema_close_base_20", side="short")
    assert out.tolist() == [True, True, False, True]


def test_setup_trigger_exit_risk_components_shape() -> None:
    df = _frame()
    setup = resolve_component("setup", "pullback_to_anchor").func(df, "ema_close_base_200", 3)
    trigger = resolve_component("trigger", "reclaim_anchor").func(df, "ema_close_base_200")
    exits = resolve_component("exits", "no_signal_exit").func(df, side="short")
    blockers = resolve_component("blockers", "no_blockers").func(df, side="short")
    risk = resolve_component("risk", "no_risk_filter").func(df, side="short")
    assert len(setup) == len(df)
    assert len(trigger) == len(df)
    assert bool(exits.any()) is False
    assert bool(blockers.all()) is True
    assert bool(risk.all()) is True


def test_setup_component_supports_short_side() -> None:
    df = _frame()
    fn = resolve_component("setup", "pullback_to_anchor").func
    out = fn(df, "ema_close_base_200", 1, side="short")
    assert out.tolist() == [True, True, True, True]


def test_trigger_component_supports_long_and_short_sides() -> None:
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    df = pd.DataFrame(
        {
            "close": [9.0, 11.0, 11.0, 9.0],
            "ema_close_base_200": [10.0, 10.0, 10.0, 10.0],
        },
        index=idx,
    )
    fn = resolve_component("trigger", "reclaim_anchor").func
    assert fn(df, "ema_close_base_200", side="long").tolist() == [False, True, False, False]
    assert fn(df, "ema_close_base_200", side="short").tolist() == [False, False, False, True]


def test_touch_anchor_trigger_supports_long_and_short_sides() -> None:
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    df = pd.DataFrame(
        {
            "high": [11.0, 12.0, 9.5, 10.5],
            "low": [10.5, 9.5, 8.5, 10.1],
            "close": [9.8, 10.5, 9.0, 9.8],
            "ema_close_base_200": [10.0, 10.0, 10.0, 10.0],
        },
        index=idx,
    )
    fn = resolve_component("trigger", "touch_anchor").func
    assert fn(df, "ema_close_base_200", side="long").tolist() == [False, True, False, False]
    assert fn(df, "ema_close_base_200", side="short").tolist() == [True, False, False, True]


def test_counter_candle_blocker_supports_long_and_short_sides() -> None:
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    df = pd.DataFrame(
        {
            "open": [10.0, 10.0, 10.0, 10.0],
            "close": [11.0, 9.0, 10.0, 8.0],
        },
        index=idx,
    )
    fn = resolve_component("blockers", "counter_candle_blocker").func
    assert fn(df, side="long").tolist() == [True, False, True, False]
    assert fn(df, side="short").tolist() == [False, True, True, True]


def test_rsi_extreme_blocker_uses_prepared_rsi_column() -> None:
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    df = pd.DataFrame({"rsi_close_base_14": [20.0, 40.0, 80.0, 60.0]}, index=idx)
    rule = BlockerRuleSpec(
        component_id="rsi_extreme_blocker",
        rsi=RsiFeatureSpec(timeframe="base", period=14),
        lookback=2,
        long_min=30.0,
        short_max=70.0,
    )
    fn = resolve_component("blockers", "rsi_extreme_blocker").func
    assert fn(df, side="long", rule=rule, rsi_col="rsi_close_base_14").tolist() == [
        False,
        False,
        True,
        True,
    ]
    assert fn(df, side="short", rule=rule, rsi_col="rsi_close_base_14").tolist() == [
        True,
        True,
        False,
        False,
    ]


def test_rsi_signal_exit_uses_prepared_rsi_column() -> None:
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    df = pd.DataFrame({"rsi_close_base_14": [20.0, 40.0, 80.0, 60.0]}, index=idx)
    rule = ExitRuleSpec(
        component_id="rsi_signal_exit",
        exit_kind="signal",
        rsi=RsiFeatureSpec(timeframe="base", period=14),
        long_exit_above=70.0,
        short_exit_below=30.0,
    )
    fn = resolve_component("exits", "rsi_signal_exit").func
    assert fn(df, side="long", rule=rule, rsi_col="rsi_close_base_14").tolist() == [
        False,
        False,
        True,
        False,
    ]
    assert fn(df, side="short", rule=rule, rsi_col="rsi_close_base_14").tolist() == [
        True,
        False,
        False,
        False,
    ]


def test_resolve_component_fails_for_unknown_values() -> None:
    with pytest.raises(ValueError, match="unknown component role"):
        resolve_component("unknown", "x")
    with pytest.raises(ValueError, match="unknown component_id"):
        resolve_component("trigger", "unknown")
