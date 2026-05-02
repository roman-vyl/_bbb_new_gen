"""Pure helpers for EMA smoke backtest (testable without vectorbt).

``candles_to_ohlcv_dataframe`` lives here (list[Candle] -> DataFrame).
EMA columns and crossover signals delegate to ``ema_pullback`` family
so there is a single implementation.
"""

from __future__ import annotations

import pandas as pd

from data_engine.contracts import Candle

from research.strategies.ema_pullback.execution.signals import (
    crossover_from_ema_columns,
)
from research.strategies.ema_pullback.features import add_ema_columns as _add_ema


def candles_to_ohlcv_dataframe(candles: list[Candle]) -> pd.DataFrame:
    """Build OHLCV frame indexed by candle open time (UTC).

    Rows follow candle list order (caller must pass ASC by open_time_ms).
    """

    if not candles:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])

    records = [
        {
            "open_time_ms": c.open_time_ms,
            "open": c.open,
            "high": c.high,
            "low": c.low,
            "close": c.close,
            "volume": c.volume,
        }
        for c in candles
    ]
    df = pd.DataFrame.from_records(records)
    idx = pd.to_datetime(df["open_time_ms"], unit="ms", utc=True)
    df = df.set_index(idx)
    return df[["open", "high", "low", "close", "volume"]]


def add_ema_columns(df: pd.DataFrame, fast: int = 20, slow: int = 50) -> pd.DataFrame:
    """Append EMA columns; wraps family ``add_ema_columns`` (legacy kw names)."""

    return _add_ema(df, ema_fast=fast, ema_slow=slow)


def ema_crossover_signals(
    df: pd.DataFrame,
    fast_col: str = "ema_20",
    slow_col: str = "ema_50",
) -> tuple[pd.Series, pd.Series]:
    """Long/exit crossover using named EMA columns (legacy API)."""

    return crossover_from_ema_columns(df, fast_col, slow_col)
