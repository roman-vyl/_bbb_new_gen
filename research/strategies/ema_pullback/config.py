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


def execution_config_from_external(
    *,
    family: str,
    symbol: str,
    timeframe: str,
    db_path: Path | None,
    init_cash: float | None,
    fees: float | None,
    slippage: float | None,
) -> ExecutionConfig:
    """Build validated ExecutionConfig after external config load (market + optional execution)."""

    base = DEFAULT_EXECUTION_CONFIG
    return ExecutionConfig(
        family=family.strip(),
        symbol=symbol.strip().upper(),
        timeframe=timeframe.strip(),
        db_path=db_path,
        init_cash=float(init_cash) if init_cash is not None else base.init_cash,
        fees=float(fees) if fees is not None else base.fees,
        slippage=float(slippage) if slippage is not None else base.slippage,
    )
