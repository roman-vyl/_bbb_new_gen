"""Entry triggers: current EMA bullish crossover semantics (no vectorbt)."""

from __future__ import annotations

import pandas as pd


def ema_bullish_cross_entry(
    df: pd.DataFrame,
    fast_col: str,
    slow_col: str,
) -> pd.Series:
    """True when fast EMA crosses above slow; first row never fires."""

    fast = df[fast_col]
    slow = df[slow_col]
    prev_fast = fast.shift(1)
    prev_slow = slow.shift(1)
    return ((fast > slow) & (prev_fast <= prev_slow)).fillna(False).astype(bool)
