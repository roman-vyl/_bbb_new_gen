"""Entry/exit signals from feature columns (no vectorbt)."""

from __future__ import annotations

import pandas as pd


def crossover_from_ema_columns(
    df: pd.DataFrame,
    fast_col: str,
    slow_col: str,
) -> tuple[pd.Series, pd.Series]:
    """Long on bullish cross, exit on bearish cross; first row never fires."""

    fast = df[fast_col]
    slow = df[slow_col]
    prev_fast = fast.shift(1)
    prev_slow = slow.shift(1)
    entries = (fast > slow) & (prev_fast <= prev_slow)
    exits = (fast < slow) & (prev_fast >= prev_slow)
    return entries.fillna(False), exits.fillna(False)


def ema_crossover_signals(
    df: pd.DataFrame,
    *,
    ema_fast: int,
    ema_slow: int,
) -> tuple[pd.Series, pd.Series]:
    """Crossover using columns ``ema_{ema_fast}`` and ``ema_{ema_slow}``."""

    return crossover_from_ema_columns(
        df,
        f"ema_{ema_fast}",
        f"ema_{ema_slow}",
    )
