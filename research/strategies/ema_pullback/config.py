"""Execution-only config for Stage 10 ema_pullback runs."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class ExecutionConfig:
    symbol: str
    base_timeframe: str
    db_path: Path | None
    init_cash: float
    fees: float
    slippage: float

    def __post_init__(self) -> None:
        if not self.symbol.strip():
            raise ValueError("symbol must be non-empty")
        if not self.base_timeframe.strip():
            raise ValueError("base_timeframe must be non-empty")
        if self.init_cash <= 0:
            raise ValueError("init_cash must be > 0")
        if self.fees < 0:
            raise ValueError("fees must be >= 0")
        if self.slippage < 0:
            raise ValueError("slippage must be >= 0")


DEFAULT_EXECUTION_CONFIG = ExecutionConfig(
    symbol="BTCUSDT",
    base_timeframe="1h",
    db_path=None,
    init_cash=100.0,
    fees=0.0,
    slippage=0.0,
)
