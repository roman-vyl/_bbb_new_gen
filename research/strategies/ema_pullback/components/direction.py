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


def ema_anchor_stack_bullish(
    df: pd.DataFrame,
    fast_col: str,
    anchor_col: str,
    slow_col: str,
) -> pd.Series:
    """Direction is long only when fast > anchor > slow."""

    return ((df[fast_col] > df[anchor_col]) & (df[anchor_col] > df[slow_col])).fillna(False).astype(bool)
