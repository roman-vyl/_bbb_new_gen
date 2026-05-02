from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec_instances import ema_pullback_fast20_anchor200_slow1000_spec


def _ohlcv(n: int = 60) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=n, freq="h", tz="UTC")
    close = pd.Series([100.0 + i * 0.25 for i in range(n)], index=idx)
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


def test_add_feature_columns_from_plan_creates_ema_columns() -> None:
    plan = build_feature_plan_from_strategy_spec(ema_pullback_fast20_anchor200_slow1000_spec())
    enriched = add_feature_columns_from_plan(_ohlcv(), plan)
    assert "ema_close_base_20" in enriched.columns
    assert "ema_close_base_200" in enriched.columns
    assert "ema_close_base_1000" in enriched.columns


def test_add_feature_columns_from_plan_creates_atr_column() -> None:
    plan = build_feature_plan_from_strategy_spec(ema_pullback_fast20_anchor200_slow1000_spec())
    enriched = add_feature_columns_from_plan(_ohlcv(), plan)
    assert "atr_close_base_14" in enriched.columns


def test_add_feature_columns_from_plan_creates_distance_from_spec_multipliers() -> None:
    plan = build_feature_plan_from_strategy_spec(ema_pullback_fast20_anchor200_slow1000_spec())
    enriched = add_feature_columns_from_plan(_ohlcv(), plan)
    atr = enriched["atr_close_base_14"].astype(float)
    x15 = enriched["atr_close_base_14_x1_5"].astype(float)
    x40 = enriched["atr_close_base_14_x4_0"].astype(float)
    valid = atr.notna()
    pd.testing.assert_series_equal(x15.where(valid), (1.5 * atr).where(valid), check_names=False)
    pd.testing.assert_series_equal(x40.where(valid), (4.0 * atr).where(valid), check_names=False)
