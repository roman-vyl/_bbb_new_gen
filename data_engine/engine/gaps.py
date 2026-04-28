"""Pure gap search for Phase 3."""

from __future__ import annotations

from data_engine.contracts import Gap, TimeWindow


def find_gaps_linear(timestamps: list[int], step_ms: int, window: TimeWindow) -> list[Gap]:
    if step_ms <= 0:
        raise ValueError("step_ms must be positive")

    expected = range(window.start_ms, window.end_ms, step_ms)
    actual = {
        ts
        for ts in timestamps
        if window.start_ms <= ts < window.end_ms
    }

    gaps: list[Gap] = []
    gap_start: int | None = None
    for ts in expected:
        if ts not in actual:
            if gap_start is None:
                gap_start = ts
            continue
        if gap_start is not None:
            gaps.append(Gap(gap_start, ts))
            gap_start = None

    if gap_start is not None:
        gaps.append(Gap(gap_start, window.end_ms))

    return gaps
