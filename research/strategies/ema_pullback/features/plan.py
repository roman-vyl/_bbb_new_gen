"""FeaturePlan from StrategySpec: declares which columns to prepare (no IO, no math)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from research.strategies.ema_pullback.spec import (
    AtrDistanceSpec,
    EmaPullbackStrategySpec,
    EmaSpec,
)


def ema_feature_id(ema: EmaSpec) -> str:
    """Stable column id: ``ema_<source>_<timeframe>_<period>``."""

    return f"ema_{ema.source}_{ema.timeframe}_{ema.period}"


def _atr_base_id(distance: AtrDistanceSpec) -> str:
    return f"atr_close_{distance.timeframe}_{distance.period}"


def _multiplier_suffix(multiplier: float) -> str:
    """Build suffix like ``1_5`` / ``4_0`` from multiplier (fixed-point ``f`` format)."""

    text = format(Decimal(str(multiplier)), "f")
    return text.replace(".", "_").replace("-", "neg")


def atr_distance_feature_id(distance: AtrDistanceSpec) -> str:
    """Scaled distance column id derived from exit rule distance spec."""

    base = _atr_base_id(distance)
    return f"{base}_x{_multiplier_suffix(distance.multiplier)}"


@dataclass(frozen=True)
class PlannedFeature:
    id: str
    kind: Literal["ema", "atr", "atr_distance"]
    ema_period: int | None = None
    atr_period: int | None = None
    atr_timeframe: str | None = None
    base_atr_id: str | None = None
    multiplier: float | None = None


@dataclass(frozen=True)
class FeaturePlan:
    features: tuple[PlannedFeature, ...]


def build_feature_plan_from_strategy_spec(spec: EmaPullbackStrategySpec) -> FeaturePlan:
    """Build deduplicated planned features for one StrategySpec instance."""

    by_id: dict[str, PlannedFeature] = {}

    def add(feature: PlannedFeature) -> None:
        by_id[feature.id] = feature

    for ema in (spec.anchor_stack.fast, spec.anchor_stack.anchor, spec.anchor_stack.slow):
        add(
            PlannedFeature(
                id=ema_feature_id(ema),
                kind="ema",
                ema_period=ema.period,
            )
        )

    atr_keys: set[tuple[str, int]] = set()
    for rule in spec.trade_management.exit_rules:
        d = rule.distance
        atr_keys.add((d.timeframe, d.period))

    for tf, period in sorted(atr_keys):
        base_id = f"atr_close_{tf}_{period}"
        add(
            PlannedFeature(
                id=base_id,
                kind="atr",
                atr_period=period,
                atr_timeframe=tf,
            )
        )

    for rule in spec.trade_management.exit_rules:
        d = rule.distance
        base_id = _atr_base_id(d)
        fid = atr_distance_feature_id(d)
        add(
            PlannedFeature(
                id=fid,
                kind="atr_distance",
                base_atr_id=base_id,
                multiplier=d.multiplier,
            )
        )

    return FeaturePlan(features=tuple(by_id[k] for k in sorted(by_id)))


def distance_columns_for_rule_based_trade_management(spec: EmaPullbackStrategySpec) -> tuple[str, str]:
    """Resolve stop/take distance column names from ``exit_rules`` order."""

    stop_col: str | None = None
    take_col: str | None = None
    for rule in spec.trade_management.exit_rules:
        col = atr_distance_feature_id(rule.distance)
        if rule.rule_type == "stop_loss_by_distance":
            stop_col = col
        elif rule.rule_type == "take_profit_by_distance":
            take_col = col
    if stop_col is None or take_col is None:
        raise ValueError("trade_management.exit_rules must include stop and take distance rules")
    return stop_col, take_col
