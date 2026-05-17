"""Run report contracts — mirror ``research/results`` JSON schema v3."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SUPPORTED_REPORT_SCHEMA_VERSIONS: frozenset[int] = frozenset({3})


class TradeOverlay(BaseModel):
    """Chart overlay fields for one trade (subset of trade record)."""

    model_config = ConfigDict(extra="forbid")

    trade_id: int
    direction: Literal["long", "short"]
    status: Literal["open", "closed"]
    entry_time_ms: int
    exit_time_ms: int | None
    entry_price: float | None
    exit_price: float | None
    exit_reason: str


class TradeRecord(TradeOverlay):
    model_config = ConfigDict(extra="forbid")

    size: float | None
    pnl: float | None
    return_pct: float | None


class SideMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trades: int
    pnl: float
    return_pct: float
    profit_factor: float | None
    win_rate: float | None


class TotalMetrics(SideMetrics):
    model_config = ConfigDict(extra="forbid")

    sharpe: float
    max_drawdown: float


class OpenTradesMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    long: int
    short: int
    total: int


class VariantMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    long: SideMetrics
    short: SideMetrics
    total: TotalMetrics
    open_trades: OpenTradesMetrics


class DataRange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_open_time_ms: int
    to_open_time_ms: int


class RunVariant(BaseModel):
    model_config = ConfigDict(extra="allow")

    variant: str
    config_id: str
    symbol: str
    timeframe: str
    strategy_spec: dict[str, Any]
    metrics: VariantMetrics
    component_counters: list[Any] = Field(default_factory=list)
    trade_records: list[TradeRecord]

    @property
    def trade_overlays(self) -> list[TradeOverlay]:
        return [
            TradeOverlay(
                trade_id=t.trade_id,
                direction=t.direction,
                status=t.status,
                entry_time_ms=t.entry_time_ms,
                exit_time_ms=t.exit_time_ms,
                entry_price=t.entry_price,
                exit_price=t.exit_price,
                exit_reason=t.exit_reason,
            )
            for t in self.trade_records
        ]


class RunSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str
    created_at: str
    family: str
    symbol: str
    timeframe: str


class RunReport(BaseModel):
    model_config = ConfigDict(extra="allow")

    run_id: str
    created_at: str
    report_schema_version: int
    family: str
    symbol: str
    timeframe: str
    candles: int
    data_range: DataRange
    variants_count: int
    variants: list[RunVariant]
