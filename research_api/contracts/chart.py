"""Chart view models for Workbench (OHLC bars and indicator overlays)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Series kind tags — chart view layer only (not strategy features / not Data Engine store).
CHART_OVERLAY_EMA_KIND: Literal["chart_overlay_ema"] = "chart_overlay_ema"
AnchorStackEmaRole = Literal["fast", "anchor", "slow"]


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
    """Indicator sample aligned to ``ChartBar.time``.

    ``kind`` marks view-layer overlays (e.g. ``chart_overlay_ema``). Not strategy
    feature columns and not Data Engine ``indicator_values``.
    """

    model_config = ConfigDict(extra="forbid")

    time: int = Field(description="Unix seconds (matches chart bar open time).")
    value: float
    kind: Literal["chart_overlay_ema"] = Field(
        default=CHART_OVERLAY_EMA_KIND,
        description="Overlay series discriminator for Workbench chart only.",
    )


class ChartEmaOverlay(BaseModel):
    """One anchor-stack EMA line for Workbench chart (overlay on candle closes)."""

    model_config = ConfigDict(extra="forbid")

    role: AnchorStackEmaRole
    period: int = Field(ge=1, description="EMA period (from run strategy_spec anchor_stack).")
    points: list[IndicatorPoint]


class ChartMarketBundle(BaseModel):
    """OHLC bars + anchor-stack chart overlay EMAs from a single storage read."""

    model_config = ConfigDict(extra="forbid")

    candles: list[ChartBar]
    ema_overlays: list[ChartEmaOverlay]
