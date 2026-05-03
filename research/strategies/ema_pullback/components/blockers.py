"""Blocker components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import TradeSide


def no_blockers(df: pd.DataFrame, side: TradeSide = "long") -> pd.Series:
    """No blockers: pass all rows."""

    _ = side
    return pd.Series(True, index=df.index, dtype=bool)
