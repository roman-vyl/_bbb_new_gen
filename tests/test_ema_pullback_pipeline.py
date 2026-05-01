"""Unit tests for ema_pullback Stage 2 pipeline blocks and composer."""

from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.blockers import blockers_ok_baseline
from research.strategies.ema_pullback.components import no_risk_filter
from research.strategies.ema_pullback.config import DEFAULT_CONFIG
from research.strategies.ema_pullback.direction import (
    intraday_and_swing_trend_long,
    long_allowed_baseline,
    short_allowed_baseline,
)
from research.strategies.ema_pullback.exits import ema_bearish_cross_exit
from research.strategies.ema_pullback.features import add_ema_columns, add_feature_columns
from research.strategies.ema_pullback.setup import pullback_to_entry_anchor, setup_long_baseline
from research.strategies.ema_pullback.triggers import ema_bullish_cross_entry, reclaim_entry_anchor
from research.strategies.ema_pullback.risk import portfolio_risk_from_config
from research.strategies.ema_pullback.signals import (
    compose_final_signals,
    crossover_from_ema_columns,
    ema_crossover_signals,
    ema_pullback_pipeline_signals,
)
from research.strategies.ema_pullback.feature_profile import EMA_PULLBACK_1H_20_200_500_PROFILE_ID



def _minimal_ohlcv(n: int = 5) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=n, freq="h", tz="UTC")
    close = pd.Series(range(100, 100 + n), dtype=float, index=idx)
    return pd.DataFrame(
        {
            "open": close,
            "high": close + 0.1,
            "low": close - 0.1,
            "close": close,
            "volume": 1.0,
        },
        index=idx,
    )


def test_long_allowed_baseline_all_true_aligned() -> None:
    df = _minimal_ohlcv(12)
    s = long_allowed_baseline(df)
    assert s.index.equals(df.index)
    assert bool(s.all()) is True


def test_short_allowed_baseline_all_false() -> None:
    df = _minimal_ohlcv(8)
    s = short_allowed_baseline(df)
    assert s.index.equals(df.index)
    assert bool(s.any()) is False


def test_blockers_and_setup_baselines_do_not_filter() -> None:
    df = _minimal_ohlcv(10)
    assert bool(blockers_ok_baseline(df).all()) is True
    assert bool(setup_long_baseline(df).all()) is True


def test_portfolio_risk_from_config_matches_fields() -> None:
    r = portfolio_risk_from_config(DEFAULT_CONFIG)
    assert r.init_cash == DEFAULT_CONFIG.init_cash
    assert r.fees == DEFAULT_CONFIG.fees
    assert r.slippage == DEFAULT_CONFIG.slippage


def test_bullish_bearish_cross_first_row_never_fires() -> None:
    df = add_ema_columns(_minimal_ohlcv(60), ema_fast=3, ema_slow=5)
    e = ema_bullish_cross_entry(df, "ema_3", "ema_5")
    x = ema_bearish_cross_exit(df, "ema_3", "ema_5")
    assert not bool(e.iloc[0]) and not bool(x.iloc[0])


def test_crossover_matches_direct_trigger_exit() -> None:
    df = add_ema_columns(_minimal_ohlcv(80), ema_fast=5, ema_slow=8)
    e1, x1 = crossover_from_ema_columns(df, "ema_5", "ema_8")
    e2 = ema_bullish_cross_entry(df, "ema_5", "ema_8")
    x2 = ema_bearish_cross_exit(df, "ema_5", "ema_8")
    assert e1.equals(e2)
    assert x1.equals(x2)


def test_pipeline_signals_match_crossover_with_baseline_stubs() -> None:
    df = add_ema_columns(_minimal_ohlcv(90), ema_fast=4, ema_slow=7)
    pipe_e, pipe_x = ema_pullback_pipeline_signals(df, ema_fast=4, ema_slow=7)
    cross_e, cross_x = crossover_from_ema_columns(df, "ema_4", "ema_7")
    assert pipe_e.equals(cross_e)
    assert pipe_x.equals(cross_x)


