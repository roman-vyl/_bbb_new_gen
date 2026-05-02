from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.components import resolve_component


def _frame() -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    return pd.DataFrame(
        {
            "close": [99.0, 100.0, 101.0, 102.0],
            "low": [101.0, 99.0, 103.0, 104.0],
            "ema_close_base_20": [11.0, 12.0, 10.0, 14.0],
            "ema_close_base_200": [10.0, 11.0, 10.0, 13.0],
            "ema_close_base_1000": [9.0, 10.0, 9.0, 12.0],
        },
        index=idx,
    )


def test_registry_resolves_new_stage10_components() -> None:
    assert callable(resolve_component("direction", "ema_anchor_stack_bullish").func)
    assert callable(resolve_component("blockers", "no_blockers").func)
    assert callable(resolve_component("setup", "pullback_to_anchor").func)
    assert callable(resolve_component("trigger", "reclaim_anchor").func)
    assert callable(resolve_component("exits", "no_signal_exit").func)
    assert callable(resolve_component("risk", "no_risk_filter").func)


def test_direction_component_uses_columns_not_period_constants() -> None:
    df = _frame()
    fn = resolve_component("direction", "ema_anchor_stack_bullish").func
    out = fn(df, "ema_close_base_20", "ema_close_base_200", "ema_close_base_1000")
    assert out.tolist() == [True, True, False, True]


def test_setup_trigger_exit_risk_components_shape() -> None:
    df = _frame()
    setup = resolve_component("setup", "pullback_to_anchor").func(df, "ema_close_base_200", 3)
    trigger = resolve_component("trigger", "reclaim_anchor").func(df, "ema_close_base_200")
    exits = resolve_component("exits", "no_signal_exit").func(df)
    risk = resolve_component("risk", "no_risk_filter").func(df)
    assert len(setup) == len(df)
    assert len(trigger) == len(df)
    assert bool(exits.any()) is False
    assert bool(risk.all()) is True


def test_resolve_component_fails_for_unknown_values() -> None:
    with pytest.raises(ValueError, match="unknown component role"):
        resolve_component("unknown", "x")
    with pytest.raises(ValueError, match="unknown component_id"):
        resolve_component("trigger", "unknown")
