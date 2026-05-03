"""Exit components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import ExitRuleSpec
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


def rsi_signal_exit(
    df: pd.DataFrame,
    anchor_col: str | None = None,
    side: TradeSide = "long",
    *,
    rule: ExitRuleSpec,
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


def atr_distance_exit(
    df: pd.DataFrame,
    anchor_col: str | None = None,
    side: TradeSide = "long",
    *,
    rule: ExitRuleSpec,
    distance_col: str | None = None,
) -> pd.Series:
    """Return a prepared ATR-based distance series for stop/take exits."""

    _ = anchor_col
    _ = side
    if rule.distance is None or distance_col is None:
        raise ValueError("atr_distance_exit requires rule.distance and distance_col")
    return df[distance_col].astype(float)
