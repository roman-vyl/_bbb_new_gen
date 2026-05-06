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
class OpenTradesBreakdown:
    """Counts of open (not yet closed) positions by side; separate from realized metrics."""

    long: int
    short: int
    total: int

    def to_payload(self) -> dict[str, int]:
        return {"long": self.long, "short": self.short, "total": self.total}


@dataclass(frozen=True)
class VariantMetrics:
    long: SideMetrics
    short: SideMetrics
    total: SideMetrics
    sharpe: float
    max_drawdown: float
    open_trades: OpenTradesBreakdown

    def to_payload(self) -> dict[str, Any]:
        total_payload = self.total.to_payload()
        total_payload["sharpe"] = self.sharpe
        total_payload["max_drawdown"] = self.max_drawdown
        return {
            "long": self.long.to_payload(),
            "short": self.short.to_payload(),
            "total": total_payload,
            "open_trades": self.open_trades.to_payload(),
        }


@dataclass(frozen=True)
class VariantResult:
    variant: str
    config_id: str
    symbol: str
    timeframe: str
    strategy_spec: dict[str, Any]
    metrics: VariantMetrics
    component_counters: list[dict[str, Any]]
    trade_records: list[dict[str, Any]]

    def to_payload(self) -> dict[str, Any]:
        return {
            "variant": self.variant,
            "config_id": self.config_id,
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "strategy_spec": self.strategy_spec,
            "metrics": self.metrics.to_payload(),
            "component_counters": self.component_counters,
            "trade_records": self.trade_records,
        }
