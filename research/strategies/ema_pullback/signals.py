"""Composer: combine resolved pipeline components into final signals."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.components import (
    DEFAULT_BLOCKERS_COMPONENT,
    DEFAULT_DIRECTION_COMPONENT,
    DEFAULT_EXITS_COMPONENT,
    DEFAULT_RISK_COMPONENT,
    DEFAULT_SETUP_COMPONENT,
    DEFAULT_TRIGGER_COMPONENT,
    resolve_component,
)


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


def ema_pullback_pipeline_signals(
    df: pd.DataFrame,
    *,
    ema_fast: int,
    ema_slow: int,
    direction_component: str = DEFAULT_DIRECTION_COMPONENT,
    blockers_component: str = DEFAULT_BLOCKERS_COMPONENT,
    setup_component: str = DEFAULT_SETUP_COMPONENT,
    trigger_component: str = DEFAULT_TRIGGER_COMPONENT,
    exits_component: str = DEFAULT_EXITS_COMPONENT,
    risk_component: str = DEFAULT_RISK_COMPONENT,
) -> tuple[pd.Series, pd.Series]:
    """Run direction → blockers → setup → trigger/exit/risk by selected component ids."""

    direction_fn = resolve_component("direction", direction_component).func
    blockers_fn = resolve_component("blockers", blockers_component).func
    setup_fn = resolve_component("setup", setup_component).func
    trigger_fn = resolve_component("trigger", trigger_component).func
    exits_fn = resolve_component("exits", exits_component).func
    risk_fn = resolve_component("risk", risk_component).func

    long_al = direction_fn(df)
    block_ok = blockers_fn(df)
    setup = setup_fn(df)
    fast_col = f"ema_{ema_fast}"
    slow_col = f"ema_{ema_slow}"
    trig = trigger_fn(df, fast_col, slow_col)
    ex = exits_fn(df, fast_col, slow_col)
    risk_ok = risk_fn(df)
    return compose_final_signals(
        long_allowed=long_al,
        blockers_ok=block_ok,
        setup_long=setup,
        trigger_long=trig,
        risk_ok=risk_ok,
        exit_signal=ex,
    )


def crossover_from_ema_columns(
    df: pd.DataFrame,
    fast_col: str,
    slow_col: str,
) -> tuple[pd.Series, pd.Series]:
    """Long on bullish cross, exit on bearish cross; first row never fires.

    Thin wrapper over trigger/exit blocks for legacy call sites (same boolean
    semantics as Stage 1 ``crossover_from_ema_columns``).
    """

    trigger_fn = resolve_component("trigger", DEFAULT_TRIGGER_COMPONENT).func
    exits_fn = resolve_component("exits", DEFAULT_EXITS_COMPONENT).func
    entries = trigger_fn(df, fast_col, slow_col)
    exits = exits_fn(df, fast_col, slow_col)
    return entries, exits


def ema_crossover_signals(
    df: pd.DataFrame,
    *,
    ema_fast: int,
    ema_slow: int,
    direction_component: str = DEFAULT_DIRECTION_COMPONENT,
    blockers_component: str = DEFAULT_BLOCKERS_COMPONENT,
    setup_component: str = DEFAULT_SETUP_COMPONENT,
    trigger_component: str = DEFAULT_TRIGGER_COMPONENT,
    exits_component: str = DEFAULT_EXITS_COMPONENT,
    risk_component: str = DEFAULT_RISK_COMPONENT,
) -> tuple[pd.Series, pd.Series]:
    """Crossover using columns ``ema_{ema_fast}`` and ``ema_{ema_slow}``."""

    return ema_pullback_pipeline_signals(
        df,
        ema_fast=ema_fast,
        ema_slow=ema_slow,
        direction_component=direction_component,
        blockers_component=blockers_component,
        setup_component=setup_component,
        trigger_component=trigger_component,
        exits_component=exits_component,
        risk_component=risk_component,
    )
