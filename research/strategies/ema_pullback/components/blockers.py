"""Blocker components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import BlockerRuleSpec
from research.strategies.ema_pullback.spec import TradeSide


def no_blockers(
    df: pd.DataFrame,
    side: TradeSide = "long",
    **_: object,
) -> pd.Series:
    """No blockers: pass all rows."""

    _ = side
    return pd.Series(True, index=df.index, dtype=bool)


def counter_candle_blocker(
    df: pd.DataFrame,
    side: TradeSide = "long",
    **_: object,
) -> pd.Series:
    """Allow entries only when the candle is not counter to the requested side."""

    open_ = df["open"].astype(float)
    close = df["close"].astype(float)
    if side == "long":
        out = close >= open_
    elif side == "short":
        out = close <= open_
    else:
        raise ValueError("side must be 'long' or 'short'")
    return out.fillna(False).astype(bool)


def rsi_extreme_blocker(
    df: pd.DataFrame,
    side: TradeSide = "long",
    *,
    rule: BlockerRuleSpec,
    rsi_col: str | None = None,
) -> pd.Series:
    """Block entries when prepared RSI is extreme for the requested side."""

    if rule.rsi is None or rsi_col is None:
        raise ValueError("rsi_extreme_blocker requires rule.rsi and rsi_col")
    rsi = df[rsi_col].astype(float)
    if side == "long":
        if rule.long_min is None:
            raise ValueError("rsi_extreme_blocker requires long_min for long side")
        extreme = rsi < float(rule.long_min)
    elif side == "short":
        if rule.short_max is None:
            raise ValueError("rsi_extreme_blocker requires short_max for short side")
        extreme = rsi > float(rule.short_max)
    else:
        raise ValueError("side must be 'long' or 'short'")

    if rule.lookback > 1:
        extreme = extreme.rolling(window=rule.lookback, min_periods=1).max().astype(bool)
    return (~extreme.fillna(False)).astype(bool)
