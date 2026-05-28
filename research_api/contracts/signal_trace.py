"""Per-bar entry pipeline trace for Workbench Chart (phase 5)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SignalTraceMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variant: str
    component_ids: dict[str, str]
    setup_params: dict[str, int]
    trigger_params: dict[str, int] = Field(default_factory=dict)
    blocker_instances: list[dict[str, str]]


class SideSignalTrace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    direction_ok: list[bool]
    blockers_ok: list[bool]
    setup_ok: list[bool]
    trigger_ok: list[bool]
    risk_ok: list[bool]
    signal_entry: list[bool]
    stop_ready: list[bool]
    portfolio_entry: list[bool]
    internals: dict[str, Any] = Field(default_factory=dict)


class ContextConsumptionTraceRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str
    component_id: str
    context_ref: str
    policy_id: str
    context_applied: list[bool]
    instance_id: str | None = None
    outcome: dict[str, Any] | None = None


class HtfContextTrace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: list[str]
    fast: list[float | None]
    anchor: list[float | None]
    slow: list[float | None]
    meta: dict[str, Any] = Field(default_factory=dict)


class SignalTraceBundle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    times: list[int] = Field(description="Unix seconds per bar, aligned with chart candles")
    meta: SignalTraceMeta
    htf_context: HtfContextTrace = Field(
        default_factory=lambda: HtfContextTrace(state=[], fast=[], anchor=[], slow=[], meta={})
    )
    context_consumption_trace: list[ContextConsumptionTraceRecord] = Field(default_factory=list)
    long: SideSignalTrace
    short: SideSignalTrace
