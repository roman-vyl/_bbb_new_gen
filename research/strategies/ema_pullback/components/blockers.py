"""Blocker components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd


def no_blockers(df: pd.DataFrame) -> pd.Series:
    """No blockers: pass all rows."""

    return pd.Series(True, index=df.index, dtype=bool)
