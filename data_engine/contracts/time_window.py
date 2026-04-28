"""Phase 2 half-open time window contract."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TimeWindow:
    """Half-open interval: [start_ms, end_ms)."""

    start_ms: int
    end_ms: int

    def __post_init__(self) -> None:
        if self.start_ms >= self.end_ms:
            raise ValueError("TimeWindow requires start_ms < end_ms")
