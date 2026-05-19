"""Trigger components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import TradeSide


def reclaim_anchor_trace(
    df: pd.DataFrame,
    anchor_col: str,
    side: TradeSide = "long",
) -> dict[str, pd.Series]:
    """Per-bar internals for reclaim_anchor."""

    close = df["close"].astype(float)
    anchor = df[anchor_col].astype(float)
    prev_close = close.shift(1)
    prev_anchor = anchor.shift(1)
    if side == "long":
        crossed_back = (prev_close <= prev_anchor) & (close > anchor)
    elif side == "short":
        crossed_back = (prev_close >= prev_anchor) & (close < anchor)
    else:
        raise ValueError("side must be 'long' or 'short'")
    return {
        "prev_close": prev_close,
        "prev_anchor": prev_anchor,
        "close": close,
        "anchor": anchor,
        "crossed_back": crossed_back.fillna(False).astype(bool),
        "trigger": crossed_back.fillna(False).astype(bool),
    }


def reclaim_anchor(
    df: pd.DataFrame,
    anchor_col: str,
    side: TradeSide = "long",
) -> pd.Series:
    """True when close reclaims anchor in the requested direction."""

    return reclaim_anchor_trace(df, anchor_col, side=side)["trigger"]


def touch_anchor_trace(
    df: pd.DataFrame,
    anchor_col: str,
    side: TradeSide = "long",
) -> dict[str, pd.Series]:
    """Per-bar internals for touch_anchor."""

    anchor = df[anchor_col].astype(float)
    close = df["close"].astype(float)
    if side == "long":
        touch = df["low"].astype(float) <= anchor
        close_ok = close >= anchor
    elif side == "short":
        touch = df["high"].astype(float) >= anchor
        close_ok = close <= anchor
    else:
        raise ValueError("side must be 'long' or 'short'")
    trigger = (touch & close_ok).astype(bool)
    return {
        "touch": touch.astype(bool),
        "close_ok": close_ok.astype(bool),
        "trigger": trigger,
    }


def touch_anchor(
    df: pd.DataFrame,
    anchor_col: str,
    side: TradeSide = "long",
) -> pd.Series:
    """True when the current candle touches the anchor from the side direction."""

    return touch_anchor_trace(df, anchor_col, side=side)["trigger"]
