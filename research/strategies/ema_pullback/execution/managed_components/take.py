from __future__ import annotations

from dataclasses import dataclass

from research.strategies.ema_pullback.execution.managed_components.activation import (
    phase_at_least_met,
)
from research.strategies.ema_pullback.execution.trade_runtime import (
    ACTIVE_TAKE_PROFILE_INITIAL,
    ManagedExitContext,
)
from research.strategies.ema_pullback.spec import TakeManagementRuleSpec


ACTIVE_TAKE_PROFILE_DISABLE_FIXED_TP = "disable_fixed_tp"
ACTIVE_TAKE_PROFILE_EXTEND_SAFETY_TP_ATR = "extend_safety_tp_atr"


@dataclass(frozen=True)
class TakeProfileSelection:
    profile: str
    rule_id: str
    component_id: str
    safety_tp_atr: float | None = None


def take_profile_descriptor(
    action: str,
    *,
    safety_tp_atr: float | None = None,
) -> str:
    if action == "keep_initial":
        return ACTIVE_TAKE_PROFILE_INITIAL
    if action == "disable_fixed_tp":
        return ACTIVE_TAKE_PROFILE_DISABLE_FIXED_TP
    if action == "extend_safety_tp_atr":
        return ACTIVE_TAKE_PROFILE_EXTEND_SAFETY_TP_ATR
    return action


def evaluate_take_management(
    rules: tuple[TakeManagementRuleSpec, ...],
    *,
    context: ManagedExitContext,
) -> TakeProfileSelection | None:
    selection: TakeProfileSelection | None = None
    for rule in rules:
        if rule.component_id != "take_profile_switch":
            continue
        if not phase_at_least_met(context.phase, rule.activate_when.phase_at_least):
            continue
        params = rule.params
        selection = TakeProfileSelection(
            profile=take_profile_descriptor(
                params.action,
                safety_tp_atr=params.safety_tp_atr,
            ),
            rule_id=rule.rule_id,
            component_id=rule.component_id,
            safety_tp_atr=params.safety_tp_atr,
        )
    return selection
