"""Frozen run config for the ema_pullback family (Stage 2 pipeline).

Portfolio knobs (init_cash, fees, slippage) are also surfaced via ``risk.py``
for vectorbt; this dataclass remains the single source of truth.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class EmaPullbackConfig:
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


DEFAULT_CONFIG = EmaPullbackConfig(
    family="ema_pullback",
    variant="ema_pullback_baseline",
    symbol="BTCUSDT",
    timeframe="1h",
    db_path=None,
    ema_fast=20,
    ema_slow=50,
    init_cash=100.0,
    fees=0.0,
    slippage=0.0,
)
