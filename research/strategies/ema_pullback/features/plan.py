"""Feature planning from StrategySpec without touching market data."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec, EmaSpec, ExitRuleSpec


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
        if self.kind not in {"ema", "atr", "atr_distance", "rsi"}:
            raise ValueError("planned feature kind must be ema|atr|atr_distance|rsi")


@dataclass(frozen=True)
class FeaturePlan:
    features: tuple[PlannedFeature, ...]
    anchor_columns: dict[str, str]
    exit_distance_columns: dict[str, str]
    rsi_columns: dict[tuple[str, int], str]
    ema_columns: dict[tuple[str, int], str] = field(default_factory=dict)
    htf_context_columns_by_ref: dict[str, dict[str, str]] = field(default_factory=dict)

    def htf_context_columns_for(self, context_ref: str) -> dict[str, str]:
        if context_ref not in self.htf_context_columns_by_ref:
            raise KeyError(f"HTF context columns not planned for context_ref={context_ref!r}")
        return self.htf_context_columns_by_ref[context_ref]

    @property
    def htf_context_columns(self) -> dict[str, str]:
        """First planned context ref columns (tests); prefer htf_context_columns_for."""
        if not self.htf_context_columns_by_ref:
            return {}
        first_ref = next(iter(self.htf_context_columns_by_ref))
        return self.htf_context_columns_by_ref[first_ref]

    def ema_column(self, ema: EmaSpec) -> str:
        key = (ema.timeframe, ema.period)
        if key not in self.ema_columns:
            raise KeyError(f"EMA column not planned for timeframe={ema.timeframe!r} period={ema.period}")
        return self.ema_columns[key]


def _ema_feature_id(timeframe: str, period: int) -> str:
    return f"ema_close_{timeframe}_{period}"


def _atr_feature_id(timeframe: str, period: int) -> str:
    return f"atr_close_{timeframe}_{period}"


def _rsi_feature_id(timeframe: str, period: int) -> str:
    return f"rsi_close_{timeframe}_{period}"


def _multiplier_token(multiplier: float) -> str:
    return str(float(multiplier)).replace(".", "_")


def _add_ema_feature(
    add: Callable[[PlannedFeature], None],
    ema: EmaSpec,
    ema_columns: dict[tuple[str, int], str],
) -> None:
    add(
        PlannedFeature(
            feature_id=_ema_feature_id(ema.timeframe, ema.period),
            kind="ema",
            source=ema.source,
            timeframe=ema.timeframe,
            period=ema.period,
            base_feature_id=None,
            multiplier=None,
        )
    )
    ema_columns[(ema.timeframe, ema.period)] = _ema_feature_id(ema.timeframe, ema.period)


def _ema_specs_from_exit_rule(rule: ExitRuleSpec) -> list[EmaSpec]:
    specs: list[EmaSpec] = []
    if rule.ema is not None:
        specs.append(rule.ema)
    if rule.fast_ema is not None:
        specs.append(rule.fast_ema)
    if rule.slow_ema is not None:
        specs.append(rule.slow_ema)
    return specs


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
                feature_id=_ema_feature_id(ema.timeframe, ema.period),
                kind="ema",
                source=ema.source,
                timeframe=ema.timeframe,
                period=ema.period,
                base_feature_id=None,
                multiplier=None,
            )
        )
    htf_context_columns_by_ref: dict[str, dict[str, str]] = {}
    for context_ref, provider in spec.contexts:
        for period in (provider.fast_period, provider.anchor_period, provider.slow_period):
            add(
                PlannedFeature(
                    feature_id=_ema_feature_id(provider.timeframe, period),
                    kind="ema",
                    source=provider.source,
                    timeframe=provider.timeframe,
                    period=period,
                    base_feature_id=None,
                    multiplier=None,
                )
            )
        htf_context_columns_by_ref[context_ref] = {
            "fast": _ema_feature_id(provider.timeframe, provider.fast_period),
            "anchor": _ema_feature_id(provider.timeframe, provider.anchor_period),
            "slow": _ema_feature_id(provider.timeframe, provider.slow_period),
        }

    all_exit_rules = (
        spec.trade_management.exit_policy.always_on.exits
        + spec.trade_management.exit_policy.profiles.aligned.exits
        + spec.trade_management.exit_policy.profiles.countertrend.exits
        + spec.trade_management.exit_policy.profiles.neutral.exits
    )

    exit_columns: dict[str, str] = {}
    for rule in all_exit_rules:
        if rule.distance is None:
            continue
        base_id = _atr_feature_id(rule.distance.timeframe, rule.distance.period)
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
        exit_columns[rule.instance_id] = distance_id
        exit_columns.setdefault(rule.exit_kind, distance_id)

    ema_columns: dict[tuple[str, int], str] = {}
    rsi_columns: dict[tuple[str, int], str] = {}
    rsi_specs = []
    for rule in spec.components.blockers:
        if rule.rsi is not None:
            rsi_specs.append(rule.rsi)
    for rule in all_exit_rules:
        if rule.rsi is not None:
            rsi_specs.append(rule.rsi)
        for ema in _ema_specs_from_exit_rule(rule):
            _add_ema_feature(add, ema, ema_columns)

    for rsi in rsi_specs:
        feature_id = _rsi_feature_id(rsi.timeframe, rsi.period)
        add(
            PlannedFeature(
                feature_id=feature_id,
                kind="rsi",
                source="close",
                timeframe=rsi.timeframe,
                period=rsi.period,
                base_feature_id=None,
                multiplier=None,
            )
        )
        rsi_columns[(rsi.timeframe, rsi.period)] = feature_id

    return FeaturePlan(
        features=tuple(features),
        anchor_columns={
            "fast": _ema_feature_id(spec.anchor_stack.fast.timeframe, spec.anchor_stack.fast.period),
            "anchor": _ema_feature_id(spec.anchor_stack.anchor.timeframe, spec.anchor_stack.anchor.period),
            "slow": _ema_feature_id(spec.anchor_stack.slow.timeframe, spec.anchor_stack.slow.period),
        },
        htf_context_columns_by_ref=htf_context_columns_by_ref,
        exit_distance_columns=exit_columns,
        rsi_columns=rsi_columns,
        ema_columns=ema_columns,
    )
