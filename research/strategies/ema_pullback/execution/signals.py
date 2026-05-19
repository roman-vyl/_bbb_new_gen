"""Composer: combine resolved pipeline components into final signals."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import pandas as pd

from research.strategies.ema_pullback.components.registry import (
    resolve_component,
)
from research.strategies.ema_pullback.features.plan import FeaturePlan
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec
from research.strategies.ema_pullback.spec import ReclaimTriggerSpec
from research.strategies.ema_pullback.spec import RsiFeatureSpec
from research.strategies.ema_pullback.spec import TradeSide


@dataclass(frozen=True)
class PortfolioSignals:
    entries: pd.Series
    short_entries: pd.Series
    output_counters: tuple[dict[str, Any], ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class _SideSignalOutputs:
    signal: pd.Series
    output_counters: tuple[dict[str, Any], ...]


def compose_final_signals(
    *,
    direction_allowed: pd.Series,
    blockers_ok: pd.Series,
    setup_ok: pd.Series,
    trigger_ok: pd.Series,
    risk_ok: pd.Series,
) -> pd.Series:
    """AND composition for one side entry signal."""

    final_entry = direction_allowed & blockers_ok & setup_ok & trigger_ok & risk_ok
    return final_entry.astype(bool)


def compose_blocker_signals(signals: tuple[pd.Series, ...]) -> pd.Series:
    """All blockers must allow the entry."""

    if not signals:
        raise ValueError("at least one blocker signal is required")
    out = signals[0].fillna(False).astype(bool)
    for signal in signals[1:]:
        out = out & signal.fillna(False).astype(bool)
    return out.astype(bool)


def _false_series(df: pd.DataFrame) -> pd.Series:
    return pd.Series(False, index=df.index, dtype=bool)


def _rsi_column(plan: FeaturePlan, rsi: RsiFeatureSpec | None) -> str | None:
    if rsi is None:
        return None
    return plan.rsi_columns[(rsi.timeframe, rsi.period)]


def _build_side_signals(
    *,
    df: pd.DataFrame,
    side: TradeSide,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
    fast_col: str,
    anchor_col: str,
    slow_col: str,
    direction_fn: Callable[..., pd.Series],
    blockers_fns: tuple[Callable[..., pd.Series], ...],
    setup_fn: Callable[..., pd.Series],
    trigger_fn: Callable[..., pd.Series],
    risk_fn: Callable[..., pd.Series],
) -> _SideSignalOutputs:
    if not spec.trade_sides.includes(side):
        return _SideSignalOutputs(signal=_false_series(df), output_counters=())

    direction = direction_fn(df, fast_col, anchor_col, slow_col, side=side)
    blocker_signals = tuple(
        blockers_fn(
            df,
            side=side,
            rule=rule,
            rsi_col=_rsi_column(plan, rule.rsi),
        )
        for blockers_fn, rule in zip(blockers_fns, spec.components.blockers, strict=True)
    )
    blocker_counters = tuple(
        {
            "role": "blockers",
            "component_id": rule.component_id,
            "instance_id": rule.instance_id,
            "side": side,
            "output_type": "allow_mask",
            "counters": {
                "allowed_count": int(signal.fillna(False).astype(bool).sum()),
                "blocked_count": int((~signal.fillna(False).astype(bool)).sum()),
            },
        }
        for rule, signal in zip(spec.components.blockers, blocker_signals, strict=True)
    )
    blockers = compose_blocker_signals(blocker_signals)
    setup = setup_fn(
        df,
        anchor_col,
        spec.setup.lookback,
        spec.setup.active_bars,
        side=side,
    )
    trigger_rule = spec.components.trigger
    if isinstance(trigger_rule, ReclaimTriggerSpec):
        trigger = trigger_fn(df, anchor_col, trigger_rule.lookback, side=side)
    else:
        trigger = trigger_fn(df, anchor_col, side=side)
    risk = risk_fn(df, side=side)

    return _SideSignalOutputs(
        signal=compose_final_signals(
            direction_allowed=direction,
            blockers_ok=blockers,
            setup_ok=setup,
            trigger_ok=trigger,
            risk_ok=risk,
        ),
        output_counters=blocker_counters,
    )


def build_signals_from_spec(
    df: pd.DataFrame,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
) -> PortfolioSignals:
    """Build entry signals via component registry using StrategySpec ids."""

    direction_fn = resolve_component("direction", spec.components.direction).func
    blockers_fns = tuple(
        resolve_component("blockers", rule.component_id).func for rule in spec.components.blockers
    )
    setup_fn = resolve_component("setup", spec.components.setup).func
    trigger_fn = resolve_component("trigger", spec.components.trigger.component_id).func
    risk_fn = resolve_component("risk", spec.components.risk).func

    fast_col = plan.anchor_columns["fast"]
    anchor_col = plan.anchor_columns["anchor"]
    slow_col = plan.anchor_columns["slow"]

    long_outputs = _build_side_signals(
        df=df,
        side="long",
        spec=spec,
        plan=plan,
        fast_col=fast_col,
        anchor_col=anchor_col,
        slow_col=slow_col,
        direction_fn=direction_fn,
        blockers_fns=blockers_fns,
        setup_fn=setup_fn,
        trigger_fn=trigger_fn,
        risk_fn=risk_fn,
    )
    short_outputs = _build_side_signals(
        df=df,
        side="short",
        spec=spec,
        plan=plan,
        fast_col=fast_col,
        anchor_col=anchor_col,
        slow_col=slow_col,
        direction_fn=direction_fn,
        blockers_fns=blockers_fns,
        setup_fn=setup_fn,
        trigger_fn=trigger_fn,
        risk_fn=risk_fn,
    )

    return PortfolioSignals(
        entries=long_outputs.signal,
        short_entries=short_outputs.signal,
        output_counters=long_outputs.output_counters + short_outputs.output_counters,
    )

