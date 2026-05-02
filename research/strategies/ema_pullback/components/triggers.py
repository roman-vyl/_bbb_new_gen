"""Entry triggers: current EMA bullish crossover semantics (no vectorbt)."""

from __future__ import annotations

import pandas as pd


def ema_bullish_cross_entry(
    df: pd.DataFrame,
    fast_col: str,
    slow_col: str,
    **_: object,
) -> pd.Series:
    """True when fast EMA crosses above slow; first row never fires."""

    fast = df[fast_col]
    slow = df[slow_col]
    prev_fast = fast.shift(1)
    prev_slow = slow.shift(1)
    return ((fast > slow) & (prev_fast <= prev_slow)).fillna(False).astype(bool)


def reclaim_entry_anchor(
    df: pd.DataFrame,
    *,
    entry_anchor_col: str,
    **_: object,
) -> pd.Series:
    """True when close reclaims anchor from below/equal on previous candle."""

    close = df["close"].astype(float)
    anchor = df[entry_anchor_col].astype(float)
    prev_close = close.shift(1)
    prev_anchor = anchor.shift(1)
    return ((prev_close <= prev_anchor) & (close > anchor)).fillna(False).astype(bool)


def reclaim_anchor(df: pd.DataFrame, anchor_col: str) -> pd.Series:
    """True when close reclaims anchor from previous candle."""

    close = df["close"].astype(float)
    anchor = df[anchor_col].astype(float)
    prev_close = close.shift(1)
    prev_anchor = anchor.shift(1)
    return ((prev_close <= prev_anchor) & (close > anchor)).fillna(False).astype(bool)
