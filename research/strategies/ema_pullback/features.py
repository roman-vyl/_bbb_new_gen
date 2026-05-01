"""Feature columns from OHLCV DataFrame only (no IO, no vectorbt)."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.feature_profile import resolve_feature_profile


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
    return add_ema_columns(
        df,
        ema_fast=ema_fast,
        ema_slow=ema_slow,
        extra_periods=tuple(sorted(profile_periods)),
    )
