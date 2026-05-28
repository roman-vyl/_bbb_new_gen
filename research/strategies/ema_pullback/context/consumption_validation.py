"""Validate context_consumption on strategy specs and parsed instance JSON."""

from __future__ import annotations

from typing import Any

from research.strategies.ema_pullback.components.registry import (
    COUNTER_CANDLE_BLOCKER_COMPONENT,
    NO_BLOCKERS_COMPONENT,
    RSI_LOOKBACK_EXTREME_BLOCKER_COMPONENT,
)

_BLOCKER_COMPONENTS_WITH_CONTEXT_CONSUMPTION = frozenset(
    {
        COUNTER_CANDLE_BLOCKER_COMPONENT,
        RSI_LOOKBACK_EXTREME_BLOCKER_COMPONENT,
    }
)
from research.strategies.ema_pullback.context.policies import HTF_STATE_GATE_POLICY
from research.strategies.ema_pullback.spec import BlockerRuleSpec, ContextConsumptionPolicySpec

HTF_STATE_VALUES = frozenset({"up", "down", "neutral"})


def validate_htf_state_gate_params(
    params: dict[str, Any],
    *,
    path: str,
) -> None:
    if "allowed_states" not in params:
        return
    raw = params["allowed_states"]
    if not isinstance(raw, list):
        raise ValueError(f"{path}.params.allowed_states must be a list of strings")
    if not raw:
        raise ValueError(f"{path}.params.allowed_states must be a non-empty list")
    states = [str(item) for item in raw]
    unknown = set(states) - HTF_STATE_VALUES
    if unknown:
        raise ValueError(
            f"{path}.params.allowed_states has invalid values: {sorted(unknown)}"
        )


def validate_blocker_context_consumption(rule: BlockerRuleSpec) -> None:
    consumption = rule.context_consumption
    if consumption is None:
        return
    path = f"blockers[{rule.instance_id!r}].context_consumption"
    if rule.component_id == NO_BLOCKERS_COMPONENT:
        raise ValueError(
            f"{path} is not supported for component_id {rule.component_id!r}"
        )
    if rule.component_id not in _BLOCKER_COMPONENTS_WITH_CONTEXT_CONSUMPTION:
        raise ValueError(
            f"{path} is not supported for component_id {rule.component_id!r}; "
            f"supported blockers: {sorted(_BLOCKER_COMPONENTS_WITH_CONTEXT_CONSUMPTION)}"
        )
    if consumption.policy.policy_id != HTF_STATE_GATE_POLICY:
        raise ValueError(
            f"{path}.policy.policy_id must be {HTF_STATE_GATE_POLICY!r}; "
            f"got {consumption.policy.policy_id!r}"
        )
    validate_htf_state_gate_params(
        dict(consumption.policy.params),
        path=f"{path}.policy",
    )
