"""Exit components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import SignalExitRuleSpec
from research.strategies.ema_pullback.spec import TradeSide


def no_signal_exit(
    df: pd.DataFrame,
    anchor_col: str | None = None,
    side: TradeSide = "long",
    **_: object,
) -> pd.Series:
    """No signal exit: always False (exits handled by stop/take)."""

    _ = anchor_col
    _ = side
    return pd.Series(False, index=df.index, dtype=bool)


def exit_on_anchor_lost(
    df: pd.DataFrame,
    anchor_col: str | None = None,
    side: TradeSide = "long",
    **_: object,
) -> pd.Series:
    """Exit when close moves back through the anchor against the position."""

    if anchor_col is None:
        raise ValueError("anchor_col is required")
    close = df["close"].astype(float)
    anchor = df[anchor_col].astype(float)
    if side == "long":
        out = close < anchor
    elif side == "short":
        out = close > anchor
    else:
        raise ValueError("side must be 'long' or 'short'")
    return out.fillna(False).astype(bool)


def rsi_signal_exit(
    df: pd.DataFrame,
    anchor_col: str | None = None,
    side: TradeSide = "long",
    *,
    rule: SignalExitRuleSpec,
    rsi_col: str | None = None,
) -> pd.Series:
    """Exit when prepared RSI reaches the configured side-aware threshold."""

    _ = anchor_col
    if rule.rsi is None or rsi_col is None:
        raise ValueError("rsi_signal_exit requires rule.rsi and rsi_col")
    rsi = df[rsi_col].astype(float)
    if side == "long":
        if rule.long_exit_above is None:
            raise ValueError("rsi_signal_exit requires long_exit_above for long side")
        out = rsi > float(rule.long_exit_above)
    elif side == "short":
        if rule.short_exit_below is None:
            raise ValueError("rsi_signal_exit requires short_exit_below for short side")
        out = rsi < float(rule.short_exit_below)
    else:
        raise ValueError("side must be 'long' or 'short'")
    return out.fillna(False).astype(bool)
