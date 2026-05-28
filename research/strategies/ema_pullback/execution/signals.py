"""Composer: combine resolved pipeline components into final signals."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import pandas as pd

from research.strategies.ema_pullback.components.registry import (
    resolve_component,
)
from research.strategies.ema_pullback.context.bundle import ContextBundle
from research.strategies.ema_pullback.context.pipeline import require_context_bundle
from research.strategies.ema_pullback.context.policies import (
    HTF_STATE_GATE_POLICY,
    apply_htf_state_gate,
)
from research.strategies.ema_pullback.spec import BlockerRuleSpec
from research.strategies.ema_pullback.features.plan import FeaturePlan
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec
from research.strategies.ema_pullback.spec import ReclaimTriggerSpec, StrongReclaimTriggerSpec
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


def _apply_blocker_context_gate(
    signal: pd.Series,
    *,
    rule: BlockerRuleSpec,
    bundle: ContextBundle,
) -> pd.Series:
    consumption = rule.context_consumption
    if consumption is None:
        return signal
    if consumption.policy.policy_id != HTF_STATE_GATE_POLICY:
        raise ValueError(
            "unsupported blocker context_consumption.policy_id: "
            f"{consumption.policy.policy_id!r}"
        )
    context_output = bundle.get(consumption.context_ref)
    gate = apply_htf_state_gate(
        context_output,
        policy=consumption.policy,
        index=signal.index,
    )
    return signal & gate.fillna(False).astype(bool)


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
    context_bundle: ContextBundle | None,
) -> _SideSignalOutputs:
    if not spec.trade_sides.includes(side):
        return _SideSignalOutputs(signal=_false_series(df), output_counters=())

    direction = direction_fn(df, fast_col, anchor_col, slow_col, side=side)
    bundle = require_context_bundle(spec, context_bundle)
    blocker_signals_list: list[pd.Series] = []
    for blockers_fn, rule in zip(blockers_fns, spec.components.blockers, strict=True):
        signal = blockers_fn(
            df,
            side=side,
            rule=rule,
            rsi_col=_rsi_column(plan, rule.rsi),
        )
        if rule.context_consumption is not None:
            assert bundle is not None
            signal = _apply_blocker_context_gate(signal, rule=rule, bundle=bundle)
        blocker_signals_list.append(signal)
    blocker_signals = tuple(blocker_signals_list)
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
    if isinstance(trigger_rule, ReclaimTriggerSpec | StrongReclaimTriggerSpec):
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
    *,
    context_bundle: ContextBundle | None = None,
) -> PortfolioSignals:
    """Build entry signals via component registry using StrategySpec ids."""

    require_context_bundle(spec, context_bundle)
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
        context_bundle=context_bundle,
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
        context_bundle=context_bundle,
    )

    return PortfolioSignals(
        entries=long_outputs.signal,
        short_entries=short_outputs.signal,
        output_counters=long_outputs.output_counters + short_outputs.output_counters,
    )

