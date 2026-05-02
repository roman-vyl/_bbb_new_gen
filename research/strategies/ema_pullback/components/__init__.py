"""Pipeline decision components: direction, blockers, setup, triggers, exits, risk."""

from .registry import (
    COMPONENT_REGISTRY,
    ComponentDefinition,
    EMA_ANCHOR_STACK_BULLISH_COMPONENT,
    NO_BLOCKERS_COMPONENT,
    NO_SIGNAL_EXIT_COMPONENT,
    NO_RISK_FILTER_COMPONENT,
    PULLBACK_TO_ANCHOR_COMPONENT,
    RECLAIM_ANCHOR_COMPONENT,
    REQUIRED_COMPONENT_ROLES,
    no_risk_filter,
    resolve_component,
)

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
