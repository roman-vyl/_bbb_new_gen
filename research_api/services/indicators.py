"""Chart overlay indicators for Research Workbench (view layer only).

These series are computed on demand for Lightweight Charts. They are **not**
persisted Data Engine ``indicator_values`` and **not** research strategy feature
columns (e.g. ``ema_close_base_200`` from the feature pipeline).
"""

from __future__ import annotations

from research_api.contracts.chart import CHART_OVERLAY_EMA_KIND, ChartBar, IndicatorPoint

# Re-export for callers documenting series kind.
__all__ = ["CHART_OVERLAY_EMA_KIND", "compute_chart_overlay_ema"]


def compute_chart_overlay_ema(bars: list[ChartBar], *, period: int) -> list[IndicatorPoint]:
    """EMA line for chart overlay only (``CHART_OVERLAY_EMA_KIND``).

    Algorithm (visualization defaults):
    - Uses **only** closes in the supplied ``bars`` window (no history before the first bar).
    - First point: ``EMA = close`` of the first bar in the window.
    - Then: ``alpha = 2 / (period + 1)``, ``adjust=False`` (same recurrence as pandas ``ewm``).

    Warmup / window bias:
    - If the requested ``[from_ms, to_ms)`` is narrowed (e.g. trade-focus slice),
      ``EMA(period)`` is **distorted** because warmup bars before ``from_ms`` are omitted.
    - For a faithful EMA(200), extend ``from_ms`` backward by at least ``period`` bars
      (future BFF enhancement); current report-wide range is usually sufficient.
    """

    if period < 1:
        raise ValueError("period must be >= 1")
    if not bars:
        return []

    alpha = 2.0 / (period + 1)
    ema = float(bars[0].close)
    out: list[IndicatorPoint] = [
        IndicatorPoint(time=bars[0].time, value=ema, kind=CHART_OVERLAY_EMA_KIND),
    ]

    for bar in bars[1:]:
        ema = alpha * float(bar.close) + (1.0 - alpha) * ema
        out.append(IndicatorPoint(time=bar.time, value=ema, kind=CHART_OVERLAY_EMA_KIND))

    return out
