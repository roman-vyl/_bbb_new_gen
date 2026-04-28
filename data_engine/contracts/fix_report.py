"""Fix report contract for Phase 3 DIM repair."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .gap import Gap
from .time_window import TimeWindow


@dataclass(frozen=True, slots=True)
class FixReport:
    symbol: str
    timeframe: str
    window: TimeWindow
    status: Literal["ok", "incomplete", "invalid", "error"]
    gaps_before: list[Gap]
    gaps_after: list[Gap]
    fetched_rows: int
    written_rows: int
    invalid_ohlc_rows: int
    fresh: bool
    diagnostics: list[str]
