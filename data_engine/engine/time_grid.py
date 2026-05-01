"""Deterministic timeframe math for Phase 2 backfill."""

from __future__ import annotations

from data_engine.contracts.timeframes import timeframe_ms


def tf_ms(tf: str) -> int:
    """Bar step in ms; delegates to :func:`timeframe_ms` (Phase 5 whitelist)."""

    return timeframe_ms(tf)


def align_to_grid(ts_ms: int, tf: str) -> int:
    step = tf_ms(tf)
    return (ts_ms // step) * step


def ceil_to_grid(ts_ms: int, tf: str) -> int:
    step = tf_ms(tf)
    aligned = align_to_grid(ts_ms, tf)
    if aligned == ts_ms:
        return aligned
    return aligned + step


def next_close_ms(ts_ms: int, tf: str) -> int:
    return align_to_grid(ts_ms, tf) + tf_ms(tf)


def last_closed_open_time_ms(now_ms: int, tf: str) -> int:
    return align_to_grid(now_ms, tf) - tf_ms(tf)
