"""Feature planning from StrategySpec without touching market data."""

from __future__ import annotations

from dataclasses import dataclass

from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec


@dataclass(frozen=True)
class PlannedFeature:
    feature_id: str
    kind: str
    source: str | None
    timeframe: str
    period: int | None
    base_feature_id: str | None
    multiplier: float | None

    def __post_init__(self) -> None:
        if self.kind not in {"ema", "atr", "atr_distance"}:
            raise ValueError("planned feature kind must be ema|atr|atr_distance")


@dataclass(frozen=True)
class FeaturePlan:
    features: tuple[PlannedFeature, ...]
    anchor_columns: dict[str, str]
    exit_distance_columns: dict[str, str]


def _ema_feature_id(period: int) -> str:
    return f"ema_close_base_{period}"


def _atr_feature_id(period: int) -> str:
    return f"atr_close_base_{period}"


def _multiplier_token(multiplier: float) -> str:
    return str(float(multiplier)).replace(".", "_")


def build_feature_plan_from_strategy_spec(spec: EmaPullbackStrategySpec) -> FeaturePlan:
    features: list[PlannedFeature] = []
    seen: set[str] = set()

    def add(feature: PlannedFeature) -> None:
        if feature.feature_id in seen:
            return
        seen.add(feature.feature_id)
        features.append(feature)

    for ema in (spec.anchor_stack.fast, spec.anchor_stack.anchor, spec.anchor_stack.slow):
        add(
            PlannedFeature(
                feature_id=_ema_feature_id(ema.period),
                kind="ema",
                source=ema.source,
                timeframe=ema.timeframe,
                period=ema.period,
                base_feature_id=None,
                multiplier=None,
            )
        )

    exit_columns: dict[str, str] = {}
    for rule in spec.trade_management.exit_rules:
        base_id = _atr_feature_id(rule.distance.period)
        add(
            PlannedFeature(
                feature_id=base_id,
                kind="atr",
                source="close",
                timeframe=rule.distance.timeframe,
                period=rule.distance.period,
                base_feature_id=None,
                multiplier=None,
            )
        )
        distance_id = f"{base_id}_x{_multiplier_token(rule.distance.multiplier)}"
        add(
            PlannedFeature(
                feature_id=distance_id,
                kind="atr_distance",
                source=None,
                timeframe=rule.distance.timeframe,
                period=None,
                base_feature_id=base_id,
                multiplier=float(rule.distance.multiplier),
            )
        )
        exit_columns[rule.rule_type] = distance_id

    return FeaturePlan(
        features=tuple(features),
        anchor_columns={
            "fast": _ema_feature_id(spec.anchor_stack.fast.period),
            "anchor": _ema_feature_id(spec.anchor_stack.anchor.period),
            "slow": _ema_feature_id(spec.anchor_stack.slow.period),
        },
        exit_distance_columns=exit_columns,
    )
