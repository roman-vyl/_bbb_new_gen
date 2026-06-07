"""Diagnostic-only trade-management runtime state.

This module builds runtime diagnostics from already executed trade records. It
must not compute entries/exits or feed state back into portfolio execution.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

import pandas as pd

from research.strategies.ema_pullback.spec import (
    PhaseRuleSpec,
    TRADE_MANAGEMENT_PHASES,
)

TradePhase = Literal["initial_risk", "proven", "protected", "runner", "exhaustion"]
TradeRuntimeEventType = Literal[
    "phase_changed",
    "active_stop_updated",
    "exit_rule_triggered",
    "exit_executed",
]


@dataclass
class TradeRuntimeState:
    trade_id: str
    side: Literal["long", "short"]
    entry_idx: int
    entry_time_ms: int
    entry_price: float
    bars_in_trade: int
    phase: TradePhase
    max_phase_reached: str
    best_price: float
    worst_price: float
    mfe_price: float
    mfe_pct: float
    mae_price: float
    mae_pct: float
    active_stop_price: float | None
    active_stop_source: str | None
    initial_stop_price: float | None
    initial_take_profit_price: float | None
    locked_exit_profile: str | None


@dataclass(frozen=True)
class TradeManagementEvent:
    trade_id: str
    time_ms: int
    bar_index: int
    side: str
    event_type: TradeRuntimeEventType
    from_phase: str | None
    to_phase: str | None
    rule_id: str | None
    component_id: str | None
    price: float | None
    stop_price: float | None
    mfe_pct: float
    mae_pct: float
    bars_in_trade: int
    metadata: dict[str, Any]


@dataclass(frozen=True)
class TradeRuntimeResult:
    states_by_trade_id: dict[str, TradeRuntimeState]
    events: list[TradeManagementEvent]


def _index_to_time_ms(index: pd.Index, idx: int) -> int:
    value = index[idx]
    if isinstance(value, pd.Timestamp):
        return int(value.value // 1_000_000)
    return int(idx)


def _phase_rank(phase: str) -> int:
    return TRADE_MANAGEMENT_PHASES.index(phase)


def _atr_key(rule: PhaseRuleSpec) -> tuple[str, int] | None:
    atr = rule.condition.atr
    if atr is None:
        return None
    return (atr.timeframe, atr.period)


def _finite_float(value: Any) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(out):
        return None
    return out


def _initial_state(
    trade: dict[str, Any],
    *,
    entry_idx: int,
    index: pd.Index,
) -> TradeRuntimeState | None:
    side = str(trade.get("direction") or "")
    if side not in {"long", "short"}:
        return None
    entry_price = _finite_float(trade.get("entry_price"))
    if entry_price is None or entry_price <= 0:
        return None
    trade_id = str(trade.get("trade_id") or f"{side}:{entry_idx}")
    return TradeRuntimeState(
        trade_id=trade_id,
        side=side,  # type: ignore[arg-type]
        entry_idx=entry_idx,
        entry_time_ms=_index_to_time_ms(index, entry_idx),
        entry_price=entry_price,
        bars_in_trade=0,
        phase="initial_risk",
        max_phase_reached="initial_risk",
        best_price=entry_price,
        worst_price=entry_price,
        mfe_price=entry_price,
        mfe_pct=0.0,
        mae_price=entry_price,
        mae_pct=0.0,
        active_stop_price=None,
        active_stop_source=None,
        initial_stop_price=None,
        initial_take_profit_price=None,
        locked_exit_profile=trade.get("active_exit_profile") or trade.get("entry_profile"),
    )


def update_trade_runtime_state(
    state: TradeRuntimeState,
    *,
    bar_index: int,
    high: float,
    low: float,
) -> None:
    """Update side-aware price extremes for one actual in-trade bar."""

    state.bars_in_trade = bar_index - state.entry_idx + 1
    if state.side == "long":
        state.best_price = max(state.best_price, high)
        state.worst_price = min(state.worst_price, low)
        state.mfe_price = state.best_price
        state.mae_price = state.worst_price
        state.mfe_pct = (state.best_price - state.entry_price) / state.entry_price
        state.mae_pct = (state.entry_price - state.worst_price) / state.entry_price
        return

    state.best_price = min(state.best_price, low)
    state.worst_price = max(state.worst_price, high)
    state.mfe_price = state.best_price
    state.mae_price = state.worst_price
    state.mfe_pct = (state.entry_price - state.best_price) / state.entry_price
    state.mae_pct = (state.worst_price - state.entry_price) / state.entry_price


def _condition_met(
    state: TradeRuntimeState,
    rule: PhaseRuleSpec,
    *,
    bar_index: int,
    atr_series_by_key: dict[tuple[str, int], pd.Series],
) -> bool:
    condition = rule.condition
    if condition.type == "mfe_pct":
        return state.mfe_pct >= condition.threshold
    if condition.type == "bars_in_trade":
        return state.bars_in_trade >= condition.threshold
    if condition.type == "mfe_atr":
        key = _atr_key(rule)
        if key is None:
            return False
        atr_series = atr_series_by_key.get(key)
        if atr_series is None or not (0 <= bar_index < len(atr_series)):
            return False
        atr_value = _finite_float(atr_series.iloc[bar_index])
        if atr_value is None or atr_value <= 0:
            return False
        favorable_distance = abs(state.mfe_price - state.entry_price)
        return favorable_distance >= (condition.threshold * atr_value)
    return False


def evaluate_phase_rules(
    state: TradeRuntimeState,
    phase_rules: tuple[PhaseRuleSpec, ...],
    *,
    bar_index: int,
    time_ms: int,
    atr_series_by_key: dict[tuple[str, int], pd.Series] | None = None,
) -> list[TradeManagementEvent]:
    """Apply ordered monotonic phase rules to one state on one bar."""

    events: list[TradeManagementEvent] = []
    atr_series_by_key = atr_series_by_key or {}
    for rule in phase_rules:
        if _phase_rank(rule.to_phase) <= _phase_rank(state.phase):
            continue
        if not _condition_met(
            state,
            rule,
            bar_index=bar_index,
            atr_series_by_key=atr_series_by_key,
        ):
            continue
        from_phase = state.phase
        state.phase = rule.to_phase  # type: ignore[assignment]
        if _phase_rank(state.phase) > _phase_rank(state.max_phase_reached):
            state.max_phase_reached = state.phase
        events.append(
            TradeManagementEvent(
                trade_id=state.trade_id,
                time_ms=time_ms,
                bar_index=bar_index,
                side=state.side,
                event_type="phase_changed",
                from_phase=from_phase,
                to_phase=state.phase,
                rule_id=rule.rule_id,
                component_id=None,
                price=state.mfe_price,
                stop_price=state.active_stop_price,
                mfe_pct=state.mfe_pct,
                mae_pct=state.mae_pct,
                bars_in_trade=state.bars_in_trade,
                metadata={"condition_type": rule.condition.type},
            )
        )
    return events


def build_trade_runtime_diagnostics(
    *,
    trade_records: list[dict[str, Any]],
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    phase_rules: tuple[PhaseRuleSpec, ...],
    atr_series_by_key: dict[tuple[str, int], pd.Series] | None = None,
) -> TradeRuntimeResult:
    """Build diagnostic runtime state from actual closed trade windows only."""

    index = close.index
    states: dict[str, TradeRuntimeState] = {}
    events: list[TradeManagementEvent] = []
    atr_series_by_key = atr_series_by_key or {}

    for trade in trade_records:
        if trade.get("status") != "closed":
            continue
        try:
            entry_idx = int(trade.get("entry_idx"))
            exit_idx = int(trade.get("exit_idx"))
        except (TypeError, ValueError):
            continue
        if entry_idx < 0 or exit_idx < entry_idx or exit_idx >= len(close):
            continue
        state = _initial_state(trade, entry_idx=entry_idx, index=index)
        if state is None:
            continue

        for bar_idx in range(entry_idx, exit_idx + 1):
            high_value = _finite_float(high.iloc[bar_idx])
            low_value = _finite_float(low.iloc[bar_idx])
            if high_value is None or low_value is None:
                continue
            update_trade_runtime_state(
                state,
                bar_index=bar_idx,
                high=high_value,
                low=low_value,
            )
            events.extend(
                evaluate_phase_rules(
                    state,
                    phase_rules,
                    bar_index=bar_idx,
                    time_ms=_index_to_time_ms(index, bar_idx),
                    atr_series_by_key=atr_series_by_key,
                )
            )

        exit_price = _finite_float(trade.get("exit_price"))
        events.append(
            TradeManagementEvent(
                trade_id=state.trade_id,
                time_ms=_index_to_time_ms(index, exit_idx),
                bar_index=exit_idx,
                side=state.side,
                event_type="exit_executed",
                from_phase=state.phase,
                to_phase=None,
                rule_id=str(trade.get("exit_rule_id") or trade.get("exit_instance_id") or "")
                or None,
                component_id=trade.get("exit_component_id"),
                price=exit_price,
                stop_price=state.active_stop_price,
                mfe_pct=state.mfe_pct,
                mae_pct=state.mae_pct,
                bars_in_trade=state.bars_in_trade,
                metadata={"exit_reason": trade.get("exit_reason")},
            )
        )
        states[state.trade_id] = state

    return TradeRuntimeResult(states_by_trade_id=states, events=events)
