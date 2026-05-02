"""Composer: combine resolved pipeline components into final signals."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.components.registry import (
    resolve_component,
)
from research.strategies.ema_pullback.features.plan import FeaturePlan
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec


def compose_final_signals(
    *,
    long_allowed: pd.Series,
    blockers_ok: pd.Series,
    setup_long: pd.Series,
    trigger_long: pd.Series,
    risk_ok: pd.Series,
    exit_signal: pd.Series,
) -> tuple[pd.Series, pd.Series]:
    """AND composition for long entry; exit signal is passed through."""

    final_entry = long_allowed & blockers_ok & setup_long & trigger_long & risk_ok
    final_exit = exit_signal
    return final_entry.astype(bool), final_exit.astype(bool)


def build_signals_from_spec(
    df: pd.DataFrame,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
) -> tuple[pd.Series, pd.Series]:
    """Build entries/exits via component registry using StrategySpec ids."""

    direction_fn = resolve_component("direction", spec.components.direction).func
    blockers_fn = resolve_component("blockers", spec.components.blockers).func
    setup_fn = resolve_component("setup", spec.components.setup).func
    trigger_fn = resolve_component("trigger", spec.components.trigger).func
    exits_fn = resolve_component("exits", spec.components.exits).func
    risk_fn = resolve_component("risk", spec.components.risk).func

    fast_col = plan.anchor_columns["fast"]
    anchor_col = plan.anchor_columns["anchor"]
    slow_col = plan.anchor_columns["slow"]

    direction = direction_fn(df, fast_col, anchor_col, slow_col)
    blockers = blockers_fn(df)
    setup = setup_fn(df, anchor_col, spec.setup.lookback)
    trigger = trigger_fn(df, anchor_col)
    exits = exits_fn(df)
    risk = risk_fn(df)

    return compose_final_signals(
        long_allowed=direction,
        blockers_ok=blockers,
        setup_long=setup,
        trigger_long=trigger,
        risk_ok=risk,
        exit_signal=exits,
    )

