"""Shared helpers for strategy-level context tests."""

from __future__ import annotations

from research.strategies.ema_pullback.component_builders import (
    blocker_counter_candle,
    context_consumption,
    context_provider,
    exit_policy,
    strategy_contexts,
)
from research.strategies.ema_pullback.context.policies import (
    EXIT_PROFILE_BY_HTF_STATE_POLICY,
    HTF_STATE_GATE_POLICY,
)
from research.strategies.ema_pullback.spec import ExitRuleSpec


def htf_strategy_contexts(
    *,
    context_ref: str = "htf",
    timeframe: str = "4h",
    fast_period: int = 100,
    anchor_period: int = 200,
    slow_period: int = 1000,
):
    return strategy_contexts(
        (
            (
                context_ref,
                context_provider(
                    timeframe=timeframe,
                    fast_period=fast_period,
                    anchor_period=anchor_period,
                    slow_period=slow_period,
                ),
            ),
        )
    )


def exit_policy_htf_consumption(
    *,
    context_ref: str = "htf",
    always_on: tuple[ExitRuleSpec, ...] = (),
    aligned: tuple[ExitRuleSpec, ...] = (),
    countertrend: tuple[ExitRuleSpec, ...] = (),
    neutral: tuple[ExitRuleSpec, ...] = (),
):
    has_profile_exits = any(len(group) > 0 for group in (aligned, countertrend, neutral))
    return exit_policy(
        always_on=always_on,
        aligned=aligned,
        countertrend=countertrend,
        neutral=neutral,
        context_consumption_spec=(
            context_consumption(
                context_ref=context_ref,
                policy_id=EXIT_PROFILE_BY_HTF_STATE_POLICY,
            )
            if has_profile_exits
            else None
        ),
    )


def blocker_htf_state_gate(
    *,
    context_ref: str = "htf",
    allowed_states: tuple[str, ...] = ("up",),
    instance_id: str = "counter_candle_blocker",
):
    return blocker_counter_candle(
        instance_id=instance_id,
        context_consumption=context_consumption(
            context_ref=context_ref,
            policy_id=HTF_STATE_GATE_POLICY,
            params=(("allowed_states", list(allowed_states)),),
        ),
    )
