"""Single source of truth for supported candle timeframes (Phase 5).

All duration, Bybit interval, and pandas frequency strings are derived
from :data:`TIMEFRAME_SPECS` — no duplicate mapping tables elsewhere.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TimeframeSpec:
    id: str
    duration_ms: int
    bybit_interval: str
    pandas_freq: str


TIMEFRAME_SPECS: tuple[TimeframeSpec, ...] = (
    TimeframeSpec("5m", 5 * 60_000, "5", "5min"),
    TimeframeSpec("15m", 15 * 60_000, "15", "15min"),
    TimeframeSpec("1h", 60 * 60_000, "60", "1h"),
    TimeframeSpec("4h", 4 * 60 * 60_000, "240", "4h"),
    TimeframeSpec("1d", 24 * 60 * 60_000, "D", "1D"),
)

SUPPORTED_TIMEFRAMES: tuple[str, ...] = tuple(s.id for s in TIMEFRAME_SPECS)
_SPEC_BY_ID: dict[str, TimeframeSpec] = {s.id: s for s in TIMEFRAME_SPECS}


def validate_timeframe(tf: str) -> str:
    """Return canonical timeframe id or raise ValueError."""

    key = tf.strip()
    if key not in _SPEC_BY_ID:
        allowed = ", ".join(SUPPORTED_TIMEFRAMES)
        raise ValueError(f"unsupported timeframe {tf!r}; supported: {allowed}")
    return key


def timeframe_ms(tf: str) -> int:
    """Bar duration in milliseconds for a supported timeframe."""

    return _SPEC_BY_ID[validate_timeframe(tf)].duration_ms


def bybit_interval(tf: str) -> str:
    """Bybit `interval` string for kline REST (minutes as decimal string or D/W)."""

    return _SPEC_BY_ID[validate_timeframe(tf)].bybit_interval


def pandas_freq_alias(tf: str) -> str:
    """pandas-compatible frequency string (e.g. for research backtests)."""

    return _SPEC_BY_ID[validate_timeframe(tf)].pandas_freq
