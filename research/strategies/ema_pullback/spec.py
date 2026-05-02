"""Frozen StrategySpec contracts for ema_pullback family (Stage 10)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

RuleTypeLiteral = Literal["stop_loss_by_distance", "take_profit_by_distance"]


@dataclass(frozen=True)
class EmaSpec:
    source: Literal["close"]
    timeframe: Literal["base"]
    period: int

    def __post_init__(self) -> None:
        if self.timeframe != "base":
            raise ValueError('EmaSpec.timeframe must be "base" on Stage 10')
        if self.period <= 0:
            raise ValueError("EmaSpec.period must be > 0")


@dataclass(frozen=True)
class AnchorStackSpec:
    fast: EmaSpec
    anchor: EmaSpec
    slow: EmaSpec


@dataclass(frozen=True)
class PullbackSetupSpec:
    component_id: Literal["pullback_to_anchor"]
    lookback: int

    def __post_init__(self) -> None:
        if self.component_id != "pullback_to_anchor":
            raise ValueError('PullbackSetupSpec.component_id must be "pullback_to_anchor"')
        if self.lookback <= 0:
            raise ValueError("PullbackSetupSpec.lookback must be > 0")


@dataclass(frozen=True)
class ReclaimTriggerSpec:
    component_id: Literal["reclaim_anchor"]

    def __post_init__(self) -> None:
        if self.component_id != "reclaim_anchor":
            raise ValueError('ReclaimTriggerSpec.component_id must be "reclaim_anchor"')


@dataclass(frozen=True)
class AtrDistanceSpec:
    timeframe: Literal["base"]
    period: int
    multiplier: float

    def __post_init__(self) -> None:
        if self.timeframe != "base":
            raise ValueError('AtrDistanceSpec.timeframe must be "base" on Stage 10')
        if self.period <= 0:
            raise ValueError("AtrDistanceSpec.period must be > 0")
        if self.multiplier <= 0:
            raise ValueError("AtrDistanceSpec.multiplier must be > 0")


@dataclass(frozen=True)
class DistanceExitRuleSpec:
    rule_type: RuleTypeLiteral
    distance: AtrDistanceSpec


@dataclass(frozen=True)
class TradeManagementSpec:
    profile: Literal["rule_based"]
    exit_rules: tuple[DistanceExitRuleSpec, ...]

    def __post_init__(self) -> None:
        if self.profile != "rule_based":
            raise ValueError('TradeManagementSpec.profile must be "rule_based" on Stage 10')
        if not self.exit_rules:
            raise ValueError("TradeManagementSpec.exit_rules must be non-empty")
        allowed: set[str] = {"stop_loss_by_distance", "take_profit_by_distance"}
        for rule in self.exit_rules:
            if rule.rule_type not in allowed:
                raise ValueError(f"unsupported exit rule_type: {rule.rule_type!r}")


@dataclass(frozen=True)
class EmaPullbackStrategySpec:
    variant: str
    symbol: str
    base_timeframe: str
    anchor_stack: AnchorStackSpec
    setup: PullbackSetupSpec
    trigger: ReclaimTriggerSpec
    trade_management: TradeManagementSpec

    def __post_init__(self) -> None:
        if not self.variant.strip():
            raise ValueError("variant must be non-empty")
        if not self.symbol.strip():
            raise ValueError("symbol must be non-empty")
        if not self.base_timeframe.strip():
            raise ValueError("base_timeframe must be non-empty")
        f, a, s = self.anchor_stack.fast, self.anchor_stack.anchor, self.anchor_stack.slow
        if not (f.period < a.period < s.period):
            raise ValueError("anchor_stack must satisfy fast.period < anchor.period < slow.period")


def _normalize_float_for_identity(value: float) -> Any:
    from decimal import Decimal, InvalidOperation

    try:
        normalized = Decimal(str(value)).normalize()
    except InvalidOperation as exc:
        raise ValueError(f"cannot normalize float value {value!r}") from exc
    as_text = format(normalized, "f")
    if "." in as_text:
        as_text = as_text.rstrip("0").rstrip(".")
    if as_text == "-0":
        as_text = "0"
    return as_text


def strategy_spec_identity(spec: EmaPullbackStrategySpec) -> dict[str, Any]:
    """Nested JSON-friendly map for config_id / artifacts (stable key order)."""

    def ema_dict(e: EmaSpec) -> dict[str, Any]:
        return {
            "source": e.source,
            "timeframe": e.timeframe,
            "period": e.period,
        }

    def atr_dist_dict(d: AtrDistanceSpec) -> dict[str, Any]:
        return {
            "timeframe": d.timeframe,
            "period": d.period,
            "multiplier": _normalize_float_for_identity(d.multiplier),
        }

    def rule_dict(r: DistanceExitRuleSpec) -> dict[str, Any]:
        return {"rule_type": r.rule_type, "distance": atr_dist_dict(r.distance)}

    return {
        "variant": spec.variant,
        "symbol": spec.symbol.strip().upper(),
        "base_timeframe": spec.base_timeframe.strip(),
        "anchor_stack": {
            "fast": ema_dict(spec.anchor_stack.fast),
            "anchor": ema_dict(spec.anchor_stack.anchor),
            "slow": ema_dict(spec.anchor_stack.slow),
        },
        "setup": {
            "component_id": spec.setup.component_id,
            "lookback": spec.setup.lookback,
        },
        "trigger": {"component_id": spec.trigger.component_id},
        "trade_management": {
            "profile": spec.trade_management.profile,
            "exit_rules": [rule_dict(r) for r in spec.trade_management.exit_rules],
        },
    }


def ema_pullback_fast20_anchor200_slow1000_spec(
    *,
    symbol: str = "BTCUSDT",
    base_timeframe: str = "1h",
) -> EmaPullbackStrategySpec:
    """First StrategySpec-backed instance (parameters live in spec, not in code constants)."""

    stack = AnchorStackSpec(
        fast=EmaSpec(source="close", timeframe="base", period=20),
        anchor=EmaSpec(source="close", timeframe="base", period=200),
        slow=EmaSpec(source="close", timeframe="base", period=1000),
    )
    stop_dist = AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5)
    take_dist = AtrDistanceSpec(timeframe="base", period=14, multiplier=4.0)
    return EmaPullbackStrategySpec(
        variant="ema_pullback_fast20_anchor200_slow1000",
        symbol=symbol.strip().upper(),
        base_timeframe=base_timeframe.strip(),
        anchor_stack=stack,
        setup=PullbackSetupSpec(component_id="pullback_to_anchor", lookback=3),
        trigger=ReclaimTriggerSpec(component_id="reclaim_anchor"),
        trade_management=TradeManagementSpec(
            profile="rule_based",
            exit_rules=(
                DistanceExitRuleSpec(rule_type="stop_loss_by_distance", distance=stop_dist),
                DistanceExitRuleSpec(rule_type="take_profit_by_distance", distance=take_dist),
            ),
        ),
    )
