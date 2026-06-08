"""Execution-layer integration loop with managed exit provider (Slice 4)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from research.strategies.ema_pullback.execution.execution_adapters import ManagedExitProviderAdapter
from research.strategies.ema_pullback.execution.execution_combiner import run_execution_combiner_loop
from research.strategies.ema_pullback.execution.exits import PortfolioExitOutputs
from research.strategies.ema_pullback.execution.managed_exit_provider import ManagedExitProvider
from research.strategies.ema_pullback.execution.trade_runtime import (
    ManagedTradeRuntimeResult,
    ManagedTradeRuntimeState,
    TradeManagementEvent,
)
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec


@dataclass
class ManagedExecutionLoopResult:
    closed: list[dict[str, Any]]
    events: list[TradeManagementEvent]
    states_by_trade_id: dict[str, ManagedTradeRuntimeState]


def run_managed_execution_loop(
    *,
    spec: EmaPullbackStrategySpec,
    close: pd.Series,
    open_: pd.Series,
    high: pd.Series,
    low: pd.Series,
    entries: pd.Series,
    short_entries: pd.Series,
    exit_outputs: PortfolioExitOutputs,
    provider: ManagedExitProvider,
    component_map: dict[str, str] | None = None,
) -> ManagedExecutionLoopResult:
    adapter = ManagedExitProviderAdapter(provider=provider, index=close.index)
    result = run_execution_combiner_loop(
        spec=spec,
        close=close,
        open_=open_,
        high=high,
        low=low,
        entries=entries,
        short_entries=short_entries,
        exit_outputs=exit_outputs,
        adapter=adapter,
        component_map=component_map,
    )
    return ManagedExecutionLoopResult(
        closed=result.closed,
        events=result.events,
        states_by_trade_id=adapter.states_by_trade_id,
    )


def execution_result_to_managed_runtime_result(
    result: ManagedExecutionLoopResult,
) -> ManagedTradeRuntimeResult:
    return ManagedTradeRuntimeResult(
        states_by_trade_id=result.states_by_trade_id,
        events=result.events,
    )
