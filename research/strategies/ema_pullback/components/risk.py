"""Risk filter components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd


def no_risk_filter(df: pd.DataFrame) -> pd.Series:
    """No risk filter: pass all rows."""

    return pd.Series(True, index=df.index, dtype=bool)
