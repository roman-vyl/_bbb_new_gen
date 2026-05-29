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
from research.strategies.ema_pullback.context.consumption_trace import build_context_consumption_trace
from research.strategies.ema_pullback.context.bundle import ContextBundle
from research.strategies.ema_pullback.context.pipeline import build_context_bundle_for_spec
from research.strategies.ema_pullback.context.evaluation import (
    SideAwareEvaluationContext,
    evaluate_context_consumption,
)
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
    context_consumption_trace: list[dict[str, Any]]
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
    context_bundle: ContextBundle | None = None,
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
        allowed = trace["allowed"]
        consumption = rule.context_consumption
        if consumption is not None and context_bundle is not None:
            result = evaluate_context_consumption(
                consumption,
                SideAwareEvaluationContext(
                    context_bundle=context_bundle,
                    index=df.index,
                    evaluated_side=side,
                ),
            )
            gate = result.allowed_mask
            if gate is None:
                raise ValueError(
                    "context consumption result missing allowed_mask for "
                    f"{consumption.policy.policy_id!r}"
                )
            allowed = allowed & gate.fillna(False).astype(bool)
            trace = {**trace, "allowed": allowed, "htf_gate": gate}
        blocker_traces[rule.instance_id] = trace
        blocker_signals.append(allowed)

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
    *,
    context_overlay_ref: str | None = None,
) -> SignalTraceBundleData:
    """Full-index entry pipeline trace aligned with backtest signal composition."""

    fast_col = plan.anchor_columns["fast"]
    anchor_col = plan.anchor_columns["anchor"]
    slow_col = plan.anchor_columns["slow"]

    context_bundle = build_context_bundle_for_spec(spec, df, plan)
    exit_outputs = build_exit_outputs_from_spec(
        df, spec, plan, context_bundle=context_bundle
    )

    long_trace = _build_side_trace(
        df=df,
        side="long",
        spec=spec,
        plan=plan,
        fast_col=fast_col,
        anchor_col=anchor_col,
        slow_col=slow_col,
        stop_ready=exit_outputs.stop_ready_long,
        context_bundle=context_bundle,
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
        context_bundle=context_bundle,
    )

    trigger_rule = spec.components.trigger
    overlay_ref = context_overlay_ref
    if overlay_ref is not None and overlay_ref not in spec.contexts_by_ref():
        raise ValueError(
            f"context_overlay_ref {overlay_ref!r} is not defined in strategy.contexts"
        )
    if overlay_ref is not None and context_bundle is not None:
        context_output = context_bundle.get(overlay_ref)
        context_cols = plan.htf_context_columns_for(overlay_ref)
        provider = spec.contexts_by_ref()[overlay_ref]
        htf_payload = {
            "state": [
                str(v) if isinstance(v, str) else "neutral"
                for v in context_output.state_series().to_list()
            ],
            "fast": _float_list(df[context_cols["fast"]].astype(float)),
            "anchor": _float_list(df[context_cols["anchor"]].astype(float)),
            "slow": _float_list(df[context_cols["slow"]].astype(float)),
            "meta": {
                "context_ref": overlay_ref,
                "component_id": provider.component_id,
                "timeframe": provider.timeframe,
                "source": provider.source,
                "fast_period": provider.fast_period,
                "anchor_period": provider.anchor_period,
                "slow_period": provider.slow_period,
            },
        }
    else:
        htf_payload = {
            "state": [],
            "fast": [],
            "anchor": [],
            "slow": [],
            "meta": {},
        }

    consumption_trace = build_context_consumption_trace(
        spec,
        df,
        plan,
        context_bundle=context_bundle,
        exit_outputs=exit_outputs,
        context_overlay_ref=overlay_ref,
    )
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
        context_consumption_trace=consumption_trace,
        long=long_trace,
        short=short_trace,
    )


def _slice_indexed_list(
    values: list[Any],
    indices: list[int],
    *,
    full_length: int,
) -> list[Any]:
    """Slice per-bar series only when aligned with ``trace.times`` (full_length)."""

    if not values or len(values) != full_length:
        return []
    return [values[i] for i in indices]


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
    full_length = len(trace.times)

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

    def _slice_consumption_trace(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
        sliced_records: list[dict[str, Any]] = []
        for record in raw:
            applied = record.get("context_applied")
            if not isinstance(applied, list):
                sliced_records.append(record)
                continue
            next_record = dict(record)
            next_record["context_applied"] = _slice_indexed_list(
                applied,
                indices,
                full_length=full_length,
            )
            outcome = record.get("outcome")
            if isinstance(outcome, dict):
                next_outcome: dict[str, Any] = {}
                for key, values in outcome.items():
                    if isinstance(values, list):
                        next_outcome[key] = _slice_indexed_list(
                            values,
                            indices,
                            full_length=full_length,
                        )
                    else:
                        next_outcome[key] = values
                next_record["outcome"] = next_outcome
            sliced_records.append(next_record)
        return sliced_records

    htf = trace.htf_context
    times = [trace.times[i] for i in indices]
    return SignalTraceBundleData(
        times=times,
        meta=trace.meta,
        htf_context={
            "state": _slice_indexed_list(
                list(htf.get("state") or []),
                indices,
                full_length=full_length,
            ),
            "fast": _slice_indexed_list(
                list(htf.get("fast") or []),
                indices,
                full_length=full_length,
            ),
            "anchor": _slice_indexed_list(
                list(htf.get("anchor") or []),
                indices,
                full_length=full_length,
            ),
            "slow": _slice_indexed_list(
                list(htf.get("slow") or []),
                indices,
                full_length=full_length,
            ),
            "meta": htf.get("meta") or {},
        },
        context_consumption_trace=_slice_consumption_trace(trace.context_consumption_trace),
        long=_slice_side(trace.long),
        short=_slice_side(trace.short),
    )
