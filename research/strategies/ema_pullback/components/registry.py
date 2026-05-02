"""Family-local component registry for ema_pullback Stage 5.

This registry is intentionally explicit and static:
- no auto-discovery
- no decorators
- no dynamic imports
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from research.strategies.ema_pullback.components.blockers import blockers_ok_baseline
from research.strategies.ema_pullback.components.direction import (
    fast_anchor_slow_stack_long,
    intraday_and_swing_trend_long,
    long_allowed_baseline,
)
from research.strategies.ema_pullback.components.exits import ema_bearish_cross_exit
from research.strategies.ema_pullback.components.setup import (
    pullback_to_anchor,
    pullback_to_entry_anchor,
    setup_long_baseline,
)
from research.strategies.ema_pullback.components.triggers import (
    ema_bullish_cross_entry,
    reclaim_anchor,
    reclaim_entry_anchor,
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
INTRADAY_AND_SWING_TREND_LONG_COMPONENT = "intraday_and_swing_trend_long"
FAST_ANCHOR_SLOW_STACK_LONG_COMPONENT = "fast_anchor_slow_stack_long"
PULLBACK_TO_ENTRY_ANCHOR_COMPONENT = "pullback_to_entry_anchor"
PULLBACK_TO_ANCHOR_COMPONENT = "pullback_to_anchor"
RECLAIM_ENTRY_ANCHOR_COMPONENT = "reclaim_entry_anchor"
RECLAIM_ANCHOR_COMPONENT = "reclaim_anchor"


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
        INTRADAY_AND_SWING_TREND_LONG_COMPONENT: ComponentDefinition(
            role="direction",
            component_id=INTRADAY_AND_SWING_TREND_LONG_COMPONENT,
            func=intraday_and_swing_trend_long,
            description="Allow long only when intraday and swing trends are bullish.",
        ),
        FAST_ANCHOR_SLOW_STACK_LONG_COMPONENT: ComponentDefinition(
            role="direction",
            component_id=FAST_ANCHOR_SLOW_STACK_LONG_COMPONENT,
            func=fast_anchor_slow_stack_long,
            description="Allow long when fast EMA > anchor EMA > slow EMA.",
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
        PULLBACK_TO_ENTRY_ANCHOR_COMPONENT: ComponentDefinition(
            role="setup",
            component_id=PULLBACK_TO_ENTRY_ANCHOR_COMPONENT,
            func=pullback_to_entry_anchor,
            description="Recent pullback to entry anchor in rolling window.",
        ),
        PULLBACK_TO_ANCHOR_COMPONENT: ComponentDefinition(
            role="setup",
            component_id=PULLBACK_TO_ANCHOR_COMPONENT,
            func=pullback_to_anchor,
            description="Recent pullback to anchor EMA in rolling window.",
        ),
    },
    "trigger": {
        DEFAULT_TRIGGER_COMPONENT: ComponentDefinition(
            role="trigger",
            component_id=DEFAULT_TRIGGER_COMPONENT,
            func=ema_bullish_cross_entry,
            description="Entry on EMA bullish cross.",
        ),
        RECLAIM_ENTRY_ANCHOR_COMPONENT: ComponentDefinition(
            role="trigger",
            component_id=RECLAIM_ENTRY_ANCHOR_COMPONENT,
            func=reclaim_entry_anchor,
            description="Entry when close reclaims entry anchor from below.",
        ),
        RECLAIM_ANCHOR_COMPONENT: ComponentDefinition(
            role="trigger",
            component_id=RECLAIM_ANCHOR_COMPONENT,
            func=reclaim_anchor,
            description="Entry when close reclaims anchor EMA from below.",
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


__all__ = [
    "COMPONENT_REGISTRY",
    "ComponentDefinition",
    "DEFAULT_BLOCKERS_COMPONENT",
    "DEFAULT_DIRECTION_COMPONENT",
    "DEFAULT_EXITS_COMPONENT",
    "DEFAULT_RISK_COMPONENT",
    "DEFAULT_SETUP_COMPONENT",
    "DEFAULT_TRIGGER_COMPONENT",
    "FAST_ANCHOR_SLOW_STACK_LONG_COMPONENT",
    "INTRADAY_AND_SWING_TREND_LONG_COMPONENT",
    "PULLBACK_TO_ANCHOR_COMPONENT",
    "PULLBACK_TO_ENTRY_ANCHOR_COMPONENT",
    "RECLAIM_ANCHOR_COMPONENT",
    "RECLAIM_ENTRY_ANCHOR_COMPONENT",
    "REQUIRED_COMPONENT_ROLES",
    "no_risk_filter",
    "resolve_component",
]
