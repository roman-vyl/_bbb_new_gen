"""Stage 10 strategy spec contracts for ema_pullback."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any


@dataclass(frozen=True)
class EmaSpec:
    source: str
    timeframe: str
    period: int

    def __post_init__(self) -> None:
        if self.source != "close":
            raise ValueError("ema source must be 'close'")
        if self.timeframe != "base":
            raise ValueError("ema timeframe must be 'base'")
        if self.period <= 0:
            raise ValueError("ema period must be > 0")


@dataclass(frozen=True)
class AnchorStackSpec:
    fast: EmaSpec
    anchor: EmaSpec
    slow: EmaSpec

    def __post_init__(self) -> None:
        if not (self.fast.period < self.anchor.period < self.slow.period):
            raise ValueError("anchor stack must satisfy fast.period < anchor.period < slow.period")


@dataclass(frozen=True)
class PullbackSetupSpec:
    component_id: str = "pullback_to_anchor"
    lookback: int = 3

    def __post_init__(self) -> None:
        if self.component_id != "pullback_to_anchor":
            raise ValueError("setup component_id must be 'pullback_to_anchor'")
        if self.lookback <= 0:
            raise ValueError("setup lookback must be > 0")


@dataclass(frozen=True)
class ReclaimTriggerSpec:
    component_id: str = "reclaim_anchor"

    def __post_init__(self) -> None:
        if self.component_id != "reclaim_anchor":
            raise ValueError("trigger component_id must be 'reclaim_anchor'")


@dataclass(frozen=True)
class AtrDistanceSpec:
    timeframe: str
    period: int
    multiplier: float

    def __post_init__(self) -> None:
        if self.timeframe != "base":
            raise ValueError("atr timeframe must be 'base'")
        if self.period <= 0:
            raise ValueError("atr period must be > 0")
        if self.multiplier <= 0:
            raise ValueError("atr multiplier must be > 0")


@dataclass(frozen=True)
class DistanceExitRuleSpec:
    rule_type: str
    distance: AtrDistanceSpec

    def __post_init__(self) -> None:
        allowed = {"stop_loss_by_distance", "take_profit_by_distance"}
        if self.rule_type not in allowed:
            raise ValueError(f"unsupported rule_type {self.rule_type!r}")


@dataclass(frozen=True)
class TradeManagementSpec:
    profile: str = "rule_based"
    exit_rules: tuple[DistanceExitRuleSpec, ...] = ()

    def __post_init__(self) -> None:
        if self.profile != "rule_based":
            raise ValueError("trade_management profile must be 'rule_based'")
        counts = {"stop_loss_by_distance": 0, "take_profit_by_distance": 0}
        for rule in self.exit_rules:
            counts[rule.rule_type] = counts.get(rule.rule_type, 0) + 1
        if counts["stop_loss_by_distance"] != 1:
            raise ValueError("trade_management must contain exactly one stop_loss_by_distance")
        if counts["take_profit_by_distance"] != 1:
            raise ValueError("trade_management must contain exactly one take_profit_by_distance")


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


def strategy_spec_to_dict(spec: EmaPullbackStrategySpec) -> dict[str, Any]:
    """Return canonical dict representation used for config id."""

    return asdict(spec)


def strategy_spec_config_id(spec: EmaPullbackStrategySpec) -> str:
    payload = json.dumps(
        strategy_spec_to_dict(spec),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]
