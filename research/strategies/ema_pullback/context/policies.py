"""Consumer-owned context policies."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.context.bundle import ContextOutput
from research.strategies.ema_pullback.spec import ContextConsumptionPolicySpec, TradeSide

EXIT_PROFILE_BY_HTF_STATE_POLICY = "exit_profile_by_htf_state"

_STATE_ORDER = ("up", "down", "neutral")


def _active_rule_group_for_side(*, side: TradeSide, context_state: str) -> str:
    if context_state not in _STATE_ORDER:
        return "neutral"
    if side == "long":
        if context_state == "up":
            return "aligned"
        if context_state == "down":
            return "countertrend"
        return "neutral"
    if context_state == "down":
        return "aligned"
    if context_state == "up":
        return "countertrend"
    return "neutral"


def apply_exit_profile_by_htf_state(
    output: ContextOutput,
    *,
    policy: ContextConsumptionPolicySpec,
    index: pd.Index,
    sides: tuple[TradeSide, ...],
) -> tuple[pd.Series, pd.Series]:
    _ = policy
    context_state = output.state_series()
    profile_long = context_state.map(
        lambda state: _active_rule_group_for_side(side="long", context_state=state)
    ).astype("object")
    profile_short = context_state.map(
        lambda state: _active_rule_group_for_side(side="short", context_state=state)
    ).astype("object")
    if "long" not in sides:
        profile_long = pd.Series("neutral", index=index, dtype="object")
    if "short" not in sides:
        profile_short = pd.Series("neutral", index=index, dtype="object")
    return profile_long, profile_short
