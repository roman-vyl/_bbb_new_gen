"""Pure helpers for EMA smoke backtest (testable without vectorbt)."""

from __future__ import annotations

import pandas as pd

from data_engine.contracts import Candle


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
    """Append EMA columns using pandas ewm(adjust=False) on close."""

    out = df.copy()
    close = out["close"].astype(float)
    out[f"ema_{fast}"] = close.ewm(span=fast, adjust=False).mean()
    out[f"ema_{slow}"] = close.ewm(span=slow, adjust=False).mean()
    return out


def ema_crossover_signals(
    df: pd.DataFrame, fast_col: str = "ema_20", slow_col: str = "ema_50"
) -> tuple[pd.Series, pd.Series]:
    """Long on bullish cross, exit on bearish cross (boolean Series, index-aligned)."""

    fast = df[fast_col]
    slow = df[slow_col]
    prev_fast = fast.shift(1)
    prev_slow = slow.shift(1)
    entries = (fast > slow) & (prev_fast <= prev_slow)
    exits = (fast < slow) & (prev_fast >= prev_slow)
    return entries.fillna(False), exits.fillna(False)
