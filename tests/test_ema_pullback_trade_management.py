"""Stage 8 tests: trade management profiles and resolver."""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.feature_profile import EMA_PULLBACK_20_200_500_PROFILE_ID
from research.strategies.ema_pullback.trade_management import (
    FEATURE_DISTANCE_SL_TP_PROFILE,
    FIXED_PCT_SL_TP_PROFILE,
    NONE_TRADE_MANAGEMENT_PROFILE,
    TRADE_MANAGEMENT_PROFILES,
    feature_distance_sl_tp_portfolio_kwargs,
    resolve_portfolio_kwargs_for_signals,
    resolve_trade_management_profile,
)
import research.strategies.ema_pullback.trade_management as trade_management


def test_default_trade_management_profile_exists() -> None:
    assert NONE_TRADE_MANAGEMENT_PROFILE in TRADE_MANAGEMENT_PROFILES


def test_fixed_pct_sl_tp_profile_exists() -> None:
    profile = TRADE_MANAGEMENT_PROFILES[FIXED_PCT_SL_TP_PROFILE]
    assert profile.portfolio_kwargs["sl_stop"] == 0.03
    assert profile.portfolio_kwargs["tp_stop"] == 0.06


def test_resolve_trade_management_profile_works() -> None:
    profile = resolve_trade_management_profile(FIXED_PCT_SL_TP_PROFILE)
    assert profile.profile_id == FIXED_PCT_SL_TP_PROFILE


def test_resolve_trade_management_profile_fails_for_unknown() -> None:
    with pytest.raises(ValueError, match="unknown trade management profile"):
        resolve_trade_management_profile("does_not_exist")


def test_feature_distance_sl_tp_profile_registered() -> None:
    profile = TRADE_MANAGEMENT_PROFILES[FEATURE_DISTANCE_SL_TP_PROFILE]
    assert profile.profile_id == FEATURE_DISTANCE_SL_TP_PROFILE
    assert profile.portfolio_kwargs == {}
    assert profile.stop_distance_binding == "trade_stop_distance"
    assert profile.take_distance_binding == "trade_take_distance"


def test_resolve_portfolio_kwargs_uses_prepared_distance_columns() -> None:
    idx = pd.date_range("2024-01-01", periods=5, freq="h", tz="UTC")
    close = pd.Series([100.0, 101.0, 102.0, 103.0, 104.0], index=idx)
    stop_dist = pd.Series([1.5, 3.0, 4.5, 6.0, 7.5], index=idx)
    take_dist = pd.Series([4.0, 8.0, 12.0, 16.0, 20.0], index=idx)
    df = pd.DataFrame(
        {
            "close": close,
            "atr_14_x1_5": stop_dist,
            "atr_14_x4_0": take_dist,
        },
        index=idx,
    )
    tm = resolve_trade_management_profile(FEATURE_DISTANCE_SL_TP_PROFILE)
    kwargs = resolve_portfolio_kwargs_for_signals(
        tm,
        df=df,
        close=close,
        feature_profile_id=EMA_PULLBACK_20_200_500_PROFILE_ID,
    )
    pd.testing.assert_series_equal(
        kwargs["sl_stop"].reindex(close.index),
        (stop_dist / close).reindex(close.index),
        check_names=False,
    )
    pd.testing.assert_series_equal(
        kwargs["tp_stop"].reindex(close.index),
        (take_dist / close).reindex(close.index),
        check_names=False,
    )


def test_feature_distance_masks_non_finite_close_and_distances() -> None:
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    close = pd.Series([100.0, float("nan"), 0.0, 103.0], index=idx)
    stop_dist = pd.Series([1.0, 1.0, 1.0, float("inf")], index=idx)
    take_dist = pd.Series([2.0, 2.0, 2.0, 2.0], index=idx)
    df = pd.DataFrame(
        {"atr_14_x1_5": stop_dist, "atr_14_x4_0": take_dist},
        index=idx,
    )
    tm = resolve_trade_management_profile(FEATURE_DISTANCE_SL_TP_PROFILE)
    kwargs = feature_distance_sl_tp_portfolio_kwargs(
        df,
        close=close,
        feature_profile_id=EMA_PULLBACK_20_200_500_PROFILE_ID,
        trade_profile=tm,
    )
    assert pd.isna(kwargs["sl_stop"].iloc[1])
    assert pd.isna(kwargs["sl_stop"].iloc[2])
    assert pd.isna(kwargs["sl_stop"].iloc[3])


def test_trade_management_not_tied_to_atr_identifiers() -> None:
    src = Path(trade_management.__file__).read_text(encoding="utf-8").lower()
    assert "atr" not in src
    assert "1.5" not in src
    assert "4.0" not in src
