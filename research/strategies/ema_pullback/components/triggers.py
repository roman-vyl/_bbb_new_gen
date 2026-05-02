"""Trigger components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd


def reclaim_anchor(df: pd.DataFrame, anchor_col: str) -> pd.Series:
    """True when close reclaims anchor from previous candle."""

    close = df["close"].astype(float)
    anchor = df[anchor_col].astype(float)
    prev_close = close.shift(1)
    prev_anchor = anchor.shift(1)
    return ((prev_close <= prev_anchor) & (close > anchor)).fillna(False).astype(bool)
