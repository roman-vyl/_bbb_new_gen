"""Exit components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd


def no_signal_exit(df: pd.DataFrame) -> pd.Series:
    """No signal exit: always False (exits handled by stop/take)."""

    return pd.Series(False, index=df.index, dtype=bool)
