from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.execution.signals import build_signals_from_spec
from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec_instances import default_ema_pullback_strategy_spec


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

    entries, exits = build_signals_from_spec(df, spec, plan)
    assert entries.dtype == bool
    assert exits.dtype == bool
    assert len(entries) == len(df)
    assert len(exits) == len(df)
    assert bool(exits.any()) is False
    assert bool(entries.isna().any()) is False
