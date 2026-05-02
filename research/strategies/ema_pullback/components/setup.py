"""Setup components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd


def pullback_to_anchor(df: pd.DataFrame, anchor_col: str, lookback: int) -> pd.Series:
    """True when low touched anchor within last ``lookback`` candles."""

    if lookback <= 0:
        raise ValueError("lookback must be > 0")
    touched = df["low"] <= df[anchor_col]
    return touched.rolling(window=lookback, min_periods=1).max().astype(bool)
