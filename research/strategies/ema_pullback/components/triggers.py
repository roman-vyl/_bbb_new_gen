"""Trigger components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import TradeSide


def reclaim_anchor(
    df: pd.DataFrame,
    anchor_col: str,
    side: TradeSide = "long",
) -> pd.Series:
    """True when close reclaims anchor in the requested direction."""

    close = df["close"].astype(float)
    anchor = df[anchor_col].astype(float)
    prev_close = close.shift(1)
    prev_anchor = anchor.shift(1)
    if side == "long":
        out = (prev_close <= prev_anchor) & (close > anchor)
    elif side == "short":
        out = (prev_close >= prev_anchor) & (close < anchor)
    else:
        raise ValueError("side must be 'long' or 'short'")
    return out.fillna(False).astype(bool)


def touch_anchor(
    df: pd.DataFrame,
    anchor_col: str,
    side: TradeSide = "long",
) -> pd.Series:
    """True when the current candle touches the anchor from the side direction."""

    anchor = df[anchor_col].astype(float)
    close = df["close"].astype(float)
    if side == "long":
        out = (df["low"].astype(float) <= anchor) & (close >= anchor)
    elif side == "short":
        out = (df["high"].astype(float) >= anchor) & (close <= anchor)
    else:
        raise ValueError("side must be 'long' or 'short'")
    return out.fillna(False).astype(bool)
