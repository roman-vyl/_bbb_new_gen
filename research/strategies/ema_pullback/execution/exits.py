"""Exit-layer: map unified exit rules to vectorbt-facing outputs."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import pandas as pd

from research.strategies.ema_pullback.components.registry import resolve_component
from research.strategies.ema_pullback.execution.exit_attribution import ExitAttributionContext
from research.strategies.ema_pullback.features.plan import FeaturePlan
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec
from research.strategies.ema_pullback.spec import ExitRuleSpec
from research.strategies.ema_pullback.spec import RsiFeatureSpec
from research.strategies.ema_pullback.spec import TradeSide


@dataclass(frozen=True)
class PortfolioExitOutputs:
    exits: pd.Series
    short_exits: pd.Series
    sl_stop: pd.Series
    tp_stop: pd.Series
    output_counters: tuple[dict[str, Any], ...] = field(default_factory=tuple)
    attribution: ExitAttributionContext | None = None

    def stop_kwargs(self) -> dict[str, pd.Series]:
        return {
            "sl_stop": self.sl_stop,
            "tp_stop": self.tp_stop,
        }


def compose_exit_signals(signals: tuple[pd.Series, ...], *, index: pd.Index) -> pd.Series:
    """Any signal exit rule can close a trade."""

    if not signals:
        return pd.Series(False, index=index, dtype=bool)
    out = signals[0].fillna(False).astype(bool)
    for signal in signals[1:]:
        out = out | signal.fillna(False).astype(bool)
    return out.astype(bool)


def _false_series(index: pd.Index) -> pd.Series:
    return pd.Series(False, index=index, dtype=bool)


def _rsi_column(plan: FeaturePlan, rsi: RsiFeatureSpec | None) -> str | None:
    if rsi is None:
        return None
    return plan.rsi_columns[(rsi.timeframe, rsi.period)]


def _distance_column(plan: FeaturePlan, rule: ExitRuleSpec) -> str | None:
    if rule.distance is None:
        return None
    return plan.exit_distance_columns[rule.instance_id]


def _signal_series_for_side(
    df: pd.DataFrame,
    *,
    side: TradeSide,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
    anchor_col: str,
    exit_fn: Callable[..., pd.Series],
    rule: ExitRuleSpec,
) -> pd.Series:
    if not spec.trade_sides.includes(side):
        return _false_series(df.index)
    s = exit_fn(
        df,
        anchor_col=anchor_col,
        side=side,
        rule=rule,
        rsi_col=_rsi_column(plan, rule.rsi),
    )
    return s.fillna(False).astype(bool)


def build_exit_outputs_from_spec(
    df: pd.DataFrame,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
) -> PortfolioExitOutputs:
    """Build signal exits, stop/take series, and attribution from one pass over exit rules."""

    resolved_rules = tuple(
        (resolve_component("exits", rule.component_id).func, rule) for rule in spec.components.exits
    )
    anchor_col = plan.anchor_columns["anchor"]
    index = df.index
    close = df["close"].astype(float)
    nan_series = pd.Series(float("nan"), index=index, dtype=float)

    n_rules = len(resolved_rules)
    long_by_idx: list[pd.Series | None] = [None] * n_rules
    short_by_idx: list[pd.Series | None] = [None] * n_rules
    dist_ratio_by_idx: list[pd.Series | None] = [None] * n_rules
    instance_ids: list[str] = []
    exit_kinds: list[str] = []

    long_signal_parts: list[pd.Series] = []
    short_signal_parts: list[pd.Series] = []
    sl_distances: list[pd.Series] = []
    tp_distances: list[pd.Series] = []
    counters: list[dict[str, Any]] = []

    for exit_fn, rule in resolved_rules:
        instance_ids.append(rule.instance_id)
        exit_kinds.append(rule.exit_kind)

        if rule.exit_kind == "signal":
            long_s = _signal_series_for_side(
                df, side="long", spec=spec, plan=plan, anchor_col=anchor_col, exit_fn=exit_fn, rule=rule
            )
            short_s = _signal_series_for_side(
                df, side="short", spec=spec, plan=plan, anchor_col=anchor_col, exit_fn=exit_fn, rule=rule
            )
            rule_i = len(instance_ids) - 1
            long_by_idx[rule_i] = long_s
            short_by_idx[rule_i] = short_s
            long_signal_parts.append(long_s)
            short_signal_parts.append(short_s)
            counters.append(
                {
                    "role": "exits",
                    "component_id": rule.component_id,
                    "instance_id": rule.instance_id,
                    "exit_kind": rule.exit_kind,
                    "side": "long",
                    "output_type": "boolean",
                    "counters": {"signal_count": int(long_s.sum())},
                }
            )
            counters.append(
                {
                    "role": "exits",
                    "component_id": rule.component_id,
                    "instance_id": rule.instance_id,
                    "exit_kind": rule.exit_kind,
                    "side": "short",
                    "output_type": "boolean",
                    "counters": {"signal_count": int(short_s.sum())},
                }
            )
        else:
            distance_col = _distance_column(plan, rule)
            distance = exit_fn(df, rule=rule, distance_col=distance_col).astype(float)
            rule_i = len(instance_ids) - 1
            dist_ratio_by_idx[rule_i] = distance / close
            if rule.exit_kind == "stop_loss":
                sl_distances.append(distance)
            else:
                tp_distances.append(distance)
            non_null_count = int(distance.notna().sum())
            counters.append(
                {
                    "role": "exits",
                    "component_id": rule.component_id,
                    "instance_id": rule.instance_id,
                    "exit_kind": rule.exit_kind,
                    "side": None,
                    "output_type": "distance",
                    "counters": {
                        "ready_count": non_null_count,
                        "non_null_distance_count": non_null_count,
                    },
                }
            )

    stop_loss = (
        pd.concat(sl_distances, axis=1).min(axis=1) if sl_distances else nan_series
    )
    take_profit = (
        pd.concat(tp_distances, axis=1).min(axis=1) if tp_distances else nan_series
    )
    sl_stop = stop_loss.astype(float) / close
    tp_stop = take_profit.astype(float) / close

    long_exits = compose_exit_signals(tuple(long_signal_parts), index=index)
    short_exits = compose_exit_signals(tuple(short_signal_parts), index=index)

    attribution = ExitAttributionContext(
        index=index,
        instance_ids=tuple(instance_ids),
        exit_kinds=tuple(exit_kinds),
        long_signal_by_rule=tuple(long_by_idx),
        short_signal_by_rule=tuple(short_by_idx),
        distance_ratio_by_rule=tuple(dist_ratio_by_idx),
        sl_stop_agg=sl_stop,
        tp_stop_agg=tp_stop,
    )

    return PortfolioExitOutputs(
        exits=long_exits,
        short_exits=short_exits,
        sl_stop=sl_stop,
        tp_stop=tp_stop,
        output_counters=tuple(counters),
        attribution=attribution,
    )
