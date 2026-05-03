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
        if not self.timeframe.strip():
            raise ValueError("ema timeframe must be non-empty")
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
    blockers: tuple["BlockerRuleSpec", ...]
    setup: str
    trigger: "TriggerSpec"
    signal_exits: tuple["SignalExitRuleSpec", ...]
    risk: str

    def __post_init__(self) -> None:
        for field_name in ("direction", "setup", "risk"):
            value = getattr(self, field_name)
            if not value.strip():
                raise ValueError(f"components.{field_name} must be non-empty")
        if not self.blockers:
            raise ValueError("components.blockers must contain at least one rule")
        if not self.signal_exits:
            raise ValueError("components.signal_exits must contain at least one rule")


@dataclass(frozen=True)
class TriggerSpec:
    component_id: str

    def __post_init__(self) -> None:
        if not self.component_id.strip():
            raise ValueError("trigger component_id must be non-empty")


@dataclass(frozen=True)
class RsiFeatureSpec:
    timeframe: str = "base"
    period: int = 14

    def __post_init__(self) -> None:
        if not self.timeframe.strip():
            raise ValueError("rsi timeframe must be non-empty")
        if self.period <= 0:
            raise ValueError("rsi period must be > 0")


@dataclass(frozen=True)
class BlockerRuleSpec:
    component_id: str
    rsi: RsiFeatureSpec | None = None
    lookback: int = 1
    long_min: float | None = None
    short_max: float | None = None

    def __post_init__(self) -> None:
        if not self.component_id.strip():
            raise ValueError("blocker component_id must be non-empty")
        if self.lookback <= 0:
            raise ValueError("blocker lookback must be > 0")
        for field_name in ("long_min", "short_max"):
            value = getattr(self, field_name)
            if value is not None and not (0 <= value <= 100):
                raise ValueError(f"blocker {field_name} must be between 0 and 100")


@dataclass(frozen=True)
class SignalExitRuleSpec:
    component_id: str
    rsi: RsiFeatureSpec | None = None
    long_exit_above: float | None = None
    short_exit_below: float | None = None

    def __post_init__(self) -> None:
        if not self.component_id.strip():
            raise ValueError("signal exit component_id must be non-empty")
        for field_name in ("long_exit_above", "short_exit_below"):
            value = getattr(self, field_name)
            if value is not None and not (0 <= value <= 100):
                raise ValueError(f"signal exit {field_name} must be between 0 and 100")


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
class ReclaimTriggerSpec(TriggerSpec):
    component_id: str = "reclaim_anchor"


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
