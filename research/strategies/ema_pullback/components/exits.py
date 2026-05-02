"""Exit signals: current EMA bearish crossover semantics (no vectorbt)."""

from __future__ import annotations

import pandas as pd


def ema_bearish_cross_exit(
    df: pd.DataFrame,
    fast_col: str,
    slow_col: str,
) -> pd.Series:
    """True when fast EMA crosses below slow; first row never fires."""

    fast = df[fast_col]
    slow = df[slow_col]
    prev_fast = fast.shift(1)
    prev_slow = slow.shift(1)
    return ((fast < slow) & (prev_fast >= prev_slow)).fillna(False).astype(bool)


def no_signal_exit(df: pd.DataFrame) -> pd.Series:
    """No signal exit: always False (exits handled by stop/take)."""

    return pd.Series(False, index=df.index, dtype=bool)
