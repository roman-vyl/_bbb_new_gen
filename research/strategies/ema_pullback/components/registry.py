"""Family-local component registry for ema_pullback."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from research.strategies.ema_pullback.components.blockers import blockers_ok_baseline, no_blockers
from research.strategies.ema_pullback.components.direction import (
    ema_anchor_stack_bullish,
    long_allowed_baseline,
)
from research.strategies.ema_pullback.components.exits import ema_bearish_cross_exit, no_signal_exit
from research.strategies.ema_pullback.components.risk import no_risk_filter
from research.strategies.ema_pullback.components.setup import (
    pullback_to_anchor,
    setup_long_baseline,
)
from research.strategies.ema_pullback.components.triggers import (
    ema_bullish_cross_entry,
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

DEFAULT_DIRECTION_COMPONENT = "ema_trend"
DEFAULT_BLOCKERS_COMPONENT = "no_blockers"
DEFAULT_SETUP_COMPONENT = "always_ready"
DEFAULT_TRIGGER_COMPONENT = "ema_cross_up"
DEFAULT_EXITS_COMPONENT = "ema_cross_down"
DEFAULT_RISK_COMPONENT = "no_risk_filter"
EMA_ANCHOR_STACK_BULLISH_COMPONENT = "ema_anchor_stack_bullish"
NO_BLOCKERS_COMPONENT = "no_blockers"
PULLBACK_TO_ANCHOR_COMPONENT = "pullback_to_anchor"
RECLAIM_ANCHOR_COMPONENT = "reclaim_anchor"
NO_SIGNAL_EXIT_COMPONENT = "no_signal_exit"


@dataclass(frozen=True)
class ComponentDefinition:
    role: str
    component_id: str
    func: Callable[..., object]
    description: str | None = None


COMPONENT_REGISTRY: dict[str, dict[str, ComponentDefinition]] = {
    "direction": {
        DEFAULT_DIRECTION_COMPONENT: ComponentDefinition(
            role="direction",
            component_id=DEFAULT_DIRECTION_COMPONENT,
            func=long_allowed_baseline,
            description="Long direction baseline (all True).",
        ),
        EMA_ANCHOR_STACK_BULLISH_COMPONENT: ComponentDefinition(
            role="direction",
            component_id=EMA_ANCHOR_STACK_BULLISH_COMPONENT,
            func=ema_anchor_stack_bullish,
            description="Allow long when fast > anchor > slow.",
        ),
    },
    "blockers": {
        DEFAULT_BLOCKERS_COMPONENT: ComponentDefinition(
            role="blockers",
            component_id=DEFAULT_BLOCKERS_COMPONENT,
            func=blockers_ok_baseline,
            description="No blocker constraints (all True).",
        ),
        NO_BLOCKERS_COMPONENT: ComponentDefinition(
            role="blockers",
            component_id=NO_BLOCKERS_COMPONENT,
            func=no_blockers,
            description="No blocker constraints (all True).",
        ),
    },
    "setup": {
        DEFAULT_SETUP_COMPONENT: ComponentDefinition(
            role="setup",
            component_id=DEFAULT_SETUP_COMPONENT,
            func=setup_long_baseline,
            description="Setup always ready baseline (all True).",
        ),
        PULLBACK_TO_ANCHOR_COMPONENT: ComponentDefinition(
            role="setup",
            component_id=PULLBACK_TO_ANCHOR_COMPONENT,
            func=pullback_to_anchor,
            description="Recent pullback to anchor in rolling window.",
        ),
    },
    "trigger": {
        DEFAULT_TRIGGER_COMPONENT: ComponentDefinition(
            role="trigger",
            component_id=DEFAULT_TRIGGER_COMPONENT,
            func=ema_bullish_cross_entry,
            description="Entry on EMA bullish cross.",
        ),
        RECLAIM_ANCHOR_COMPONENT: ComponentDefinition(
            role="trigger",
            component_id=RECLAIM_ANCHOR_COMPONENT,
            func=reclaim_anchor,
            description="Entry when close reclaims anchor from below.",
        ),
    },
    "exits": {
        DEFAULT_EXITS_COMPONENT: ComponentDefinition(
            role="exits",
            component_id=DEFAULT_EXITS_COMPONENT,
            func=ema_bearish_cross_exit,
            description="Exit on EMA bearish cross.",
        ),
        NO_SIGNAL_EXIT_COMPONENT: ComponentDefinition(
            role="exits",
            component_id=NO_SIGNAL_EXIT_COMPONENT,
            func=no_signal_exit,
            description="No signal-based exits.",
        ),
    },
    "risk": {
        DEFAULT_RISK_COMPONENT: ComponentDefinition(
            role="risk",
            component_id=DEFAULT_RISK_COMPONENT,
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
    "DEFAULT_BLOCKERS_COMPONENT",
    "DEFAULT_DIRECTION_COMPONENT",
    "DEFAULT_EXITS_COMPONENT",
    "DEFAULT_RISK_COMPONENT",
    "DEFAULT_SETUP_COMPONENT",
    "DEFAULT_TRIGGER_COMPONENT",
    "EMA_ANCHOR_STACK_BULLISH_COMPONENT",
    "NO_BLOCKERS_COMPONENT",
    "NO_SIGNAL_EXIT_COMPONENT",
    "PULLBACK_TO_ANCHOR_COMPONENT",
    "RECLAIM_ANCHOR_COMPONENT",
    "REQUIRED_COMPONENT_ROLES",
    "no_risk_filter",
    "resolve_component",
]
