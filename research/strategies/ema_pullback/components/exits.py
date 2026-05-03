"""Exit components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import TradeSide


def no_signal_exit(df: pd.DataFrame, side: TradeSide = "long") -> pd.Series:
    """No signal exit: always False (exits handled by stop/take)."""

    _ = side
    return pd.Series(False, index=df.index, dtype=bool)
