"""Dispatch setup stack instances to registry callables."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.components.registry import (
    EMA_BOUNCE_COUNTER_SETUP_COMPONENT,
    UNTOUCHED_ANCHOR_SETUP_COMPONENT,
    resolve_component,
)
from research.strategies.ema_pullback.features.plan import FeaturePlan
from research.strategies.ema_pullback.spec import (
    EmaBounceCounterSetupSpec,
    SetupRuleSpec,
    TradeSide,
    UntouchedAnchorSetupSpec,
)


def run_setup_mask(
    df: pd.DataFrame,
    rule: SetupRuleSpec,
    plan: FeaturePlan,
    *,
    anchor_col: str,
    side: TradeSide,
) -> pd.Series:
    fn = resolve_component("setup", rule.component_id).func
    if rule.component_id == EMA_BOUNCE_COUNTER_SETUP_COMPONENT:
        if not isinstance(rule.params, EmaBounceCounterSetupSpec):
            raise TypeError(
                f"setup {rule.instance_id!r} expects EmaBounceCounterSetupSpec params"
            )
        cols = plan.setup_columns_for(rule.instance_id)
        return fn(
            df,
            cols["fast"],
            cols["anchor"],
            cols["slow"],
            max_bounces=rule.params.max_bounces,
            raw_touch_mode=rule.params.raw_touch_mode,
            touch_lookback_bars=rule.params.touch_lookback_bars,
            trend_start_confirmation_bars=rule.params.trend_start_confirmation_bars,
            trend_break_confirmation_bars=rule.params.trend_break_confirmation_bars,
            side=side,
        )
    if rule.component_id == UNTOUCHED_ANCHOR_SETUP_COMPONENT:
        if not isinstance(rule.params, UntouchedAnchorSetupSpec):
            raise TypeError(
                f"setup {rule.instance_id!r} expects UntouchedAnchorSetupSpec params"
            )
        return fn(
            df,
            anchor_col,
            rule.params.lookback,
            rule.params.active_bars,
            side=side,
        )
    raise ValueError(f"unsupported setup component_id {rule.component_id!r}")


def run_setup_trace(
    df: pd.DataFrame,
    rule: SetupRuleSpec,
    plan: FeaturePlan,
    *,
    anchor_col: str,
    side: TradeSide,
) -> dict[str, pd.Series]:
    from research.strategies.ema_pullback.components.setup import (
        ema_bounce_counter_setup_trace,
        untouched_anchor_setup_trace,
    )

    if rule.component_id == EMA_BOUNCE_COUNTER_SETUP_COMPONENT:
        if not isinstance(rule.params, EmaBounceCounterSetupSpec):
            raise TypeError(
                f"setup {rule.instance_id!r} expects EmaBounceCounterSetupSpec params"
            )
        cols = plan.setup_columns_for(rule.instance_id)
        return ema_bounce_counter_setup_trace(
            df,
            cols["fast"],
            cols["anchor"],
            cols["slow"],
            max_bounces=rule.params.max_bounces,
            raw_touch_mode=rule.params.raw_touch_mode,
            touch_lookback_bars=rule.params.touch_lookback_bars,
            trend_start_confirmation_bars=rule.params.trend_start_confirmation_bars,
            trend_break_confirmation_bars=rule.params.trend_break_confirmation_bars,
            side=side,
        )
    if rule.component_id == UNTOUCHED_ANCHOR_SETUP_COMPONENT:
        if not isinstance(rule.params, UntouchedAnchorSetupSpec):
            raise TypeError(
                f"setup {rule.instance_id!r} expects UntouchedAnchorSetupSpec params"
            )
        return untouched_anchor_setup_trace(
            df,
            anchor_col,
            rule.params.lookback,
            rule.params.active_bars,
            side=side,
        )
    raise ValueError(f"unsupported setup component_id {rule.component_id!r}")


def compose_setup_masks(
    df: pd.DataFrame,
    rules: tuple[SetupRuleSpec, ...],
    plan: FeaturePlan,
    *,
    anchor_col: str,
    side: TradeSide,
) -> pd.Series:
    if not rules:
        raise ValueError("at least one setup rule is required")
    out = run_setup_mask(df, rules[0], plan, anchor_col=anchor_col, side=side)
    for rule in rules[1:]:
        out = out & run_setup_mask(df, rule, plan, anchor_col=anchor_col, side=side)
    return out.fillna(False).astype(bool)
