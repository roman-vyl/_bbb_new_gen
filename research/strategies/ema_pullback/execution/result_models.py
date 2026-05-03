"""Typed result contracts for ema_pullback execution modules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class LoadedCandles:
    """OHLCV frame plus candle range metadata needed by reports/artifacts."""

    ohlcv: Any
    candles_count: int
    from_open_time_ms: int
    to_open_time_ms: int


@dataclass(frozen=True)
class SideMetrics:
    trades: int
    pnl: float
    return_pct: float
    profit_factor: float | None
    win_rate: float | None

    def to_payload(self) -> dict[str, int | float | None]:
        return {
            "trades": self.trades,
            "pnl": self.pnl,
            "return_pct": self.return_pct,
            "profit_factor": self.profit_factor,
            "win_rate": self.win_rate,
        }


@dataclass(frozen=True)
class VariantMetrics:
    long: SideMetrics
    short: SideMetrics
    total: SideMetrics

    def to_payload(self) -> dict[str, dict[str, int | float | None]]:
        return {
            "long": self.long.to_payload(),
            "short": self.short.to_payload(),
            "total": self.total.to_payload(),
        }


@dataclass(frozen=True)
class VariantResult:
    variant: str
    config_id: str
    symbol: str
    timeframe: str
    strategy_spec: dict[str, Any]
    metrics: VariantMetrics
    trade_records: list[dict[str, Any]]

    def to_payload(self) -> dict[str, Any]:
        return {
            "variant": self.variant,
            "config_id": self.config_id,
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "strategy_spec": self.strategy_spec,
            "metrics": self.metrics.to_payload(),
            "trade_records": self.trade_records,
        }
