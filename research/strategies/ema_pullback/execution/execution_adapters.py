"""Execution exit adapters plugged into the unified execution combiner."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import pandas as pd

from research.strategies.ema_pullback.execution.execution_combiner import (
    CombinerBarContext,
    CombinerCloseDecision,
    CombinerOpenPosition,
)
from research.strategies.ema_pullback.execution.exit_arbitration import (
    ExitArbitrator,
    arbitration_metadata,
)
from research.strategies.ema_pullback.execution.exit_attribution import ExitAttributionResult
from research.strategies.ema_pullback.execution.exit_management import (
    BarManagementTrace,
    _OpenPosition as LegacyOpenPosition,
    _bar_trace,
    _check_bar_exits,
    _initial_stop_at_entry,
    _managed_exit_fill_price,
    _moved_stop_price,
    _tighten_stop,
    _trigger_reached,
    resolve_management_rule,
)
from research.strategies.ema_pullback.execution.exit_policy_candidates import (
    collect_exit_policy_bar_candidates,
)
from research.strategies.ema_pullback.execution.exits import PortfolioExitOutputs
from research.strategies.ema_pullback.execution.managed_exit_provider import ManagedExitProvider
from research.strategies.ema_pullback.execution.trade_runtime import (
    ActiveManagementSnapshot,
    ExitCandidate,
    ManagedTradeRuntimeState,
    TradeManagementEvent,
    TradeRuntimeState,
    _initial_state,
    empty_active_management_snapshot,
)
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec


def _trade_id(direction: str, entry_idx: int) -> str:
    return f"{direction}:{entry_idx}"


@dataclass
class LegacyBreakEvenAdapterState:
    position: LegacyOpenPosition
    trigger_bar_idx: int | None = None


@dataclass
class ManagedProviderAdapterState:
    runtime: TradeRuntimeState
    inherited_snapshot: ActiveManagementSnapshot
    states_by_trade_id: dict[str, ManagedTradeRuntimeState]


class LegacyBreakEvenExitAdapter:
    """Legacy R-trigger break_even_stop combiner as a combiner adapter (not a second loop)."""

    def __init__(self, *, spec: EmaPullbackStrategySpec, close: pd.Series) -> None:
        self._spec = spec
        self._close = close

    def on_bar_open(self, position: CombinerOpenPosition, bar: CombinerBarContext) -> None:
        state: LegacyBreakEvenAdapterState = position.adapter_state
        pos = state.position
        if pos.pending_stop is not None:
            pos.effective_stop = _tighten_stop(
                pos.effective_stop,
                pos.pending_stop,
                direction=pos.direction,
            )
            pos.pending_stop = None

    def try_close_at_bar_open(
        self,
        position: CombinerOpenPosition,
        bar: CombinerBarContext,
        *,
        exit_outputs: PortfolioExitOutputs,
        component_map: dict[str, str] | None,
    ) -> CombinerCloseDecision | None:
        state: LegacyBreakEvenAdapterState = position.adapter_state
        pos = state.position
        prof = pos.locked_profile
        long_x = bool(exit_outputs.long_exits_by_profile[prof].iloc[bar.bar_idx])
        short_x = bool(exit_outputs.short_exits_by_profile[prof].iloc[bar.bar_idx])
        anchor = float(self._close.iloc[pos.entry_idx])
        exit_attr = _check_bar_exits(
            pos,
            bar_idx=bar.bar_idx,
            open_=bar.open,
            high=bar.high,
            low=bar.low,
            close=bar.close,
            stop_anchor=anchor,
            long_exit=long_x,
            short_exit=short_x,
            ctx=exit_outputs.attribution,
            component_map=component_map,
        )
        if exit_attr is None:
            return None
        exit_px = _managed_exit_fill_price(
            pos,
            open_=bar.open,
            high=bar.high,
            low=bar.low,
            close=bar.close,
            stop_anchor=anchor,
            exit_attr=exit_attr,
        )
        return CombinerCloseDecision(
            exit_idx=bar.bar_idx,
            exit_price=exit_px,
            exit_attribution=exit_attr,
            adapter_payload={"position": pos},
        )

    def on_position_opened(
        self,
        *,
        direction: Literal["long", "short"],
        entry_idx: int,
        entry_price: float,
        locked_profile: str,
        bar: CombinerBarContext,
        exit_outputs: PortfolioExitOutputs,
    ) -> CombinerOpenPosition:
        resolved = resolve_management_rule(
            self._spec.trade_management.exit_management,
            locked_profile,
        )
        sl_px, sl_r, tp_r = _initial_stop_at_entry(
            direction=direction,
            entry_idx=entry_idx,
            locked_profile=locked_profile,
            close=self._close,
            exit_outputs=exit_outputs,
        )
        if direction == "long":
            initial_risk = abs(entry_price - sl_px)
        else:
            initial_risk = abs(sl_px - entry_price)
        legacy_pos = LegacyOpenPosition(
            direction=direction,
            entry_idx=entry_idx,
            entry_price=entry_price,
            locked_profile=locked_profile,
            resolved=resolved,
            initial_stop_price=sl_px,
            initial_risk=initial_risk,
            effective_stop=sl_px,
            sl_ratio=sl_r,
            tp_ratio=tp_r,
        )
        return CombinerOpenPosition(
            trade_id=_trade_id(direction, entry_idx),
            direction=direction,
            entry_idx=entry_idx,
            entry_price=entry_price,
            locked_profile=locked_profile,
            adapter_state=LegacyBreakEvenAdapterState(position=legacy_pos),
        )

    def on_end_of_bar(
        self,
        position: CombinerOpenPosition,
        bar: CombinerBarContext,
        *,
        exit_outputs: PortfolioExitOutputs,
    ) -> tuple[CombinerOpenPosition, list[TradeManagementEvent]]:
        state: LegacyBreakEvenAdapterState = position.adapter_state
        pos = state.position
        if pos.resolved is not None and not pos.triggered:
            hit, trig_px = _trigger_reached(
                direction=pos.direction,
                entry_price=pos.entry_price,
                initial_risk=pos.initial_risk,
                trigger_r=pos.resolved.rule.trigger_r,
                high=bar.high,
                low=bar.low,
            )
            if hit:
                moved = _moved_stop_price(
                    direction=pos.direction,
                    entry_price=pos.entry_price,
                    initial_risk=pos.initial_risk,
                    offset_r=pos.resolved.rule.offset_r,
                )
                pos.triggered = True
                pos.trigger_idx = bar.bar_idx
                pos.trigger_price = trig_px
                pos.stop_moved_to = moved
                pos.pending_stop = moved
                state.trigger_bar_idx = bar.bar_idx
        return position, []

    def on_series_end_open_position(
        self, position: CombinerOpenPosition, *, last_bar_idx: int, last_close: float
    ) -> dict[str, Any]:
        state: LegacyBreakEvenAdapterState = position.adapter_state
        return {
            "trade_id": position.trade_id,
            "direction": position.direction,
            "entry_idx": position.entry_idx,
            "entry_price": position.entry_price,
            "exit_idx": last_bar_idx,
            "exit_price": last_close,
            "locked_profile": position.locked_profile,
            "position": state.position,
            "open": True,
        }

    def record_bar_trace(
        self,
        position: CombinerOpenPosition | None,
        bar: CombinerBarContext,
    ) -> BarManagementTrace | None:
        if position is None:
            return None
        state: LegacyBreakEvenAdapterState = position.adapter_state
        pos = state.position
        trace = _bar_trace(pos)
        if trace is None:
            return None
        if state.trigger_bar_idx == bar.bar_idx:
            return BarManagementTrace(
                effective_stop_price=pos.effective_stop,
                pending_stop_price=pos.pending_stop,
                break_even_active=True,
                break_even_triggered_on_bar=True,
                break_even_trigger_price=pos.trigger_price,
                break_even_stop_moved_to=pos.stop_moved_to,
                break_even_initial_risk=pos.initial_risk,
                break_even_instance_id=pos.resolved.rule.instance_id if pos.resolved else None,
                active_stop_management_source=pos.resolved.source if pos.resolved else None,
                position_direction=pos.direction,
            )
        return trace


class ManagedExitProviderAdapter:
    """v2 managed exit provider plugged into the unified execution combiner."""

    def __init__(self, *, provider: ManagedExitProvider, index: pd.Index) -> None:
        self._provider = provider
        self._index = index
        self._arbitrator = ExitArbitrator()
        self.states_by_trade_id: dict[str, ManagedTradeRuntimeState] = {}

    def on_bar_open(self, position: CombinerOpenPosition, bar: CombinerBarContext) -> None:
        return None

    def try_close_at_bar_open(
        self,
        position: CombinerOpenPosition,
        bar: CombinerBarContext,
        *,
        exit_outputs: PortfolioExitOutputs,
        component_map: dict[str, str] | None,
    ) -> CombinerCloseDecision | None:
        state: ManagedProviderAdapterState = position.adapter_state
        inherited = state.inherited_snapshot
        policy_candidates = collect_exit_policy_bar_candidates(
            bar_idx=bar.bar_idx,
            direction=position.direction,
            entry_idx=position.entry_idx,
            entry_price=position.entry_price,
            locked_profile=position.locked_profile,
            open_=bar.open,
            high=bar.high,
            low=bar.low,
            close=bar.close,
            exit_outputs=exit_outputs,
            inherited_take_profile=inherited.active_take_profile,
            component_map=component_map,
        )
        managed_candidates = self._provider.get_bar_open_candidates(
            inherited,
            bar_idx=bar.bar_idx,
            direction=position.direction,
            open_=bar.open,
            high=bar.high,
            low=bar.low,
            close=bar.close,
        )
        arbitration = self._arbitrator.select_winner(
            [*policy_candidates, *managed_candidates],
            bar_index=bar.bar_idx,
        )
        if arbitration.winner is None:
            return None
        winner = arbitration.winner
        events = _close_events(position, bar=bar, winner=winner, arbitration=arbitration, state=state)
        self.states_by_trade_id[position.trade_id] = ManagedTradeRuntimeState(
            runtime=state.runtime,
            active_management=inherited,
        )
        return CombinerCloseDecision(
            exit_idx=bar.bar_idx,
            exit_price=winner.price,
            exit_attribution=_exit_attribution_from_candidate(winner),
            exit_layer=winner.layer,
            winner=winner,
            events=tuple(events),
        )

    def on_position_opened(
        self,
        *,
        direction: Literal["long", "short"],
        entry_idx: int,
        entry_price: float,
        locked_profile: str,
        bar: CombinerBarContext,
        exit_outputs: PortfolioExitOutputs,
    ) -> CombinerOpenPosition:
        runtime = _initial_state(
            {
                "trade_id": _trade_id(direction, entry_idx),
                "direction": direction,
                "entry_price": entry_price,
                "entry_profile": locked_profile,
            },
            entry_idx=entry_idx,
            index=self._index,
        )
        assert runtime is not None
        return CombinerOpenPosition(
            trade_id=runtime.trade_id,
            direction=direction,
            entry_idx=entry_idx,
            entry_price=entry_price,
            locked_profile=locked_profile,
            adapter_state=ManagedProviderAdapterState(
                runtime=runtime,
                inherited_snapshot=empty_active_management_snapshot(),
                states_by_trade_id=self.states_by_trade_id,
            ),
        )

    def on_end_of_bar(
        self,
        position: CombinerOpenPosition,
        bar: CombinerBarContext,
        *,
        exit_outputs: PortfolioExitOutputs,
    ) -> tuple[CombinerOpenPosition, list[TradeManagementEvent]]:
        state: ManagedProviderAdapterState = position.adapter_state
        update = self._provider.update_end_of_bar_snapshot(
            state.runtime,
            inherited=state.inherited_snapshot,
            bar_idx=bar.bar_idx,
            time_ms=bar.time_ms,
            open_=bar.open,
            high=bar.high,
            low=bar.low,
            close=bar.close,
        )
        state.runtime = update.runtime
        state.inherited_snapshot = update.snapshot
        return position, list(update.events)

    def on_series_end_open_position(
        self, position: CombinerOpenPosition, *, last_bar_idx: int, last_close: float
    ) -> dict[str, Any]:
        state: ManagedProviderAdapterState = position.adapter_state
        self.states_by_trade_id[position.trade_id] = ManagedTradeRuntimeState(
            runtime=state.runtime,
            active_management=state.inherited_snapshot,
        )
        return {
            "trade_id": position.trade_id,
            "direction": position.direction,
            "entry_idx": position.entry_idx,
            "entry_price": position.entry_price,
            "exit_idx": last_bar_idx,
            "exit_price": last_close,
            "locked_profile": position.locked_profile,
            "open": True,
        }

    def record_bar_trace(
        self,
        position: CombinerOpenPosition | None,
        bar: CombinerBarContext,
    ) -> None:
        return None


def _exit_attribution_from_candidate(winner: ExitCandidate) -> ExitAttributionResult:
    if winner.layer == "exit_management":
        prefix = winner.reason.split(":", 1)[0]
        if prefix == "active_stop":
            kind = winner.component_id or "managed_stop"
            return ExitAttributionResult(
                f"exit_management:{winner.rule_id}",
                "exit_management",
                None,
                winner.component_id,
                winner.rule_id,
                kind,
            )
        return ExitAttributionResult(
            f"exit_management:{winner.rule_id}",
            "exit_management",
            None,
            winner.component_id,
            winner.rule_id,
            "runtime_exit",
        )
    reason = winner.reason
    return ExitAttributionResult(
        reason,
        "always_on" if winner.layer == "exit_policy" else None,
        None,
        winner.component_id,
        winner.rule_id,
        winner.candidate_type,
    )


def _close_events(
    position: CombinerOpenPosition,
    *,
    bar: CombinerBarContext,
    winner: ExitCandidate,
    arbitration: object,
    state: ManagedProviderAdapterState,
) -> list[TradeManagementEvent]:
    meta = arbitration_metadata(arbitration)  # type: ignore[arg-type]
    exit_layer = winner.layer
    return [
        TradeManagementEvent(
            trade_id=position.trade_id,
            time_ms=bar.time_ms,
            bar_index=bar.bar_idx,
            side=position.direction,
            event_type="exit_rule_triggered",
            from_phase=state.runtime.phase,
            to_phase=None,
            rule_id=winner.rule_id,
            component_id=winner.component_id,
            price=winner.price,
            stop_price=state.inherited_snapshot.active_stop_price,
            mfe_pct=state.runtime.mfe_pct,
            mae_pct=state.runtime.mae_pct,
            bars_in_trade=state.runtime.bars_in_trade,
            metadata={"exit_layer": exit_layer, **meta},
        ),
        TradeManagementEvent(
            trade_id=position.trade_id,
            time_ms=bar.time_ms,
            bar_index=bar.bar_idx,
            side=position.direction,
            event_type="exit_executed",
            from_phase=state.runtime.phase,
            to_phase=None,
            rule_id=winner.rule_id,
            component_id=winner.component_id,
            price=winner.price,
            stop_price=state.inherited_snapshot.active_stop_price,
            mfe_pct=state.runtime.mfe_pct,
            mae_pct=state.runtime.mae_pct,
            bars_in_trade=state.runtime.bars_in_trade,
            metadata={
                "exit_layer": exit_layer,
                "exit_reason": (
                    f"exit_management:{winner.rule_id}"
                    if winner.layer == "exit_management"
                    else winner.reason
                ),
                **meta,
            },
        ),
    ]
