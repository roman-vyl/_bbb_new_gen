"""Composer: combine resolved pipeline components into final signals."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import pandas as pd

from research.strategies.ema_pullback.components.registry import (
    resolve_component,
)
from research.strategies.ema_pullback.features.plan import FeaturePlan
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec
from research.strategies.ema_pullback.spec import TradeSide


@dataclass(frozen=True)
class PortfolioSignals:
    entries: pd.Series
    exits: pd.Series
    short_entries: pd.Series
    short_exits: pd.Series


def compose_final_signals(
    *,
    direction_allowed: pd.Series,
    blockers_ok: pd.Series,
    setup_ok: pd.Series,
    trigger_ok: pd.Series,
    risk_ok: pd.Series,
    exit_signal: pd.Series,
) -> tuple[pd.Series, pd.Series]:
    """AND composition for one side; exit signal is passed through."""

    final_entry = direction_allowed & blockers_ok & setup_ok & trigger_ok & risk_ok
    final_exit = exit_signal
    return final_entry.astype(bool), final_exit.astype(bool)


def _false_series(df: pd.DataFrame) -> pd.Series:
    return pd.Series(False, index=df.index, dtype=bool)


def _build_side_signals(
    *,
    df: pd.DataFrame,
    side: TradeSide,
    spec: EmaPullbackStrategySpec,
    fast_col: str,
    anchor_col: str,
    slow_col: str,
    direction_fn: Callable[..., pd.Series],
    blockers_fn: Callable[..., pd.Series],
    setup_fn: Callable[..., pd.Series],
    trigger_fn: Callable[..., pd.Series],
    exits_fn: Callable[..., pd.Series],
    risk_fn: Callable[..., pd.Series],
) -> tuple[pd.Series, pd.Series]:
    if not spec.trade_sides.includes(side):
        disabled = _false_series(df)
        return disabled, disabled

    direction = direction_fn(df, fast_col, anchor_col, slow_col, side=side)
    blockers = blockers_fn(df, side=side)
    setup = setup_fn(df, anchor_col, spec.setup.lookback, side=side)
    trigger = trigger_fn(df, anchor_col, side=side)
    exits = exits_fn(df, side=side)
    risk = risk_fn(df, side=side)

    return compose_final_signals(
        direction_allowed=direction,
        blockers_ok=blockers,
        setup_ok=setup,
        trigger_ok=trigger,
        risk_ok=risk,
        exit_signal=exits,
    )


def build_signals_from_spec(
    df: pd.DataFrame,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
) -> PortfolioSignals:
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

    entries, exits = _build_side_signals(
        df=df,
        side="long",
        spec=spec,
        fast_col=fast_col,
        anchor_col=anchor_col,
        slow_col=slow_col,
        direction_fn=direction_fn,
        blockers_fn=blockers_fn,
        setup_fn=setup_fn,
        trigger_fn=trigger_fn,
        exits_fn=exits_fn,
        risk_fn=risk_fn,
    )
    short_entries, short_exits = _build_side_signals(
        df=df,
        side="short",
        spec=spec,
        fast_col=fast_col,
        anchor_col=anchor_col,
        slow_col=slow_col,
        direction_fn=direction_fn,
        blockers_fn=blockers_fn,
        setup_fn=setup_fn,
        trigger_fn=trigger_fn,
        exits_fn=exits_fn,
        risk_fn=risk_fn,
    )

    return PortfolioSignals(
        entries=entries,
        exits=exits,
        short_entries=short_entries,
        short_exits=short_exits,
    )

