"""Tests for prepared ATR distance columns in features (family-local, no DB)."""

from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.feature_profile import EMA_PULLBACK_20_200_500_PROFILE_ID
from research.strategies.ema_pullback.features import add_feature_columns


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


def test_add_feature_columns_creates_atr_distance_series() -> None:
    df = add_feature_columns(
        _ohlcv(40),
        profile_id=EMA_PULLBACK_20_200_500_PROFILE_ID,
        ema_fast=20,
        ema_slow=200,
    )
    assert "atr_14" in df.columns
    assert "atr_14_x1_5" in df.columns
    assert "atr_14_x4_0" in df.columns


def test_atr_scaled_columns_match_multipliers() -> None:
    df = add_feature_columns(
        _ohlcv(40),
        profile_id=EMA_PULLBACK_20_200_500_PROFILE_ID,
        ema_fast=20,
        ema_slow=200,
    )
    atr = df["atr_14"].astype(float)
    x15 = df["atr_14_x1_5"].astype(float)
    x40 = df["atr_14_x4_0"].astype(float)
    valid = atr.notna()
    pd.testing.assert_series_equal(x15.where(valid), (1.5 * atr).where(valid), check_names=False)
    pd.testing.assert_series_equal(x40.where(valid), (4.0 * atr).where(valid), check_names=False)
