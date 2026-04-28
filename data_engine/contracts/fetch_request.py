"""Phase 2 fetch request contract."""

from __future__ import annotations

from dataclasses import dataclass

from .time_window import TimeWindow


@dataclass(frozen=True, slots=True)
class FetchRequest:
    symbol: str
    timeframe: str
    window: TimeWindow
