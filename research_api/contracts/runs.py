"""Run report contracts — mirror ``research/results`` JSON schema v3/v4."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SUPPORTED_REPORT_SCHEMA_VERSIONS: frozenset[int] = frozenset({3, 4})


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
    entry_profile: str | None = None
    entry_context_state: str | None = None
    active_exit_profile: str | None = None
    exit_group: str | None = None
    exit_profile: str | None = None
    exit_component_id: str | None = None
    exit_instance_id: str | None = None
    exit_kind: str | None = None
    gross_pnl: float | None = None
    fees_paid: float | None = None
    gross_return_pct: float | None = None
    hold_bars: int | None = None
    hold_minutes: int | None = None


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


class ProfileBucketMetrics(SideMetrics):
    model_config = ConfigDict(extra="forbid")

    avg_hold_bars: float | None = None
    exit_reason_mix: dict[str, int] = Field(default_factory=dict)


class ExitReasonBucketMetrics(SideMetrics):
    model_config = ConfigDict(extra="forbid")

    avg_hold_bars: float | None = None


class FeeDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_fees_paid: float
    gross_pnl: float
    net_pnl: float
    fees_rate: float
    fees_as_pct_of_gross_profit: float | None = None


class VariantMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    long: SideMetrics
    short: SideMetrics
    total: TotalMetrics
    open_trades: OpenTradesMetrics
    profile_breakdown: dict[str, ProfileBucketMetrics] | None = None
    exit_reason_breakdown: dict[str, ExitReasonBucketMetrics] | None = None
    fee_diagnostics: FeeDiagnostics | None = None


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
