"""Family-local component registry for ema_pullback."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from research.strategies.ema_pullback.components.blockers import no_blockers
from research.strategies.ema_pullback.components.direction import (
    ema_anchor_stack_bullish,
)
from research.strategies.ema_pullback.components.exits import no_signal_exit
from research.strategies.ema_pullback.components.risk import no_risk_filter
from research.strategies.ema_pullback.components.setup import (
    pullback_to_anchor,
)
from research.strategies.ema_pullback.components.triggers import (
    reclaim_anchor,
)


REQUIRED_COMPONENT_ROLES: tuple[str, ...] = (
    "direction",
    "blockers",
    "setup",
    "trigger",
    "exits",
    "risk",
)

EMA_ANCHOR_STACK_BULLISH_COMPONENT = "ema_anchor_stack_bullish"
NO_BLOCKERS_COMPONENT = "no_blockers"
PULLBACK_TO_ANCHOR_COMPONENT = "pullback_to_anchor"
RECLAIM_ANCHOR_COMPONENT = "reclaim_anchor"
NO_SIGNAL_EXIT_COMPONENT = "no_signal_exit"
NO_RISK_FILTER_COMPONENT = "no_risk_filter"


@dataclass(frozen=True)
class ComponentDefinition:
    role: str
    component_id: str
    func: Callable[..., object]
    description: str | None = None


COMPONENT_REGISTRY: dict[str, dict[str, ComponentDefinition]] = {
    "direction": {
        EMA_ANCHOR_STACK_BULLISH_COMPONENT: ComponentDefinition(
            role="direction",
            component_id=EMA_ANCHOR_STACK_BULLISH_COMPONENT,
            func=ema_anchor_stack_bullish,
            description="Allow long when fast > anchor > slow.",
        ),
    },
    "blockers": {
        NO_BLOCKERS_COMPONENT: ComponentDefinition(
            role="blockers",
            component_id=NO_BLOCKERS_COMPONENT,
            func=no_blockers,
            description="No blocker constraints (all True).",
        ),
    },
    "setup": {
        PULLBACK_TO_ANCHOR_COMPONENT: ComponentDefinition(
            role="setup",
            component_id=PULLBACK_TO_ANCHOR_COMPONENT,
            func=pullback_to_anchor,
            description="Recent pullback to anchor in rolling window.",
        ),
    },
    "trigger": {
        RECLAIM_ANCHOR_COMPONENT: ComponentDefinition(
            role="trigger",
            component_id=RECLAIM_ANCHOR_COMPONENT,
            func=reclaim_anchor,
            description="Entry when close reclaims anchor from below.",
        ),
    },
    "exits": {
        NO_SIGNAL_EXIT_COMPONENT: ComponentDefinition(
            role="exits",
            component_id=NO_SIGNAL_EXIT_COMPONENT,
            func=no_signal_exit,
            description="No signal-based exits.",
        ),
    },
    "risk": {
        NO_RISK_FILTER_COMPONENT: ComponentDefinition(
            role="risk",
            component_id=NO_RISK_FILTER_COMPONENT,
            func=no_risk_filter,
            description="No risk gate filter (all True).",
        ),
    },
}


def resolve_component(role: str, component_id: str) -> ComponentDefinition:
    """Resolve component definition by role and component id."""

    role_registry = COMPONENT_REGISTRY.get(role)
    if role_registry is None:
        known_roles = ", ".join(sorted(COMPONENT_REGISTRY.keys()))
        raise ValueError(f"unknown component role {role!r}; known roles: {known_roles}")

    component = role_registry.get(component_id)
    if component is None:
        known_ids = ", ".join(sorted(role_registry.keys()))
        raise ValueError(
            f"unknown component_id {component_id!r} for role {role!r}; "
            f"known ids: {known_ids}"
        )
    return component


__all__ = [
    "COMPONENT_REGISTRY",
    "ComponentDefinition",
    "EMA_ANCHOR_STACK_BULLISH_COMPONENT",
    "NO_BLOCKERS_COMPONENT",
    "NO_SIGNAL_EXIT_COMPONENT",
    "NO_RISK_FILTER_COMPONENT",
    "PULLBACK_TO_ANCHOR_COMPONENT",
    "RECLAIM_ANCHOR_COMPONENT",
    "REQUIRED_COMPONENT_ROLES",
    "no_risk_filter",
    "resolve_component",
]
