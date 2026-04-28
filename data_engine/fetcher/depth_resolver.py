"""Resolve and cache Bybit symbol launch time for Phase 2."""

from __future__ import annotations

from collections.abc import Callable

from data_engine.store import Db

from .bybit_rest import fetch_launch_time_ms


def resolve_launch_time_ms(
    db: Db,
    symbol: str,
    fetch_launch_time: Callable[[str], int] = fetch_launch_time_ms,
) -> int:
    cached = db.get_launch_time_ms(symbol)
    if cached is not None:
        return cached

    launch_time_ms = fetch_launch_time(symbol)
    db.set_launch_time_ms(symbol, launch_time_ms)
    return launch_time_ms
