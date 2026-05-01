"""Feature columns from OHLCV DataFrame only (no IO, no vectorbt)."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.feature_profile import (
    FeatureProfile,
    resolve_feature_profile,
)


def _true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    prev_close = close.shift(1)
    h_l = high - low
    h_pc = (high - prev_close).abs()
    l_pc = (low - prev_close).abs()
    return pd.concat([h_l, h_pc, l_pc], axis=1).max(axis=1)


def _atr_rolling_mean(high: pd.Series, low: pd.Series, close: pd.Series, *, period: int) -> pd.Series:
    tr = _true_range(high, low, close)
    return tr.rolling(window=period, min_periods=period).mean()


def _add_prepared_atr_distance_columns(df: pd.DataFrame, profile: FeatureProfile) -> pd.DataFrame:
    """Append ATR-based prepared distance columns when the profile declares them."""

    keys = set(profile.series.keys())
    need_atr = "atr_14" in keys
    need_x15 = "atr_14_x1_5" in keys
    need_x40 = "atr_14_x4_0" in keys
    if not (need_atr or need_x15 or need_x40):
        return df

    high = df["high"].astype(float)
    low = df["low"].astype(float)
    close = df["close"].astype(float)
    atr = _atr_rolling_mean(high, low, close, period=14)

    out = df.copy()
    if need_atr:
        out["atr_14"] = atr
    if need_x15:
        out["atr_14_x1_5"] = 1.5 * atr
    if need_x40:
        out["atr_14_x4_0"] = 4.0 * atr
    return out


def add_ema_columns(
    df: pd.DataFrame,
    *,
    ema_fast: int,
    ema_slow: int,
    extra_periods: tuple[int, ...] = (),
) -> pd.DataFrame:
    """Append required EMA columns using ``ewm(span=..., adjust=False)`` on ``close``."""

    out = df.copy()
    close = out["close"].astype(float)
    periods = sorted({ema_fast, ema_slow, *extra_periods})
    for period in periods:
        out[f"ema_{period}"] = close.ewm(span=period, adjust=False).mean()
    # Stage 5 compatibility aliases used by default feature relation roles.
    out["ema_fast"] = out[f"ema_{ema_fast}"]
    out["ema_slow"] = out[f"ema_{ema_slow}"]
    return out


def add_feature_columns(
    df: pd.DataFrame,
    *,
    profile_id: str,
    ema_fast: int,
    ema_slow: int,
) -> pd.DataFrame:
    """Append EMA columns needed by selected feature profile and crossover fallback."""

    profile = resolve_feature_profile(profile_id)
    profile_periods: set[int] = set()
    for feature_series in profile.series.values():
        if feature_series.indicator == "ema" and len(feature_series.params) == 1:
            profile_periods.add(feature_series.params[0])
    with_ema = add_ema_columns(
        df,
        ema_fast=ema_fast,
        ema_slow=ema_slow,
        extra_periods=tuple(sorted(profile_periods)),
    )
    return _add_prepared_atr_distance_columns(with_ema, profile)
