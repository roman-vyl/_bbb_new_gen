"""StrategySpec contracts for ema_pullback Stage 10 pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any, Literal


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
            raise ValueError("anchor stack must satisfy fast < anchor < slow periods")


@dataclass(frozen=True)
class ComponentStackSpec:
    direction: str
    blockers: str
    setup: str
    trigger: str
    exits: str
    risk: str

    def __post_init__(self) -> None:
        for field_name in ("direction", "blockers", "setup", "trigger", "exits", "risk"):
            value = getattr(self, field_name)
            if not value.strip():
                raise ValueError(f"components.{field_name} must be non-empty")


TradeSide = Literal["long", "short"]


@dataclass(frozen=True)
class TradeSideSpec:
    enabled: tuple[TradeSide, ...] = ("long",)

    def __post_init__(self) -> None:
        if not self.enabled:
            raise ValueError("trade_sides.enabled must be non-empty")
        allowed = {"long", "short"}
        seen: set[str] = set()
        for side in self.enabled:
            if side not in allowed:
                raise ValueError(f"trade side must be one of {sorted(allowed)}")
            if side in seen:
                raise ValueError("trade_sides.enabled must not contain duplicates")
            seen.add(side)

    def includes(self, side: TradeSide) -> bool:
        return side in self.enabled


@dataclass(frozen=True)
class PullbackSetupSpec:
    lookback: int = 3

    def __post_init__(self) -> None:
        if self.lookback <= 0:
            raise ValueError("setup.lookback must be > 0")


@dataclass(frozen=True)
class ReclaimTriggerSpec:
    pass


@dataclass(frozen=True)
class AtrDistanceSpec:
    timeframe: str
    period: int
    multiplier: float

    def __post_init__(self) -> None:
        if self.timeframe != "base":
            raise ValueError("atr distance timeframe must be 'base'")
        if self.period <= 0:
            raise ValueError("atr distance period must be > 0")
        if self.multiplier <= 0:
            raise ValueError("atr distance multiplier must be > 0")


@dataclass(frozen=True)
class DistanceExitRuleSpec:
    rule_type: str
    distance: AtrDistanceSpec

    def __post_init__(self) -> None:
        allowed = {"stop_loss_by_distance", "take_profit_by_distance"}
        if self.rule_type not in allowed:
            raise ValueError(f"rule_type must be one of {sorted(allowed)}")


@dataclass(frozen=True)
class TradeManagementSpec:
    exit_rules: tuple[DistanceExitRuleSpec, ...]
    profile: str = "rule_based"

    def __post_init__(self) -> None:
        if self.profile != "rule_based":
            raise ValueError("trade management profile must be 'rule_based'")
        stop_rules = [r for r in self.exit_rules if r.rule_type == "stop_loss_by_distance"]
        take_rules = [r for r in self.exit_rules if r.rule_type == "take_profit_by_distance"]
        if len(stop_rules) != 1:
            raise ValueError("trade management must contain exactly one stop_loss_by_distance rule")
        if len(take_rules) != 1:
            raise ValueError("trade management must contain exactly one take_profit_by_distance rule")


@dataclass(frozen=True)
class EmaPullbackStrategySpec:
    variant: str
    symbol: str
    base_timeframe: str
    anchor_stack: AnchorStackSpec
    components: ComponentStackSpec
    trade_sides: TradeSideSpec
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
    return asdict(spec)


def strategy_spec_config_id(spec: EmaPullbackStrategySpec) -> str:
    payload = json.dumps(strategy_spec_to_dict(spec), sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]
