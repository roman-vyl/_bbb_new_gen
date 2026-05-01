"""Direction stage: whether long/short are permitted (no vectorbt)."""

from __future__ import annotations

import pandas as pd

# Stage 2 baseline: only the long contour is active. ``short_allowed`` is
# reserved for future Strategy Constructor wiring without changing baseline
# behaviour (long-only portfolio).


def long_allowed_baseline(df: pd.DataFrame, **_: object) -> pd.Series:
    """EMA crossover baseline: no extra directional filter (all True)."""

    return pd.Series(True, index=df.index, dtype=bool)


def short_allowed_baseline(df: pd.DataFrame) -> pd.Series:
    """Long-only baseline: short never permitted (explicit placeholder)."""

    return pd.Series(False, index=df.index, dtype=bool)


def intraday_and_swing_trend_long(
    df: pd.DataFrame,
    *,
    intraday_fast_col: str,
    intraday_slow_col: str,
    swing_fast_col: str,
    swing_slow_col: str,
    **_: object,
) -> pd.Series:
    """Long direction only when intraday and swing EMA relations are bullish."""

    intraday_ok = df[intraday_fast_col] > df[intraday_slow_col]
    swing_ok = df[swing_fast_col] > df[swing_slow_col]
    return (intraday_ok & swing_ok).fillna(False).astype(bool)
