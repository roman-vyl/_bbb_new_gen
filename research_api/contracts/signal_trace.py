"""Per-bar entry pipeline trace for Workbench Chart (phase 5)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SignalTraceMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variant: str
    component_ids: dict[str, str]
    setup_params: dict[str, int]
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


class SignalTraceBundle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    times: list[int] = Field(description="Unix seconds per bar, aligned with chart candles")
    meta: SignalTraceMeta
    long: SideSignalTrace
    short: SideSignalTrace
