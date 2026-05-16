"""Chart view models for Workbench (OHLC bars and indicator overlays)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ChartBar(BaseModel):
    """Single OHLC bar for Lightweight Charts.

    ``time`` is Unix **seconds** (``Candle.open_time_ms // 1000``).
    """

    model_config = ConfigDict(extra="forbid")

    time: int = Field(description="Bar open time as Unix seconds (UTC).")
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


class IndicatorPoint(BaseModel):
    """Aligned indicator sample on the same time axis as ``ChartBar``."""

    model_config = ConfigDict(extra="forbid")

    time: int = Field(description="Unix seconds (matches chart bar open time).")
    value: float
