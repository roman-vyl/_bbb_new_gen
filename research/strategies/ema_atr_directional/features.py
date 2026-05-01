"""Feature columns from OHLCV DataFrame only (no IO, no vectorbt)."""

from __future__ import annotations

import pandas as pd


def add_ema_columns(df: pd.DataFrame, *, ema_fast: int, ema_slow: int) -> pd.DataFrame:
    """Append EMA columns using ``ewm(span=..., adjust=False)`` on ``close``."""

    out = df.copy()
    close = out["close"].astype(float)
    out[f"ema_{ema_fast}"] = close.ewm(span=ema_fast, adjust=False).mean()
    out[f"ema_{ema_slow}"] = close.ewm(span=ema_slow, adjust=False).mean()
    return out
