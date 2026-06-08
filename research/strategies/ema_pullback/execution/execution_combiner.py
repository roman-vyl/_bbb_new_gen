"""Unified bar-by-bar execution combiner — single lifecycle owner for open/hold/close.

Bar sequencing (normative for all adapters):

1. Capture ``position_was_open_at_bar_start``.
2. ``adapter.on_bar_open`` — e.g. legacy pending_stop promotion.
3. If position open: ``adapter.try_close_at_bar_open`` — exit_policy + managed candidates.
4. If not open at bar start and still flat: open from precomputed entries / short_entries.
5. If still open: ``adapter.on_end_of_bar`` — state/snapshot update effective from N+1.
6. Never open a new position on the same bar after closing an existing one.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Protocol

import pandas as pd

from research.strategies.ema_pullback.execution.exits import PortfolioExitOutputs
from research.strategies.ema_pullback.execution.trade_runtime import (
    TradeManagementEvent,
    _index_to_time_ms,
)
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec


@dataclass(frozen=True)
class CombinerBarContext:
    bar_idx: int
    time_ms: int
    open: float
    high: float
    low: float
    close: float


@dataclass
class CombinerOpenPosition:
    trade_id: str
    direction: Literal["long", "short"]
    entry_idx: int
    entry_price: float
    locked_profile: str
    adapter_state: Any


@dataclass(frozen=True)
class CombinerCloseDecision:
    exit_idx: int
    exit_price: float
    exit_attribution: Any
    exit_layer: str | None = None
    winner: Any = None
    events: tuple[TradeManagementEvent, ...] = ()
    adapter_payload: dict[str, Any] | None = None


@dataclass
class ExecutionCombinerResult:
    closed: list[dict[str, Any]]
    events: list[TradeManagementEvent]
    adapter_result: Any = None


class ExecutionExitAdapter(Protocol):
    """Pluggable exit/state logic; execution combiner owns bar order only."""

    def on_bar_open(self, position: CombinerOpenPosition, bar: CombinerBarContext) -> None: ...

    def try_close_at_bar_open(
        self,
        position: CombinerOpenPosition,
        bar: CombinerBarContext,
        *,
        exit_outputs: PortfolioExitOutputs,
        component_map: dict[str, str] | None,
    ) -> CombinerCloseDecision | None: ...

    def on_position_opened(
        self,
        *,
        direction: Literal["long", "short"],
        entry_idx: int,
        entry_price: float,
        locked_profile: str,
        bar: CombinerBarContext,
        exit_outputs: PortfolioExitOutputs,
    ) -> CombinerOpenPosition: ...

    def on_end_of_bar(
        self,
        position: CombinerOpenPosition,
        bar: CombinerBarContext,
        *,
        exit_outputs: PortfolioExitOutputs,
    ) -> tuple[CombinerOpenPosition, list[TradeManagementEvent]]: ...

    def on_series_end_open_position(
        self, position: CombinerOpenPosition, *, last_bar_idx: int, last_close: float
    ) -> dict[str, Any]: ...

    def record_bar_trace(
        self,
        position: CombinerOpenPosition | None,
        bar: CombinerBarContext,
    ) -> Any | None: ...


def _profile_at_bar(
    exit_outputs: PortfolioExitOutputs,
    bar_idx: int,
    side: Literal["long", "short"],
) -> str:
    from research.strategies.ema_pullback.execution.exit_policy_candidates import profile_at_bar

    return profile_at_bar(exit_outputs, bar_idx, side)


def run_execution_combiner_loop(
    *,
    spec: EmaPullbackStrategySpec,
    close: pd.Series,
    open_: pd.Series,
    high: pd.Series,
    low: pd.Series,
    entries: pd.Series,
    short_entries: pd.Series,
    exit_outputs: PortfolioExitOutputs,
    adapter: ExecutionExitAdapter,
    component_map: dict[str, str] | None = None,
    traces_out: list[Any] | None = None,
) -> ExecutionCombinerResult:
    index = close.index
    n = len(close)
    open_pos: CombinerOpenPosition | None = None
    closed: list[dict[str, Any]] = []
    events: list[TradeManagementEvent] = []

    traces: list[Any] | None
    if traces_out is not None:
        traces = [None] * n
    else:
        traces = None

    for bar_idx in range(n):
        bar = CombinerBarContext(
            bar_idx=bar_idx,
            time_ms=_index_to_time_ms(index, bar_idx),
            open=float(open_.iloc[bar_idx]),
            high=float(high.iloc[bar_idx]),
            low=float(low.iloc[bar_idx]),
            close=float(close.iloc[bar_idx]),
        )
        position_was_open_at_bar_start = open_pos is not None

        if open_pos is not None:
            adapter.on_bar_open(open_pos, bar)
            decision = adapter.try_close_at_bar_open(
                open_pos,
                bar,
                exit_outputs=exit_outputs,
                component_map=component_map,
            )
            if decision is not None:
                events.extend(decision.events)
                record: dict[str, Any] = {
                    "trade_id": open_pos.trade_id,
                    "direction": open_pos.direction,
                    "entry_idx": open_pos.entry_idx,
                    "entry_price": open_pos.entry_price,
                    "exit_idx": decision.exit_idx,
                    "exit_price": decision.exit_price,
                    "locked_profile": open_pos.locked_profile,
                    "exit_attribution": decision.exit_attribution,
                    "exit_layer": decision.exit_layer,
                    "winner": decision.winner,
                }
                if decision.adapter_payload:
                    record.update(decision.adapter_payload)
                closed.append(record)
                open_pos = None

        if not position_was_open_at_bar_start:
            if open_pos is None and bool(entries.iloc[bar_idx]) and spec.trade_sides.includes("long"):
                prof = _profile_at_bar(exit_outputs, bar_idx, "long")
                open_pos = adapter.on_position_opened(
                    direction="long",
                    entry_idx=bar_idx,
                    entry_price=bar.close,
                    locked_profile=prof,
                    bar=bar,
                    exit_outputs=exit_outputs,
                )
            elif (
                open_pos is None
                and bool(short_entries.iloc[bar_idx])
                and spec.trade_sides.includes("short")
            ):
                prof = _profile_at_bar(exit_outputs, bar_idx, "short")
                open_pos = adapter.on_position_opened(
                    direction="short",
                    entry_idx=bar_idx,
                    entry_price=bar.close,
                    locked_profile=prof,
                    bar=bar,
                    exit_outputs=exit_outputs,
                )

        if open_pos is not None:
            open_pos, bar_events = adapter.on_end_of_bar(
                open_pos,
                bar,
                exit_outputs=exit_outputs,
            )
            events.extend(bar_events)

        if traces is not None:
            traces[bar_idx] = adapter.record_bar_trace(open_pos, bar)

    if traces_out is not None and traces is not None:
        traces_out.clear()
        traces_out.extend(traces)

    if open_pos is not None:
        closed.append(
            adapter.on_series_end_open_position(
                open_pos,
                last_bar_idx=n - 1,
                last_close=float(close.iloc[n - 1]),
            )
        )

    return ExecutionCombinerResult(closed=closed, events=events)