def test_ema_crossover_signals_uses_composer_path() -> None:
    df = add_ema_columns(_minimal_ohlcv(85), ema_fast=20, ema_slow=50)
    a, b = ema_crossover_signals(df, ema_fast=20, ema_slow=50)
    c, d = ema_pullback_pipeline_signals(df, ema_fast=20, ema_slow=50)
    assert a.equals(c)
    assert b.equals(d)


def test_ema_crossover_signals_rejects_unknown_trigger_component_id() -> None:
    df = add_ema_columns(_minimal_ohlcv(40), ema_fast=5, ema_slow=8)
    with pytest.raises(ValueError, match="unknown component_id"):
        ema_crossover_signals(
            df,
            ema_fast=5,
            ema_slow=8,
            trigger_component="missing_trigger",
        )


def test_compose_final_signals_with_all_true_matches_trigger() -> None:
    df = add_ema_columns(_minimal_ohlcv(70), ema_fast=6, ema_slow=9)
    trig = ema_bullish_cross_entry(df, "ema_6", "ema_9")
    ex = ema_bearish_cross_exit(df, "ema_6", "ema_9")
    fe, fx = compose_final_signals(
        long_allowed=long_allowed_baseline(df),
        blockers_ok=blockers_ok_baseline(df),
        setup_long=setup_long_baseline(df),
        trigger_long=trig,
        risk_ok=no_risk_filter(df),
        exit_signal=ex,
    )
    assert fe.equals(trig)
    assert fx.equals(ex)


def test_crossover_synthetic_bullish_then_bearish() -> None:
    """Hand-built EMA columns: one clear up-cross then down-cross."""

    idx = pd.date_range("2024-01-01", periods=6, freq="h", tz="UTC")
    fast = pd.Series([1.0, 2.0, 3.0, 2.0, 1.0, 0.0], index=idx)
    slow = pd.Series([2.0, 2.0, 2.0, 2.0, 2.0, 2.0], index=idx)
    df = pd.DataFrame({"ema_f": fast, "ema_s": slow})
    e, x = crossover_from_ema_columns(df, "ema_f", "ema_s")
    assert not bool(e.iloc[0])
    assert bool(e.iloc[2]) is True  # 3>2, prev 2<=2
    assert bool(x.iloc[4]) is True  # 1<2, prev 2>=2


def test_intraday_and_swing_direction_component() -> None:
    idx = pd.date_range("2024-01-01", periods=3, freq="h", tz="UTC")
    df = pd.DataFrame(
        {
            "ema_20": [11.0, 12.0, 10.0],
            "ema_200": [10.0, 11.0, 10.0],
            "ema_500": [9.0, 12.0, 9.0],
        },
        index=idx,
    )
    out = intraday_and_swing_trend_long(
        df,
        intraday_fast_col="ema_20",
        intraday_slow_col="ema_200",
        swing_fast_col="ema_200",
        swing_slow_col="ema_500",
    )
    assert out.tolist() == [True, False, False]


def test_pullback_to_entry_anchor_detects_recent_touch() -> None:
    idx = pd.date_range("2024-01-01", periods=5, freq="h", tz="UTC")
    df = pd.DataFrame(
        {
            "low": [101.0, 99.0, 103.0, 104.0, 105.0],
            "ema_200": [100.0, 100.0, 100.0, 100.0, 100.0],
        },
        index=idx,
    )
    out = pullback_to_entry_anchor(df, entry_anchor_col="ema_200", window=3)
    assert out.tolist() == [False, True, True, True, False]


def test_reclaim_entry_anchor_detects_cross_above_anchor() -> None:
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    df = pd.DataFrame(
        {
            "close": [99.0, 100.0, 101.0, 102.0],
            "ema_200": [100.0, 100.0, 100.0, 103.0],
        },
        index=idx,
    )
    out = reclaim_entry_anchor(df, entry_anchor_col="ema_200")
    assert out.tolist() == [False, False, True, False]


def test_add_feature_columns_adds_profile_ema_periods() -> None:
    df = _minimal_ohlcv(20)
    enriched = add_feature_columns(
        df,
        profile_id=EMA_PULLBACK_1H_20_200_500_PROFILE_ID,
        ema_fast=20,
        ema_slow=200,
    )
    assert "ema_20" in enriched.columns
    assert "ema_200" in enriched.columns
    assert "ema_500" in enriched.columns
