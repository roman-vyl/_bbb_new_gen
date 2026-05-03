from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.execution.exits import build_exit_outputs_from_spec
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec_instances import default_ema_pullback_strategy_spec


def test_build_exit_outputs_uses_exit_distance_columns_for_stops() -> None:
    spec = default_ema_pullback_strategy_spec()
    plan = build_feature_plan_from_strategy_spec(spec)

    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    close = pd.Series([100.0, 101.0, 102.0, 103.0], index=idx)
    stop_dist = pd.Series([1.5, 3.0, 4.5, 6.0], index=idx)
    take_dist = pd.Series([4.0, 8.0, 12.0, 16.0], index=idx)
    df = pd.DataFrame(
        {
            "close": close,
            "ema_close_base_200": close,
            plan.exit_distance_columns["stop_loss"]: stop_dist,
            plan.exit_distance_columns["take_profit"]: take_dist,
        },
        index=idx,
    )

    exits = build_exit_outputs_from_spec(df, spec, plan)
    pd.testing.assert_series_equal(exits.sl_stop, stop_dist / close, check_names=False)
    pd.testing.assert_series_equal(exits.tp_stop, take_dist / close, check_names=False)
    assert exits.exits.tolist() == [False, False, False, False]
    assert exits.short_exits.tolist() == [False, False, False, False]
