"""Typed result contracts for ema_pullback execution modules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from research.strategies.ema_pullback.spec import strategy_spec_to_dict


@dataclass(frozen=True)
class LoadedCandles:
    """OHLCV frame plus candle range metadata needed by reports/artifacts."""

    ohlcv: Any
    candles_count: int
    from_open_time_ms: int
    to_open_time_ms: int


@dataclass(frozen=True)
class VariantMetrics:
    trades: int
    sharpe: float
    profit_factor: float
    max_drawdown: float

    def to_payload(self) -> dict[str, int | float]:
        return {
            "trades": self.trades,
            "sharpe": self.sharpe,
            "profit_factor": self.profit_factor,
            "max_drawdown": self.max_drawdown,
        }


@dataclass(frozen=True)
class VariantResult:
    variant: str
    config_id: str
    strategy_spec: Any
    metrics: VariantMetrics
    trade_records: list[dict[str, Any]]

    def to_payload(self) -> dict[str, Any]:
        return {
            "variant": self.variant,
            "config_id": self.config_id,
            "strategy_spec": strategy_spec_to_dict(self.strategy_spec),
            "metrics": self.metrics.to_payload(),
            "trade_records": self.trade_records,
        }
