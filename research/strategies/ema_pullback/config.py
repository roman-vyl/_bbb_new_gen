"""Runtime-only execution config for ema_pullback research entrypoints."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ExecutionConfig:
    """Technical run settings only; strategy semantics live in StrategySpec."""

    family: str
    symbol: str
    timeframe: str
    db_path: Path | None
    init_cash: float
    fees: float
    slippage: float

    def __post_init__(self) -> None:
        if self.family != "ema_pullback":
            raise ValueError("family must be 'ema_pullback'")
        if not self.symbol.strip():
            raise ValueError("symbol must be non-empty")
        if not self.timeframe.strip():
            raise ValueError("timeframe must be non-empty")
        if self.init_cash <= 0:
            raise ValueError("init_cash must be > 0")
        if self.fees < 0:
            raise ValueError("fees must be >= 0")
        if self.slippage < 0:
            raise ValueError("slippage must be >= 0")

DEFAULT_EXECUTION_CONFIG = ExecutionConfig(
    family="ema_pullback",
    symbol="BTCUSDT",
    timeframe="1h",
    db_path=None,
    init_cash=100.0,
    fees=0.0,
    slippage=0.0,
)
