from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec_instances import ema_pullback_fast20_anchor200_slow1000_spec


def _ohlcv(n: int = 30) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=n, freq="h", tz="UTC")
    close = pd.Series([100.0 + float(i) * 0.5 for i in range(n)], index=idx)
    return pd.DataFrame(
        {
            "open": close,
            "high": close + 0.2,
            "low": close - 0.2,
            "close": close,
            "volume": 1.0,
        },
        index=idx,
    )


def test_feature_plan_expected_ids() -> None:
    plan = build_feature_plan_from_strategy_spec(ema_pullback_fast20_anchor200_slow1000_spec())
    assert [f.feature_id for f in plan.features] == [
        "ema_close_base_20",
        "ema_close_base_200",
        "ema_close_base_1000",
        "atr_close_base_14",
        "atr_close_base_14_x1_5",
        "atr_close_base_14_x4_0",
    ]


def test_add_feature_columns_from_plan_creates_expected_columns() -> None:
    plan = build_feature_plan_from_strategy_spec(ema_pullback_fast20_anchor200_slow1000_spec())
    df = add_feature_columns_from_plan(_ohlcv(40), plan)
    for col in (
        "ema_close_base_20",
        "ema_close_base_200",
        "ema_close_base_1000",
        "atr_close_base_14",
        "atr_close_base_14_x1_5",
        "atr_close_base_14_x4_0",
    ):
        assert col in df.columns


def test_atr_distance_columns_follow_plan_multipliers() -> None:
    plan = build_feature_plan_from_strategy_spec(ema_pullback_fast20_anchor200_slow1000_spec())
    df = add_feature_columns_from_plan(_ohlcv(40), plan)
    atr = df["atr_close_base_14"].astype(float)
    x15 = df["atr_close_base_14_x1_5"].astype(float)
    x40 = df["atr_close_base_14_x4_0"].astype(float)
    valid = atr.notna()
    pd.testing.assert_series_equal(x15.where(valid), (1.5 * atr).where(valid), check_names=False)
    pd.testing.assert_series_equal(x40.where(valid), (4.0 * atr).where(valid), check_names=False)
