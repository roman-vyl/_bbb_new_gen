"""Fetcher protocol for Phase 2."""

from __future__ import annotations

from typing import Protocol

from data_engine.contracts import Candle, FetchRequest


class IFetcher(Protocol):
    def fetch_candles(self, request: FetchRequest) -> list[Candle]:
        """Fetch candles for a half-open request window."""
