"""Phase 2 candle contract."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Candle:
    """Single OHLCV candle stored by open time in milliseconds."""

    symbol: str
    timeframe: str
    open_time_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float
