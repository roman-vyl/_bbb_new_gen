"""Deterministic timeframe math for Phase 2 backfill."""

from __future__ import annotations

TF_TO_MS = {
    "1m": 60_000,
    "3m": 3 * 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "30m": 30 * 60_000,
    "1h": 60 * 60_000,
    "2h": 2 * 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "6h": 6 * 60 * 60_000,
    "12h": 12 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
    "1w": 7 * 24 * 60 * 60_000,
}


def tf_ms(tf: str) -> int:
    try:
        return TF_TO_MS[tf]
    except KeyError as exc:
        raise ValueError(f"unsupported timeframe: {tf}") from exc


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
