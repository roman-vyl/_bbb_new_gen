"""Server-side indicators for chart overlays (no browser calculation)."""

from __future__ import annotations

from research_api.contracts.chart import ChartBar, IndicatorPoint


def compute_ema_points(bars: list[ChartBar], *, period: int) -> list[IndicatorPoint]:
    """EMA with ``span=period``, ``adjust=False`` (matches pandas ``ewm`` default)."""

    if period < 1:
        raise ValueError("period must be >= 1")
    if not bars:
        return []

    alpha = 2.0 / (period + 1)
    ema = float(bars[0].close)
    out: list[IndicatorPoint] = [IndicatorPoint(time=bars[0].time, value=ema)]

    for bar in bars[1:]:
        ema = alpha * float(bar.close) + (1.0 - alpha) * ema
        out.append(IndicatorPoint(time=bar.time, value=ema))

    return out
