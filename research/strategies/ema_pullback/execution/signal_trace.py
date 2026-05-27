"""Per-bar entry pipeline trace for Workbench signal explanation (phase 5)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import pandas as pd

from research.strategies.ema_pullback.components.blockers import (
    counter_candle_blocker_trace,
    no_blockers_trace,
    rsi_lookback_extreme_blocker_trace,
)
from research.strategies.ema_pullback.components.direction import ema_anchor_stack_trend_trace
from research.strategies.ema_pullback.components.registry import (
    COUNTER_CANDLE_BLOCKER_COMPONENT,
    NO_BLOCKERS_COMPONENT,
    RSI_LOOKBACK_EXTREME_BLOCKER_COMPONENT,
    TOUCH_ANCHOR_COMPONENT,
    UNTOUCHED_ANCHOR_SETUP_COMPONENT,
)
from research.strategies.ema_pullback.components.setup import untouched_anchor_setup_trace
from research.strategies.ema_pullback.components.triggers import (
    reclaim_anchor_trace,
    strong_reclaim_anchor_trace,
    touch_anchor_trace,
)
from research.strategies.ema_pullback.components.risk import no_risk_filter
from research.strategies.ema_pullback.execution.exits import build_exit_outputs_from_spec
from research.strategies.ema_pullback.execution.signals import compose_blocker_signals, compose_final_signals
from research.strategies.ema_pullback.features.plan import FeaturePlan
from research.strategies.ema_pullback.spec import (
    EmaPullbackStrategySpec,
    ReclaimTriggerSpec,
    StrongReclaimTriggerSpec,
    RsiFeatureSpec,
    TradeSide,
)


class UnsupportedTraceComponentError(ValueError):
    """Component id has no trace implementation yet."""


_BLOCKER_TRACE: dict[str, Callable[..., dict[str, pd.Series]]] = {
    NO_BLOCKERS_COMPONENT: no_blockers_trace,
    COUNTER_CANDLE_BLOCKER_COMPONENT: counter_candle_blocker_trace,
    RSI_LOOKBACK_EXTREME_BLOCKER_COMPONENT: rsi_lookback_extreme_blocker_trace,
}

_SETUP_TRACE: dict[str, Callable[..., dict[str, pd.Series]]] = {
    UNTOUCHED_ANCHOR_SETUP_COMPONENT: untouched_anchor_setup_trace,
}

_TRIGGER_TRACE: dict[str, Callable[..., dict[str, pd.Series]]] = {
    TOUCH_ANCHOR_COMPONENT: touch_anchor_trace,
}


def _rsi_column(plan: FeaturePlan, rsi: RsiFeatureSpec | None) -> str | None:
    if rsi is None:
        return None
    return plan.rsi_columns[(rsi.timeframe, rsi.period)]


def _false_series(df: pd.DataFrame) -> pd.Series:
    return pd.Series(False, index=df.index, dtype=bool)


def _bool_list(series: pd.Series) -> list[bool]:
    return series.fillna(False).astype(bool).tolist()


def _float_list(series: pd.Series) -> list[float | None]:
    out: list[float | None] = []
    for value in series:
        if pd.isna(value):
            out.append(None)
        else:
            out.append(float(value))
    return out


def _series_to_values(series: pd.Series) -> list[bool] | list[float | None]:
    if series.dtype == bool or str(series.dtype) == "boolean":
        return _bool_list(series)
    return _float_list(series)


def _serialize_internals(internals: dict[str, Any]) -> dict[str, Any]:
    serialized: dict[str, Any] = {}
    for section, content in internals.items():
        if section == "blockers":
            serialized[section] = {
                instance_id: {key: _series_to_values(series) for key, series in fields.items()}
                for instance_id, fields in content.items()
            }
        else:
            serialized[section] = {
                key: _series_to_values(series) for key, series in content.items()
            }
    return serialized


def _index_to_times_sec(index: pd.Index) -> list[int]:
    if isinstance(index, pd.DatetimeIndex):
        return [int(ts.timestamp()) for ts in index]
    raise TypeError("signal trace requires DatetimeIndex on OHLCV frame")


@dataclass(frozen=True)
class SideSignalTrace:
    direction_ok: list[bool]
    blockers_ok: list[bool]
    setup_ok: list[bool]
    trigger_ok: list[bool]
    risk_ok: list[bool]
    signal_entry: list[bool]
    stop_ready: list[bool]
    portfolio_entry: list[bool]
    internals: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SignalTraceBundleData:
    times: list[int]
    meta: dict[str, Any]
    htf_context: dict[str, Any]
    long: SideSignalTrace
    short: SideSignalTrace


def _build_side_trace(
    *,
    df: pd.DataFrame,
    side: TradeSide,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
    fast_col: str,
    anchor_col: str,
    slow_col: str,
    stop_ready: pd.Series,
) -> SideSignalTrace:
    if not spec.trade_sides.includes(side):
        n = len(df)
        false = [False] * n
        true = [True] * n
        return SideSignalTrace(
            direction_ok=false,
            blockers_ok=true,
            setup_ok=false,
            trigger_ok=false,
            risk_ok=true,
            signal_entry=false,
            stop_ready=_bool_list(stop_ready),
            portfolio_entry=false,
            internals={},
        )

    setup_id = spec.components.setup
    trigger_rule = spec.components.trigger
    trigger_id = trigger_rule.component_id
    if setup_id not in _SETUP_TRACE:
        raise UnsupportedTraceComponentError(f"setup trace not implemented: {setup_id!r}")
    if (
        not isinstance(trigger_rule, ReclaimTriggerSpec | StrongReclaimTriggerSpec)
        and trigger_id not in _TRIGGER_TRACE
    ):
        raise UnsupportedTraceComponentError(f"trigger trace not implemented: {trigger_id!r}")

    direction_trace = ema_anchor_stack_trend_trace(
        df, fast_col, anchor_col, slow_col, side=side
    )
    direction = direction_trace["direction_ok"]

    blocker_traces: dict[str, dict[str, pd.Series]] = {}
    blocker_signals: list[pd.Series] = []
    for rule in spec.components.blockers:
        trace_fn = _BLOCKER_TRACE.get(rule.component_id)
        if trace_fn is None:
            raise UnsupportedTraceComponentError(
                f"blocker trace not implemented: {rule.component_id!r}"
            )
        if rule.component_id == RSI_LOOKBACK_EXTREME_BLOCKER_COMPONENT:
            trace = trace_fn(
                df,
                side=side,
                rule=rule,
                rsi_col=_rsi_column(plan, rule.rsi),
            )
        else:
            trace = trace_fn(df, side=side)
        blocker_traces[rule.instance_id] = trace
        blocker_signals.append(trace["allowed"])

    blockers = compose_blocker_signals(tuple(blocker_signals))

    setup_trace = _SETUP_TRACE[setup_id](
        df,
        anchor_col,
        spec.setup.lookback,
        spec.setup.active_bars,
        side=side,
    )
    setup = setup_trace["setup"]

    if isinstance(trigger_rule, ReclaimTriggerSpec):
        trigger_trace = reclaim_anchor_trace(
            df, anchor_col, trigger_rule.lookback, side=side
        )
    elif isinstance(trigger_rule, StrongReclaimTriggerSpec):
        trigger_trace = strong_reclaim_anchor_trace(
            df, anchor_col, trigger_rule.lookback, side=side
        )
    else:
        trigger_trace = _TRIGGER_TRACE[trigger_id](df, anchor_col, side=side)
    trigger = trigger_trace["trigger"]

    risk = no_risk_filter(df, side=side)

    signal_entry = compose_final_signals(
        direction_allowed=direction,
        blockers_ok=blockers,
        setup_ok=setup,
        trigger_ok=trigger,
        risk_ok=risk,
    )
    portfolio_entry = signal_entry & stop_ready

    internals: dict[str, dict[str, pd.Series]] = {
        "direction": direction_trace,
        "setup": setup_trace,
        "trigger": trigger_trace,
        "blockers": blocker_traces,
    }

    return SideSignalTrace(
        direction_ok=_bool_list(direction),
        blockers_ok=_bool_list(blockers),
        setup_ok=_bool_list(setup),
        trigger_ok=_bool_list(trigger),
        risk_ok=_bool_list(risk),
        signal_entry=_bool_list(signal_entry),
        stop_ready=_bool_list(stop_ready),
        portfolio_entry=_bool_list(portfolio_entry),
        internals=_serialize_internals(internals),
    )


def build_signal_trace_from_spec(
    df: pd.DataFrame,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
) -> SignalTraceBundleData:
    """Full-index entry pipeline trace aligned with backtest signal composition."""

    fast_col = plan.anchor_columns["fast"]
    anchor_col = plan.anchor_columns["anchor"]
    slow_col = plan.anchor_columns["slow"]

    exit_outputs = build_exit_outputs_from_spec(df, spec, plan)

    long_trace = _build_side_trace(
        df=df,
        side="long",
        spec=spec,
        plan=plan,
        fast_col=fast_col,
        anchor_col=anchor_col,
        slow_col=slow_col,
        stop_ready=exit_outputs.stop_ready_long,
    )
    short_trace = _build_side_trace(
        df=df,
        side="short",
        spec=spec,
        plan=plan,
        fast_col=fast_col,
        anchor_col=anchor_col,
        slow_col=slow_col,
        stop_ready=exit_outputs.stop_ready_short,
    )

    trigger_rule = spec.components.trigger
    consumption = spec.trade_management.exit_policy.context_consumption
    if consumption is not None and consumption.context_ref in plan.htf_context_columns_by_ref:
        context_ref = consumption.context_ref
        context_cols = plan.htf_context_columns_for(context_ref)
        provider = spec.contexts_by_ref()[context_ref]
        htf_payload = {
            "state": [
                str(v) if isinstance(v, str) else "neutral"
                for v in exit_outputs.context_state.to_list()
            ],
            "fast": _float_list(df[context_cols["fast"]].astype(float)),
            "anchor": _float_list(df[context_cols["anchor"]].astype(float)),
            "slow": _float_list(df[context_cols["slow"]].astype(float)),
            "meta": {
                "context_ref": context_ref,
                "component_id": provider.component_id,
                "timeframe": provider.timeframe,
                "source": provider.source,
                "fast_period": provider.fast_period,
                "anchor_period": provider.anchor_period,
                "slow_period": provider.slow_period,
                "policy_id": consumption.policy.policy_id,
            },
        }
    else:
        htf_payload = {
            "state": [
                str(v) if isinstance(v, str) else "neutral"
                for v in exit_outputs.context_state.to_list()
            ],
            "fast": [],
            "anchor": [],
            "slow": [],
            "meta": {},
        }
    meta = {
        "variant": spec.variant,
        "component_ids": {
            "direction": spec.components.direction,
            "setup": spec.components.setup,
            "trigger": spec.components.trigger.component_id,
            "risk": spec.components.risk,
        },
        "setup_params": {
            "lookback": spec.setup.lookback,
            "active_bars": spec.setup.active_bars,
        },
        "trigger_params": (
            {"lookback": trigger_rule.lookback}
            if isinstance(trigger_rule, ReclaimTriggerSpec | StrongReclaimTriggerSpec)
            else {}
        ),
        "blocker_instances": [
            {"instance_id": rule.instance_id, "component_id": rule.component_id}
            for rule in spec.components.blockers
        ],
    }

    return SignalTraceBundleData(
        times=_index_to_times_sec(df.index),
        meta=meta,
        htf_context=htf_payload,
        long=long_trace,
        short=short_trace,
    )


def slice_signal_trace(
    trace: SignalTraceBundleData,
    *,
    from_time_sec: int,
    to_time_sec: int,
    max_bars: int = 5000,
) -> SignalTraceBundleData:
    """Keep bars with ``from_time_sec <= time <= to_time_sec``, tail-capped at ``max_bars``."""

    indices = [i for i, t in enumerate(trace.times) if from_time_sec <= t <= to_time_sec]
    if len(indices) > max_bars:
        indices = indices[-max_bars:]

    def _slice_side(side: SideSignalTrace) -> SideSignalTrace:
        def pick(values: list[bool]) -> list[bool]:
            return [values[i] for i in indices]

        def pick_internals(
            raw: dict[str, Any],
        ) -> dict[str, Any]:
            out: dict[str, Any] = {}
            for section, content in raw.items():
                if section == "blockers":
                    out[section] = {
                        instance_id: {k: [v[j] for j in indices] for k, v in fields.items()}
                        for instance_id, fields in content.items()
                    }
                else:
                    out[section] = {k: [v[j] for j in indices] for k, v in content.items()}
            return out

        return SideSignalTrace(
            direction_ok=pick(side.direction_ok),
            blockers_ok=pick(side.blockers_ok),
            setup_ok=pick(side.setup_ok),
            trigger_ok=pick(side.trigger_ok),
            risk_ok=pick(side.risk_ok),
            signal_entry=pick(side.signal_entry),
            stop_ready=pick(side.stop_ready),
            portfolio_entry=pick(side.portfolio_entry),
            internals=pick_internals(side.internals),
        )

    times = [trace.times[i] for i in indices]
    return SignalTraceBundleData(
        times=times,
        meta=trace.meta,
        htf_context={
            "state": [trace.htf_context["state"][i] for i in indices],
            "fast": (
                [trace.htf_context["fast"][i] for i in indices]
                if trace.htf_context["fast"]
                else []
            ),
            "anchor": (
                [trace.htf_context["anchor"][i] for i in indices]
                if trace.htf_context["anchor"]
                else []
            ),
            "slow": (
                [trace.htf_context["slow"][i] for i in indices]
                if trace.htf_context["slow"]
                else []
            ),
            "meta": trace.htf_context["meta"],
        },
        long=_slice_side(trace.long),
        short=_slice_side(trace.short),
    )
