"""Setup components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import TradeSide


def pullback_to_anchor(
    df: pd.DataFrame,
    anchor_col: str,
    lookback: int,
    side: TradeSide = "long",
) -> pd.Series:
    """True when price touched anchor within last ``lookback`` candles."""

    if lookback <= 0:
        raise ValueError("lookback must be > 0")
    if side == "long":
        touched = df["low"] <= df[anchor_col]
    elif side == "short":
        touched = df["high"] >= df[anchor_col]
    else:
        raise ValueError("side must be 'long' or 'short'")
    return touched.rolling(window=lookback, min_periods=1).max().astype(bool)
