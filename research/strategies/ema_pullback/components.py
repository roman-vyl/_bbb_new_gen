"""Family-local component registry for ema_pullback Stage 5.

This registry is intentionally explicit and static:
- no auto-discovery
- no decorators
- no dynamic imports
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from research.strategies.ema_pullback.blockers import blockers_ok_baseline
from research.strategies.ema_pullback.direction import long_allowed_baseline
from research.strategies.ema_pullback.exits import ema_bearish_cross_exit
from research.strategies.ema_pullback.setup import setup_long_baseline
from research.strategies.ema_pullback.triggers import ema_bullish_cross_entry


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


def no_risk_filter(df: object) -> object:
    """Stage 5 baseline risk gate: no filtering (passthrough as all-True series)."""

    # Import lazily to avoid making pandas a hard import at module load time.
    import pandas as pd

    if not isinstance(df, pd.DataFrame):
        raise TypeError("risk component expects a pandas DataFrame input")
    return pd.Series(True, index=df.index, dtype=bool)


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
    },
    "blockers": {
        DEFAULT_BLOCKERS_COMPONENT: ComponentDefinition(
            role="blockers",
            component_id=DEFAULT_BLOCKERS_COMPONENT,
            func=blockers_ok_baseline,
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
    },
    "trigger": {
        DEFAULT_TRIGGER_COMPONENT: ComponentDefinition(
            role="trigger",
            component_id=DEFAULT_TRIGGER_COMPONENT,
            func=ema_bullish_cross_entry,
            description="Entry on EMA bullish cross.",
        ),
    },
    "exits": {
        DEFAULT_EXITS_COMPONENT: ComponentDefinition(
            role="exits",
            component_id=DEFAULT_EXITS_COMPONENT,
            func=ema_bearish_cross_exit,
            description="Exit on EMA bearish cross.",
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
