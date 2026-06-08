from __future__ import annotations

from dataclasses import dataclass

from research.strategies.ema_pullback.execution.managed_components.activation import (
    phase_at_least_met,
)
from research.strategies.ema_pullback.execution.trade_runtime import ManagedExitContext
from research.strategies.ema_pullback.spec import RuntimeExitRuleSpec


@dataclass(frozen=True)
class RuntimeExitTrigger:
    rule_id: str
    component_id: str
    exit_price: float


def evaluate_runtime_exits(
    rules: tuple[RuntimeExitRuleSpec, ...],
    *,
    context: ManagedExitContext,
) -> list[RuntimeExitTrigger]:
    triggers: list[RuntimeExitTrigger] = []
    for rule in rules:
        if rule.component_id != "phase_runtime_exit":
            continue
        if not phase_at_least_met(context.phase, rule.activate_when.phase_at_least):
            continue
        if rule.params.exit_price != "close":
            continue
        triggers.append(
            RuntimeExitTrigger(
                rule_id=rule.rule_id,
                component_id=rule.component_id,
                exit_price=context.close,
            )
        )
    return triggers
