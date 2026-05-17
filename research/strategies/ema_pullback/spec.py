"""StrategySpec contracts for ema_pullback Stage 10 pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
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
    exits: tuple["ExitRuleSpec", ...]
    risk: str

    def __post_init__(self) -> None:
        for field_name in ("direction", "setup", "risk"):
            value = getattr(self, field_name)
            if not value.strip():
                raise ValueError(f"components.{field_name} must be non-empty")
        if not self.blockers:
            raise ValueError("components.blockers must contain at least one rule")
        if not self.exits:
            raise ValueError("components.exits must contain at least one rule")
        _validate_unique_instance_ids("components.blockers", self.blockers)
        _validate_unique_instance_ids("components.exits", self.exits)


@dataclass(frozen=True)
class TriggerSpec:
    component_id: str

    def __post_init__(self) -> None:
        if not self.component_id.strip():
            raise ValueError("trigger component_id must be non-empty")


def _validate_unique_instance_ids(
    collection_name: str,
    rules: tuple["BlockerRuleSpec", ...] | tuple["ExitRuleSpec", ...],
) -> None:
    seen: set[str] = set()
    for rule in rules:
        instance_id = rule.instance_id
        if not instance_id.strip():
            raise ValueError(f"{collection_name} instance_id must be non-empty")
        if instance_id in seen:
            raise ValueError(f"{collection_name} instance_id must be unique: {instance_id!r}")
        seen.add(instance_id)


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
    instance_id: str
    component_id: str
    rsi: RsiFeatureSpec | None = None
    lookback: int = 20
    long_block_above: float | None = None
    short_block_below: float | None = None

    def __post_init__(self) -> None:
        if not self.instance_id.strip():
            raise ValueError("blocker instance_id must be non-empty")
        if not self.component_id.strip():
            raise ValueError("blocker component_id must be non-empty")
        if self.lookback <= 0:
            raise ValueError("blocker lookback must be > 0")
        for field_name in ("long_block_above", "short_block_below"):
            value = getattr(self, field_name)
            if value is not None and not (0 <= value <= 100):
                raise ValueError(f"blocker {field_name} must be between 0 and 100")


TradeSide = Literal["long", "short"]
ExitKind = Literal["signal", "stop_loss", "take_profit"]

_EXIT_COMPONENT_KINDS: dict[str, ExitKind] = {
    "no_signal_exit": "signal",
    "rsi_signal_exit": "signal",
    "atr_stop_loss": "stop_loss",
    "atr_take_profit": "take_profit",
    "constant_usd_stop_loss": "stop_loss",
    "constant_usd_take_profit": "take_profit",
}


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
class UntouchedAnchorSetupSpec:
    lookback: int = 50
    active_bars: int = 3

    def __post_init__(self) -> None:
        if self.lookback <= 0:
            raise ValueError("setup.lookback must be > 0")
        if self.active_bars <= 0:
            raise ValueError("setup.active_bars must be > 0")


@dataclass(frozen=True)
class ReclaimTriggerSpec(TriggerSpec):
    component_id: str = "reclaim_anchor"


@dataclass(frozen=True)
class AtrDistanceSpec:
    timeframe: str
    period: int
    multiplier: float

    def __post_init__(self) -> None:
        if not self.timeframe.strip():
            raise ValueError("atr distance timeframe must be non-empty")
        if self.period <= 0:
            raise ValueError("atr distance period must be > 0")
        if self.multiplier <= 0:
            raise ValueError("atr distance multiplier must be > 0")


@dataclass(frozen=True)
class ExitRuleSpec:
    instance_id: str
    component_id: str
    exit_kind: ExitKind = "signal"
    rsi: RsiFeatureSpec | None = None
    long_exit_above: float | None = None
    short_exit_below: float | None = None
    distance: AtrDistanceSpec | None = None
    usd_distance: float | None = None

    def __post_init__(self) -> None:
        if not self.instance_id.strip():
            raise ValueError("exit instance_id must be non-empty")
        if not self.component_id.strip():
            raise ValueError("exit component_id must be non-empty")
        allowed = {"signal", "stop_loss", "take_profit"}
        if self.exit_kind not in allowed:
            raise ValueError(f"exit_kind must be one of {sorted(allowed)}")
        expected_kind = _EXIT_COMPONENT_KINDS.get(self.component_id)
        if expected_kind is not None and self.exit_kind != expected_kind:
            raise ValueError(
                f"exit component {self.component_id!r} requires exit_kind {expected_kind!r}"
            )
        if self.exit_kind == "signal":
            if self.distance is not None or self.usd_distance is not None:
                raise ValueError("signal exit must not define distance or usd_distance")
        elif self.component_id in {"atr_stop_loss", "atr_take_profit"}:
            if self.distance is None:
                raise ValueError(f"{self.component_id} exit requires distance")
            if self.usd_distance is not None:
                raise ValueError(f"{self.component_id} exit must not define usd_distance")
        elif self.component_id in {"constant_usd_stop_loss", "constant_usd_take_profit"}:
            if self.usd_distance is None or self.usd_distance <= 0:
                raise ValueError(f"{self.component_id} exit requires positive usd_distance")
            if self.distance is not None:
                raise ValueError(f"{self.component_id} exit must not define distance")
        elif self.exit_kind in {"stop_loss", "take_profit"}:
            raise ValueError(f"unsupported distance exit component_id {self.component_id!r}")
        if self.exit_kind in {"stop_loss", "take_profit"}:
            if self.rsi is not None or self.long_exit_above is not None or self.short_exit_below is not None:
                raise ValueError(f"{self.exit_kind} exit must not define signal thresholds")
        for field_name in ("long_exit_above", "short_exit_below"):
            value = getattr(self, field_name)
            if value is not None and not (0 <= value <= 100):
                raise ValueError(f"exit {field_name} must be between 0 and 100")


@dataclass(frozen=True)
class TradeManagementSpec:
    profile: str = "reserved"

    def __post_init__(self) -> None:
        if not self.profile.strip():
            raise ValueError("trade management profile must be non-empty")


@dataclass(frozen=True)
class EmaPullbackStrategySpec:
    variant: str
    symbol: str
    base_timeframe: str
    anchor_stack: AnchorStackSpec
    components: ComponentStackSpec
    trade_sides: TradeSideSpec
    setup: UntouchedAnchorSetupSpec
    trade_management: TradeManagementSpec = field(default_factory=TradeManagementSpec)

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
