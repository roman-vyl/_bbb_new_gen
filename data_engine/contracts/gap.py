"""Gap contract for Phase 3 DIM repair."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Gap:
    start_ms: int
    end_ms: int

    def __post_init__(self) -> None:
        if self.start_ms >= self.end_ms:
            raise ValueError("Gap requires start_ms < end_ms")
