"""Trigger components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import TradeSide


def reclaim_anchor_trace(
    df: pd.DataFrame,
    anchor_col: str,
    lookback: int,
    *,
    side: TradeSide = "long",
) -> dict[str, pd.Series]:
    """Per-bar internals for reclaim_anchor (wick probe in prior window + close reclaim)."""

    if lookback <= 0:
        raise ValueError("lookback must be > 0")

    close = df["close"].astype(float)
    anchor = df[anchor_col].astype(float)

    if side == "long":
        probed = df["low"].astype(float) <= anchor
        reclaimed = close > anchor
    elif side == "short":
        probed = df["high"].astype(float) >= anchor
        reclaimed = close < anchor
    else:
        raise ValueError("side must be 'long' or 'short'")

    had_prior_probe = (
        probed.astype(int)
        .rolling(lookback, min_periods=lookback)
        .max()
        .shift(1)
        .fillna(0)
        .astype(bool)
    )
    trigger = had_prior_probe & reclaimed.fillna(False).astype(bool)

    return {
        "close": close,
        "anchor": anchor,
        "probed": probed.fillna(False).astype(bool),
        "had_prior_probe": had_prior_probe,
        "reclaimed": reclaimed.fillna(False).astype(bool),
        "trigger": trigger,
    }


def reclaim_anchor(
    df: pd.DataFrame,
    anchor_col: str,
    lookback: int,
    *,
    side: TradeSide = "long",
) -> pd.Series:
    """True when anchor was wick-probed in the prior lookback window and close reclaims."""

    return reclaim_anchor_trace(df, anchor_col, lookback, side=side)["trigger"]


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
