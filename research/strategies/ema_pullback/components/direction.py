"""Direction components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import TradeSide


def ema_anchor_stack_bullish(
    df: pd.DataFrame,
    fast_col: str,
    anchor_col: str,
    slow_col: str,
    side: TradeSide = "long",
) -> pd.Series:
    """Direction is valid when the anchor stack matches the requested side."""

    if side == "long":
        out = (df[fast_col] > df[anchor_col]) & (df[anchor_col] > df[slow_col])
    elif side == "short":
        out = (df[fast_col] < df[anchor_col]) & (df[anchor_col] < df[slow_col])
    else:
        raise ValueError("side must be 'long' or 'short'")
    return out.fillna(False).astype(bool)
