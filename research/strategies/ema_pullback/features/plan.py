"""Compile StrategySpec to a concrete feature calculation plan."""

from __future__ import annotations

from dataclasses import dataclass

from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec


@dataclass(frozen=True)
class PlannedFeature:
    feature_id: str
    kind: str
    column: str
    params: dict[str, str | int | float]


@dataclass(frozen=True)
class FeaturePlan:
    features: tuple[PlannedFeature, ...]
    anchor_columns: dict[str, str]
    exit_distance_columns: dict[str, str]


def _fmt_multiplier(multiplier: float) -> str:
    return str(multiplier).replace(".", "_")


def build_feature_plan_from_strategy_spec(spec: EmaPullbackStrategySpec) -> FeaturePlan:
    features_by_id: dict[str, PlannedFeature] = {}

    def add_feature(feature: PlannedFeature) -> None:
        features_by_id.setdefault(feature.feature_id, feature)

    stack = spec.anchor_stack
    anchor_columns = {
        "fast": f"ema_{stack.fast.source}_{stack.fast.timeframe}_{stack.fast.period}",
        "anchor": f"ema_{stack.anchor.source}_{stack.anchor.timeframe}_{stack.anchor.period}",
        "slow": f"ema_{stack.slow.source}_{stack.slow.timeframe}_{stack.slow.period}",
    }
    add_feature(
        PlannedFeature(
            feature_id=anchor_columns["fast"],
            kind="ema",
            column=anchor_columns["fast"],
            params={
                "source": stack.fast.source,
                "timeframe": stack.fast.timeframe,
                "period": stack.fast.period,
            },
        )
    )
    add_feature(
        PlannedFeature(
            feature_id=anchor_columns["anchor"],
            kind="ema",
            column=anchor_columns["anchor"],
            params={
                "source": stack.anchor.source,
                "timeframe": stack.anchor.timeframe,
                "period": stack.anchor.period,
            },
        )
    )
    add_feature(
        PlannedFeature(
            feature_id=anchor_columns["slow"],
            kind="ema",
            column=anchor_columns["slow"],
            params={
                "source": stack.slow.source,
                "timeframe": stack.slow.timeframe,
                "period": stack.slow.period,
            },
        )
    )

    exit_distance_columns: dict[str, str] = {}
    for rule in spec.trade_management.exit_rules:
        distance = rule.distance
        atr_col = f"atr_close_{distance.timeframe}_{distance.period}"
        dist_col = f"{atr_col}_x{_fmt_multiplier(distance.multiplier)}"
        add_feature(
            PlannedFeature(
                feature_id=atr_col,
                kind="atr",
                column=atr_col,
                params={
                    "timeframe": distance.timeframe,
                    "period": distance.period,
                },
            )
        )
        add_feature(
            PlannedFeature(
                feature_id=dist_col,
                kind="atr_distance",
                column=dist_col,
                params={
                    "base_column": atr_col,
                    "multiplier": distance.multiplier,
                },
            )
        )
        exit_distance_columns[rule.rule_type] = dist_col

    return FeaturePlan(
        features=tuple(features_by_id.values()),
        anchor_columns=anchor_columns,
        exit_distance_columns=exit_distance_columns,
    )
