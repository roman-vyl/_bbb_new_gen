"""Setup components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import TradeSide


def untouched_anchor_setup_trace(
    df: pd.DataFrame,
    anchor_col: str,
    lookback: int,
    active_bars: int,
    side: TradeSide = "long",
) -> dict[str, pd.Series]:
    """Per-bar internals for untouched_anchor_setup (same formulas as final setup)."""

    if lookback <= 0:
        raise ValueError("lookback must be > 0")
    if active_bars <= 0:
        raise ValueError("active_bars must be > 0")

    anchor = df[anchor_col].astype(float)

    if side == "long":
        touch = df["low"].astype(float) <= anchor
        side_ok = df["close"].astype(float) > anchor
    elif side == "short":
        touch = df["high"].astype(float) >= anchor
        side_ok = df["close"].astype(float) < anchor
    else:
        raise ValueError("side must be 'long' or 'short'")

    prior_touch = touch.shift(1, fill_value=False).astype(bool)
    untouched_prior = (
        ~prior_touch.rolling(lookback, min_periods=lookback).max().astype(bool)
        & pd.Series([i >= lookback for i in range(len(df))], index=df.index, dtype=bool)
    )
    armed_pre = side_ok & untouched_prior & ~touch
    first_touch = touch & untouched_prior
    touch_active = first_touch.rolling(active_bars, min_periods=1).max().astype(bool)
    setup = (armed_pre | touch_active).astype(bool)

    return {
        "touch": touch.astype(bool),
        "side_ok": side_ok.astype(bool),
        "prior_touch": prior_touch,
        "untouched_prior": untouched_prior.astype(bool),
        "armed_pre": armed_pre.astype(bool),
        "first_touch": first_touch.astype(bool),
        "touch_active": touch_active.astype(bool),
        "setup": setup,
    }


def untouched_anchor_setup(
    df: pd.DataFrame,
    anchor_col: str,
    lookback: int,
    active_bars: int,
    side: TradeSide = "long",
) -> pd.Series:
    """True during armed regime: anchor untouched for lookback bars, then through touch window."""

    return untouched_anchor_setup_trace(df, anchor_col, lookback, active_bars, side=side)["setup"]
