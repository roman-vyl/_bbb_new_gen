"""Direction components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd


def ema_anchor_stack_bullish(
    df: pd.DataFrame,
    fast_col: str,
    anchor_col: str,
    slow_col: str,
) -> pd.Series:
    """Direction is long only when fast > anchor > slow."""

    return ((df[fast_col] > df[anchor_col]) & (df[anchor_col] > df[slow_col])).fillna(False).astype(bool)
