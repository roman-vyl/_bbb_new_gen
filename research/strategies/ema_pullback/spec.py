"""StrategySpec contracts for ema_pullback Stage 10 pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
import hashlib
import json
from typing import Any, Literal

BREAK_EVEN_STOP_COMPONENT = "break_even_stop"
PROFILE_ORDER = ("aligned", "countertrend", "neutral")
TRADE_MANAGEMENT_PHASES = ("initial_risk", "proven", "protected", "runner", "exhaustion")
EXIT_MANAGEMENT_CONDITION_TYPES = ("mfe_atr", "mfe_pct", "bars_in_trade")


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
    trigger: "TriggerSpec"
    risk: str

    def __post_init__(self) -> None:
        for field_name in ("direction", "risk"):
            value = getattr(self, field_name)
            if not value.strip():
                raise ValueError(f"components.{field_name} must be non-empty")
        if not self.blockers:
            raise ValueError("components.blockers must contain at least one rule")
        _validate_unique_instance_ids("components.blockers", self.blockers)


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


TREND_STRENGTH_EPISODE_BLOCKER_COMPONENT = "trend_strength_episode_blocker"


@dataclass(frozen=True)
class TrendStrengthEpisodeBlockerParams:
    timeframe: str = "base"
    adx_period: int = 14
    min_adx_peak: float = 25.0
    peak_lookback_bars: int = 60
    max_bars_since_peak: int = 40
    min_current_adx: float = 12.0
    require_di_alignment_on_peak: bool = True
    block_on_opposite_di_flip: bool = True
    opposite_di_margin: float = 5.0

    def __post_init__(self) -> None:
        if self.timeframe.strip() != "base":
            raise ValueError(
                "trend_strength_episode_blocker MVP requires timeframe='base'"
            )
        if self.adx_period <= 0:
            raise ValueError("adx_period must be > 0")
        if self.peak_lookback_bars <= 0:
            raise ValueError("peak_lookback_bars must be > 0")
        if self.max_bars_since_peak <= 0:
            raise ValueError("max_bars_since_peak must be > 0")
        if self.min_adx_peak <= 0:
            raise ValueError("min_adx_peak must be > 0")
        if self.min_current_adx < 0:
            raise ValueError("min_current_adx must be >= 0")
        if self.opposite_di_margin < 0:
            raise ValueError("opposite_di_margin must be >= 0")


@dataclass(frozen=True)
class BlockerRuleSpec:
    instance_id: str
    component_id: str
    rsi: RsiFeatureSpec | None = None
    lookback: int = 20
    long_block_above: float | None = None
    short_block_below: float | None = None
    trend_strength: TrendStrengthEpisodeBlockerParams | None = None
    context_consumption: ContextConsumptionSpec | None = None

    def __post_init__(self) -> None:
        if not self.instance_id.strip():
            raise ValueError("blocker instance_id must be non-empty")
        if not self.component_id.strip():
            raise ValueError("blocker component_id must be non-empty")
        if self.lookback <= 0:
            raise ValueError("blocker lookback must be > 0")
        if self.component_id == TREND_STRENGTH_EPISODE_BLOCKER_COMPONENT:
            if self.trend_strength is None:
                raise ValueError(
                    "trend_strength_episode_blocker requires trend_strength params"
                )
            if self.rsi is not None:
                raise ValueError(
                    "trend_strength_episode_blocker must not set rsi params"
                )
        elif self.component_id == "rsi_lookback_extreme_blocker":
            for field_name in ("long_block_above", "short_block_below"):
                value = getattr(self, field_name)
                if value is not None and not (0 <= value <= 100):
                    raise ValueError(f"blocker {field_name} must be between 0 and 100")
        if self.trend_strength is not None and self.component_id != TREND_STRENGTH_EPISODE_BLOCKER_COMPONENT:
            raise ValueError(
                "trend_strength params only allowed for trend_strength_episode_blocker"
            )
        from research.strategies.ema_pullback.context.consumption_validation import (
            validate_blocker_context_consumption,
        )

        validate_blocker_context_consumption(self)


TradeSide = Literal["long", "short"]
ExitKind = Literal["signal", "stop_loss", "take_profit"]

_EXIT_COMPONENT_KINDS: dict[str, ExitKind] = {
    "no_signal_exit": "signal",
    "rsi_signal_exit": "signal",
    "ema_close_loss_exit": "signal",
    "ema_cross_loss_exit": "signal",
    "atr_stop_loss": "stop_loss",
    "atr_take_profit": "take_profit",
    "constant_usd_stop_loss": "stop_loss",
    "constant_usd_take_profit": "take_profit",
}

EMA_CLOSE_LOSS_EXIT_COMPONENT = "ema_close_loss_exit"
EMA_CROSS_LOSS_EXIT_COMPONENT = "ema_cross_loss_exit"


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
class EmaBounceCounterSetupSpec:
    max_bounces: int = 3
    raw_touch_mode: str = "range_cross"
    touch_lookback_bars: int = 10
    trend_start_confirmation_bars: int = 1
    trend_break_confirmation_bars: int = 1

    def __post_init__(self) -> None:
        if self.max_bounces <= 0:
            raise ValueError("setup.max_bounces must be > 0")
        if self.raw_touch_mode != "range_cross":
            raise ValueError("setup.raw_touch_mode must be 'range_cross'")
        if self.touch_lookback_bars <= 0:
            raise ValueError("setup.touch_lookback_bars must be > 0")
        if self.trend_start_confirmation_bars <= 0:
            raise ValueError("setup.trend_start_confirmation_bars must be > 0")
        if self.trend_break_confirmation_bars <= 0:
            raise ValueError("setup.trend_break_confirmation_bars must be > 0")


ANCHOR_STACK_WIDTH_SETUP_COMPONENT = "anchor_stack_width_setup"


@dataclass(frozen=True)
class AnchorStackWidthSetupSpec:
    atr_timeframe: str = "base"
    atr_period: int = 14
    min_current_width_atr: float = 2.0
    min_recent_width_atr: float = 4.0
    width_lookback_bars: int = 80

    def __post_init__(self) -> None:
        if self.atr_timeframe.strip() != "base":
            raise ValueError("anchor_stack_width_setup MVP requires atr_timeframe='base'")
        if self.atr_period <= 0:
            raise ValueError("atr_period must be > 0")
        if self.min_current_width_atr <= 0:
            raise ValueError("min_current_width_atr must be > 0")
        if self.min_recent_width_atr <= 0:
            raise ValueError("min_recent_width_atr must be > 0")
        if self.width_lookback_bars <= 0:
            raise ValueError("width_lookback_bars must be > 0")


SetupSpec = (
    UntouchedAnchorSetupSpec | EmaBounceCounterSetupSpec | AnchorStackWidthSetupSpec
)


@dataclass(frozen=True)
class SetupRuleSpec:
    instance_id: str
    component_id: str
    params: SetupSpec
    context_consumption: ContextConsumptionSpec | None = None

    def __post_init__(self) -> None:
        if not self.instance_id.strip():
            raise ValueError("setup instance_id must be non-empty")
        if not self.component_id.strip():
            raise ValueError("setup component_id must be non-empty")
        if self.component_id == "ema_bounce_counter_setup" and not isinstance(
            self.params, EmaBounceCounterSetupSpec
        ):
            raise ValueError(
                "setup params must be EmaBounceCounterSetupSpec for ema_bounce_counter_setup"
            )
        if self.component_id == "untouched_anchor_setup" and not isinstance(
            self.params, UntouchedAnchorSetupSpec
        ):
            raise ValueError(
                "setup params must be UntouchedAnchorSetupSpec for untouched_anchor_setup"
            )
        if self.component_id == ANCHOR_STACK_WIDTH_SETUP_COMPONENT and not isinstance(
            self.params, AnchorStackWidthSetupSpec
        ):
            raise ValueError(
                "setup params must be AnchorStackWidthSetupSpec for anchor_stack_width_setup"
            )
        from research.strategies.ema_pullback.context.consumption_validation import (
            validate_setup_context_consumption,
        )

        validate_setup_context_consumption(self)


@dataclass(frozen=True)
class ReclaimTriggerSpec(TriggerSpec):
    component_id: str = "reclaim_anchor"
    lookback: int = 1

    def __post_init__(self) -> None:
        super().__post_init__()
        if self.lookback <= 0:
            raise ValueError("trigger.lookback must be > 0")


@dataclass(frozen=True)
class StrongReclaimTriggerSpec(TriggerSpec):
    component_id: str = "strong_reclaim_anchor"
    lookback: int = 1

    def __post_init__(self) -> None:
        super().__post_init__()
        if self.lookback <= 0:
            raise ValueError("trigger.lookback must be > 0")


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


def _validate_ema_exit_rule_fields(rule: "ExitRuleSpec") -> None:
    if rule.component_id == EMA_CLOSE_LOSS_EXIT_COMPONENT:
        if rule.ema is None:
            raise ValueError("ema_close_loss_exit requires ema")
        if rule.fast_ema is not None or rule.slow_ema is not None:
            raise ValueError("ema_close_loss_exit must not define fast_ema or slow_ema")
        forbidden = (
            ("rsi", rule.rsi),
            ("long_exit_above", rule.long_exit_above),
            ("short_exit_below", rule.short_exit_below),
        )
        for name, value in forbidden:
            if value is not None:
                raise ValueError(f"ema_close_loss_exit must not define {name}")
        if rule.confirm_bars < 1:
            raise ValueError("ema_close_loss_exit requires confirm_bars >= 1")
        return
    if rule.component_id == EMA_CROSS_LOSS_EXIT_COMPONENT:
        if rule.ema is not None:
            raise ValueError("ema_cross_loss_exit must not define ema")
        if rule.fast_ema is None or rule.slow_ema is None:
            raise ValueError("ema_cross_loss_exit requires fast_ema and slow_ema")
        if rule.fast_ema.timeframe != rule.slow_ema.timeframe:
            raise ValueError("ema_cross_loss_exit requires fast_ema and slow_ema on the same timeframe")
        if rule.fast_ema.source != "close" or rule.slow_ema.source != "close":
            raise ValueError("ema_cross_loss_exit requires fast_ema and slow_ema source 'close'")
        if rule.fast_ema.period >= rule.slow_ema.period:
            raise ValueError("ema_cross_loss_exit requires fast_ema.period < slow_ema.period")
        forbidden = (
            ("rsi", rule.rsi),
            ("long_exit_above", rule.long_exit_above),
            ("short_exit_below", rule.short_exit_below),
        )
        for name, value in forbidden:
            if value is not None:
                raise ValueError(f"ema_cross_loss_exit must not define {name}")
        if rule.confirm_bars < 1:
            raise ValueError("ema_cross_loss_exit requires confirm_bars >= 1")


@dataclass(frozen=True)
class ExitRuleSpec:
    instance_id: str
    component_id: str
    exit_kind: ExitKind = "signal"
    rsi: RsiFeatureSpec | None = None
    ema: EmaSpec | None = None
    fast_ema: EmaSpec | None = None
    slow_ema: EmaSpec | None = None
    confirm_bars: int = 1
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
        if self.component_id in {EMA_CLOSE_LOSS_EXIT_COMPONENT, EMA_CROSS_LOSS_EXIT_COMPONENT}:
            _validate_ema_exit_rule_fields(self)


@dataclass(frozen=True)
class ContextProviderSpec:
    component_id: str
    timeframe: str
    source: str
    fast_period: int
    anchor_period: int
    slow_period: int

    def __post_init__(self) -> None:
        path = "strategy.contexts"
        if self.component_id != "htf_context":
            raise ValueError(f"{path} provider component_id must be 'htf_context'")
        if not self.timeframe.strip():
            raise ValueError(f"{path} provider timeframe must be non-empty")
        if self.source != "close":
            raise ValueError(f"{path} provider source must be 'close'")
        if self.fast_period <= 0 or self.anchor_period <= 0 or self.slow_period <= 0:
            raise ValueError(f"{path} provider periods must be > 0")
        if not (self.fast_period < self.anchor_period < self.slow_period):
            raise ValueError(f"{path} provider must satisfy fast < anchor < slow periods")


@dataclass(frozen=True)
class ContextConsumptionPolicySpec:
    policy_id: str
    params: tuple[tuple[str, Any], ...] = ()

    def __post_init__(self) -> None:
        if not self.policy_id.strip():
            raise ValueError("context_consumption.policy.policy_id must be non-empty")


@dataclass(frozen=True)
class ContextConsumptionSpec:
    context_ref: str
    policy: ContextConsumptionPolicySpec

    def __post_init__(self) -> None:
        if not self.context_ref.strip():
            raise ValueError("context_consumption.context_ref must be non-empty")


@dataclass(frozen=True)
class ExitPolicyGroupSpec:
    exits: tuple[ExitRuleSpec, ...]


@dataclass(frozen=True)
class ExitPolicyProfilesSpec:
    aligned: ExitPolicyGroupSpec
    countertrend: ExitPolicyGroupSpec
    neutral: ExitPolicyGroupSpec


def _exit_policy_has_profile_exits(profiles: ExitPolicyProfilesSpec) -> bool:
    return any(
        len(group.exits) > 0
        for group in (profiles.aligned, profiles.countertrend, profiles.neutral)
    )


@dataclass(frozen=True)
class ExitPolicySpec:
    always_on: ExitPolicyGroupSpec
    profiles: ExitPolicyProfilesSpec
    context_consumption: ContextConsumptionSpec | None = None

    def __post_init__(self) -> None:
        if _exit_policy_has_profile_exits(self.profiles) and self.context_consumption is None:
            raise ValueError(
                "trade_management.exit_policy.context_consumption is required when "
                "profile-scoped exits are non-empty"
            )
        rules_with_scope: list[tuple[str, tuple[ExitRuleSpec, ...]]] = [
            ("trade_management.exit_policy.always_on.exits", self.always_on.exits),
            ("trade_management.exit_policy.profiles.aligned.exits", self.profiles.aligned.exits),
            ("trade_management.exit_policy.profiles.countertrend.exits", self.profiles.countertrend.exits),
            ("trade_management.exit_policy.profiles.neutral.exits", self.profiles.neutral.exits),
        ]
        seen: set[str] = set()
        total = 0
        for scope, rules in rules_with_scope:
            total += len(rules)
            for rule in rules:
                instance_id = rule.instance_id
                if not instance_id.strip():
                    raise ValueError(f"{scope} instance_id must be non-empty")
                if instance_id in seen:
                    raise ValueError(
                        "trade_management.exit_policy instance_id must be globally unique: "
                        f"{instance_id!r}"
                    )
                seen.add(instance_id)
        if total == 0:
            raise ValueError("trade_management.exit_policy must contain at least one exit rule")


@dataclass(frozen=True)
class ExitManagementRuleSpec:
    instance_id: str
    component_id: str
    trigger_r: float
    offset_r: float = 0.0
    apply_once: bool = True

    def __post_init__(self) -> None:
        if not self.instance_id.strip():
            raise ValueError("exit_management instance_id must be non-empty")
        if not self.component_id.strip():
            raise ValueError("exit_management component_id must be non-empty")
        if self.component_id != BREAK_EVEN_STOP_COMPONENT:
            raise ValueError(
                f"exit_management v1 supports only {BREAK_EVEN_STOP_COMPONENT!r}; "
                f"got {self.component_id!r}"
            )
        if self.trigger_r <= 0:
            raise ValueError("break_even_stop trigger_r must be > 0")
        if self.offset_r < 0:
            raise ValueError("break_even_stop offset_r must be >= 0")
        if not self.apply_once:
            raise ValueError("break_even_stop apply_once must be true in v1")


@dataclass(frozen=True)
class ExitManagementGroupSpec:
    rules: tuple[ExitManagementRuleSpec, ...] = ()

    def __post_init__(self) -> None:
        be_count = sum(1 for r in self.rules if r.component_id == BREAK_EVEN_STOP_COMPONENT)
        if be_count > 1:
            raise ValueError(
                "exit_management group allows at most one break_even_stop rule"
            )


@dataclass(frozen=True)
class ExitManagementProfilesSpec:
    aligned: ExitManagementGroupSpec
    countertrend: ExitManagementGroupSpec
    neutral: ExitManagementGroupSpec


@dataclass(frozen=True)
class PhaseRuleAtrSpec:
    timeframe: str = "base"
    period: int = 14

    def __post_init__(self) -> None:
        if not self.timeframe.strip():
            raise ValueError("phase_rules condition atr.timeframe must be non-empty")
        if self.period <= 0:
            raise ValueError("phase_rules condition atr.period must be > 0")


@dataclass(frozen=True)
class PhaseRuleConditionSpec:
    type: Literal["mfe_atr", "mfe_pct", "bars_in_trade"]
    threshold: float
    atr: PhaseRuleAtrSpec | None = None

    def __post_init__(self) -> None:
        if self.type not in EXIT_MANAGEMENT_CONDITION_TYPES:
            allowed = ", ".join(repr(item) for item in EXIT_MANAGEMENT_CONDITION_TYPES)
            raise ValueError(f"phase_rules condition.type must be one of: {allowed}")
        if self.threshold <= 0:
            raise ValueError("phase_rules condition.threshold must be > 0")
        if self.type == "mfe_atr" and self.atr is None:
            raise ValueError("phase_rules condition atr is required for mfe_atr")
        if self.type != "mfe_atr" and self.atr is not None:
            raise ValueError("phase_rules condition atr is only allowed for mfe_atr")


@dataclass(frozen=True)
class PhaseRuleSpec:
    rule_id: str
    to_phase: Literal["proven", "protected", "runner", "exhaustion"]
    condition: PhaseRuleConditionSpec

    def __post_init__(self) -> None:
        if not self.rule_id.strip():
            raise ValueError("phase_rules rule_id must be non-empty")
        allowed = TRADE_MANAGEMENT_PHASES[1:]
        if self.to_phase not in allowed:
            allowed_text = ", ".join(repr(item) for item in allowed)
            raise ValueError(f"phase_rules to_phase must be one of: {allowed_text}")


def _empty_exit_management_profiles() -> ExitManagementProfilesSpec:
    empty = ExitManagementGroupSpec(rules=())
    return ExitManagementProfilesSpec(
        aligned=empty,
        countertrend=empty,
        neutral=empty,
    )


def empty_exit_management() -> "ExitManagementSpec":
    return ExitManagementSpec(
        always_on=ExitManagementGroupSpec(rules=()),
        profiles=_empty_exit_management_profiles(),
    )


@dataclass(frozen=True)
class ExitManagementSpec:
    always_on: ExitManagementGroupSpec
    profiles: ExitManagementProfilesSpec
    mode: Literal["diagnostic_only"] | None = None
    phase_rules: tuple[PhaseRuleSpec, ...] = ()
    stop_management: tuple[dict[str, Any], ...] = ()
    runtime_exits: tuple[dict[str, Any], ...] = ()

    def __post_init__(self) -> None:
        scopes: list[tuple[str, tuple[ExitManagementRuleSpec, ...]]] = [
            ("trade_management.exit_management.always_on.rules", self.always_on.rules),
            (
                "trade_management.exit_management.profiles.aligned.rules",
                self.profiles.aligned.rules,
            ),
            (
                "trade_management.exit_management.profiles.countertrend.rules",
                self.profiles.countertrend.rules,
            ),
            (
                "trade_management.exit_management.profiles.neutral.rules",
                self.profiles.neutral.rules,
            ),
        ]
        seen: set[str] = set()
        for scope, rules in scopes:
            for rule in rules:
                if rule.instance_id in seen:
                    raise ValueError(
                        "trade_management.exit_management instance_id must be globally unique: "
                        f"{rule.instance_id!r}"
                    )
                seen.add(rule.instance_id)
        if self.mode is not None and self.mode != "diagnostic_only":
            raise ValueError("trade_management.exit_management.mode must be 'diagnostic_only'")
        has_legacy_rules = any(rules for _, rules in scopes)
        if self.phase_rules and self.mode != "diagnostic_only":
            raise ValueError(
                "trade_management.exit_management.phase_rules require mode='diagnostic_only'"
            )
        if self.stop_management:
            raise ValueError(
                "trade_management.exit_management.stop_management is not supported in v1"
            )
        if self.runtime_exits:
            raise ValueError(
                "trade_management.exit_management.runtime_exits is not supported in v1"
            )
        if self.mode == "diagnostic_only" and has_legacy_rules:
            raise ValueError(
                "trade_management.exit_management.mode='diagnostic_only' cannot include "
                "legacy always_on/profiles management rules"
            )
        seen_phase_rules: set[str] = set()
        last_phase_rank = 0
        for rule in self.phase_rules:
            if rule.rule_id in seen_phase_rules:
                raise ValueError(
                    "trade_management.exit_management.phase_rules rule_id must be unique: "
                    f"{rule.rule_id!r}"
                )
            seen_phase_rules.add(rule.rule_id)
            phase_rank = TRADE_MANAGEMENT_PHASES.index(rule.to_phase)
            if phase_rank < last_phase_rank:
                raise ValueError(
                    "trade_management.exit_management.phase_rules must be ordered by "
                    "non-decreasing phase progression"
                )
            last_phase_rank = phase_rank


def _effective_exit_group_has_stop_loss(
    exit_policy: ExitPolicySpec,
    profile: str,
) -> bool:
    """True when always_on ∪ profile bucket has at least one stop_loss rule."""

    groups = [exit_policy.always_on.exits]
    if profile == "aligned":
        groups.append(exit_policy.profiles.aligned.exits)
    elif profile == "countertrend":
        groups.append(exit_policy.profiles.countertrend.exits)
    elif profile == "neutral":
        groups.append(exit_policy.profiles.neutral.exits)
    for exits in groups:
        if any(r.exit_kind == "stop_loss" for r in exits):
            return True
    return False


def _validate_exit_management_requires_initial_stop(
    exit_policy: ExitPolicySpec,
    exit_management: ExitManagementSpec,
) -> None:
    has_any_be = any(
        r.component_id == BREAK_EVEN_STOP_COMPONENT
        for rules in (
            exit_management.always_on.rules,
            exit_management.profiles.aligned.rules,
            exit_management.profiles.countertrend.rules,
            exit_management.profiles.neutral.rules,
        )
        for r in rules
    )
    if not has_any_be:
        return
    profile_checks: list[tuple[str, tuple[ExitManagementRuleSpec, ...]]] = [
        ("always_on", exit_management.always_on.rules),
        ("aligned", exit_management.profiles.aligned.rules),
        ("countertrend", exit_management.profiles.countertrend.rules),
        ("neutral", exit_management.profiles.neutral.rules),
    ]
    for bucket, rules in profile_checks:
        if not any(r.component_id == BREAK_EVEN_STOP_COMPONENT for r in rules):
            continue
        if bucket == "always_on":
            if not any(r.exit_kind == "stop_loss" for r in exit_policy.always_on.exits):
                raise ValueError(
                    "break_even_stop in exit_management.always_on requires stop_loss in "
                    "exit_policy.always_on"
                )
        elif not _effective_exit_group_has_stop_loss(exit_policy, bucket):
            raise ValueError(
                f"break_even_stop in exit_management.profiles.{bucket} requires stop_loss in "
                f"exit_policy always_on or profiles.{bucket}"
            )


@dataclass(frozen=True)
class TradeManagementSpec:
    exit_policy: ExitPolicySpec
    exit_management: ExitManagementSpec = field(default_factory=empty_exit_management)

    def __post_init__(self) -> None:
        exit_ids: set[str] = set()
        for rules in (
            self.exit_policy.always_on.exits,
            self.exit_policy.profiles.aligned.exits,
            self.exit_policy.profiles.countertrend.exits,
            self.exit_policy.profiles.neutral.exits,
        ):
            for rule in rules:
                if rule.instance_id in exit_ids:
                    raise ValueError(
                        "trade_management.exit_policy instance_id must be globally unique: "
                        f"{rule.instance_id!r}"
                    )
                exit_ids.add(rule.instance_id)
        for rules in (
            self.exit_management.always_on.rules,
            self.exit_management.profiles.aligned.rules,
            self.exit_management.profiles.countertrend.rules,
            self.exit_management.profiles.neutral.rules,
        ):
            for rule in rules:
                if rule.instance_id in exit_ids:
                    raise ValueError(
                        "instance_id must be unique across exit_policy and exit_management: "
                        f"{rule.instance_id!r}"
                    )
                exit_ids.add(rule.instance_id)
        _validate_exit_management_requires_initial_stop(
            self.exit_policy,
            self.exit_management,
        )


@dataclass(frozen=True)
class EmaPullbackStrategySpec:
    variant: str
    symbol: str
    base_timeframe: str
    anchor_stack: AnchorStackSpec
    components: ComponentStackSpec
    trade_sides: TradeSideSpec
    setups: tuple[SetupRuleSpec, ...]
    trade_management: TradeManagementSpec
    contexts: tuple[tuple[str, ContextProviderSpec], ...] = ()

    def contexts_by_ref(self) -> dict[str, ContextProviderSpec]:
        return dict(self.contexts)

    def __post_init__(self) -> None:
        if not self.variant.strip():
            raise ValueError("variant must be non-empty")
        if not self.symbol.strip():
            raise ValueError("symbol must be non-empty")
        if not self.base_timeframe.strip():
            raise ValueError("base_timeframe must be non-empty")
        if not self.setups:
            raise ValueError("setups must contain at least one rule")
        _validate_unique_instance_ids("setups", self.setups)
        seen_refs: set[str] = set()
        for context_ref, _provider in self.contexts:
            if context_ref in seen_refs:
                raise ValueError(f"strategy.contexts has duplicate context_ref: {context_ref!r}")
            seen_refs.add(context_ref)
        consumption = self.trade_management.exit_policy.context_consumption
        if consumption is not None and consumption.context_ref not in seen_refs:
            raise ValueError(
                "trade_management.exit_policy.context_consumption.context_ref "
                f"{consumption.context_ref!r} is not defined in strategy.contexts"
            )
        for rule in self.components.blockers:
            blocker_consumption = rule.context_consumption
            if blocker_consumption is None:
                continue
            if blocker_consumption.context_ref not in seen_refs:
                raise ValueError(
                    f"blockers[{rule.instance_id!r}].context_consumption.context_ref "
                    f"{blocker_consumption.context_ref!r} is not defined in strategy.contexts"
                )
        for rule in self.setups:
            setup_consumption = rule.context_consumption
            if setup_consumption is None:
                continue
            if setup_consumption.context_ref not in seen_refs:
                raise ValueError(
                    f"setups[{rule.instance_id!r}].context_consumption.context_ref "
                    f"{setup_consumption.context_ref!r} is not defined in strategy.contexts"
                )


def _normalize_policy_params_wire(params: Any) -> dict[str, Any]:
    if params is None:
        return {}
    if isinstance(params, dict):
        return params
    if isinstance(params, (list, tuple)):
        return dict(params)
    return {}


def _normalize_context_consumption_wire(block: Any) -> None:
    if not isinstance(block, dict):
        return
    policy = block.get("policy")
    if isinstance(policy, dict) and "params" in policy:
        policy["params"] = _normalize_policy_params_wire(policy["params"])


def strategy_spec_to_dict(spec: EmaPullbackStrategySpec) -> dict[str, Any]:
    payload = asdict(spec)
    # Wire format for reports / API: contexts as {ref: provider}, not asdict's tuple-of-tuples.
    if spec.contexts:
        payload["contexts"] = {
            context_ref: asdict(provider) for context_ref, provider in spec.contexts
        }
    else:
        payload.pop("contexts", None)
    components = payload.get("components")
    if isinstance(components, dict):
        blockers = components.get("blockers")
        if isinstance(blockers, (list, tuple)):
            for blocker in blockers:
                if isinstance(blocker, dict):
                    _normalize_context_consumption_wire(blocker.get("context_consumption"))
    trade_management = payload.get("trade_management")
    if isinstance(trade_management, dict):
        exit_policy = trade_management.get("exit_policy")
        if isinstance(exit_policy, dict):
            _normalize_context_consumption_wire(exit_policy.get("context_consumption"))
        exit_management = trade_management.get("exit_management")
        if isinstance(exit_management, dict):

            def _rules_to_list(group: Any) -> None:
                if not isinstance(group, dict):
                    return
                rules = group.get("rules")
                if isinstance(rules, tuple):
                    group["rules"] = list(rules)

            _rules_to_list(exit_management.get("always_on"))
            profiles = exit_management.get("profiles")
            if isinstance(profiles, dict):
                for bucket in ("aligned", "countertrend", "neutral"):
                    _rules_to_list(profiles.get(bucket))
            if exit_management.get("mode") is None:
                exit_management.pop("mode", None)
            for key in ("phase_rules", "stop_management", "runtime_exits"):
                value = exit_management.get(key)
                if value in ((), [], None):
                    exit_management.pop(key, None)
                elif isinstance(value, tuple):
                    exit_management[key] = list(value)
    setups = payload.get("setups")
    if isinstance(setups, (list, tuple)):
        for setup in setups:
            if isinstance(setup, dict):
                _normalize_context_consumption_wire(setup.get("context_consumption"))
    return payload


def strategy_spec_config_id(spec: EmaPullbackStrategySpec) -> str:
    payload = json.dumps(strategy_spec_to_dict(spec), sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]
