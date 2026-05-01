"""Frozen run config for the ema_atr_directional family (Stage 1)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class EmaAtrDirectionalConfig:
    family: str
    variant: str
    symbol: str
    timeframe: str
    db_path: Path | None
    ema_fast: int
    ema_slow: int
    init_cash: float
    fees: float
    slippage: float


DEFAULT_CONFIG = EmaAtrDirectionalConfig(
    family="ema_atr_directional",
    variant="ema_crossover_baseline",
    symbol="BTCUSDT",
    timeframe="1h",
    db_path=None,
    ema_fast=20,
    ema_slow=50,
    init_cash=100.0,
    fees=0.0,
    slippage=0.0,
)
