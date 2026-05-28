"""Deserialize ``EmaPullbackStrategySpec`` from report JSON (``asdict`` payload)."""

from __future__ import annotations

from typing import Any, Mapping

from research.strategies.ema_pullback.components.registry import (
    RECLAIM_ANCHOR_COMPONENT,
    STRONG_RECLAIM_ANCHOR_COMPONENT,
)
from research.strategies.ema_pullback.spec import (
    AnchorStackSpec,
    AtrDistanceSpec,
    BlockerRuleSpec,
    ComponentStackSpec,
    EmaPullbackStrategySpec,
    EmaSpec,
    ExitPolicyGroupSpec,
    ExitPolicyProfilesSpec,
    ContextConsumptionPolicySpec,
    ContextConsumptionSpec,
    ContextProviderSpec,
    ExitPolicySpec,
    ExitRuleSpec,
    ReclaimTriggerSpec,
    StrongReclaimTriggerSpec,
    RsiFeatureSpec,
    TradeManagementSpec,
    TradeSideSpec,
    TriggerSpec,
    UntouchedAnchorSetupSpec,
)


class StrategySpecReportParseError(ValueError):
    """Report ``strategy_spec`` dict cannot be parsed."""


def _require_mapping(name: str, value: Any) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise StrategySpecReportParseError(f"{name} must be an object")
    return value


def _required_ema_spec(payload: Mapping[str, Any]) -> EmaSpec:
    return EmaSpec(
        source=str(payload["source"]),
        timeframe=str(payload["timeframe"]),
        period=int(payload["period"]),
    )


def _rsi_spec(payload: Mapping[str, Any] | None) -> RsiFeatureSpec | None:
    if payload is None:
        return None
    return RsiFeatureSpec(
        timeframe=str(payload.get("timeframe", "base")),
        period=int(payload.get("period", 14)),
    )


def _parse_blocker_context_consumption(value: Any) -> ContextConsumptionSpec | None:
    if value is None:
        return None
    consumption = _require_mapping("blocker.context_consumption", value)
    policy = _require_mapping("blocker.context_consumption.policy", consumption.get("policy"))
    params_raw = policy.get("params", {})
    if params_raw is None:
        params: tuple[tuple[str, Any], ...] = ()
    elif isinstance(params_raw, Mapping):
        params = tuple(sorted(params_raw.items(), key=lambda item: item[0]))
    else:
        raise StrategySpecReportParseError(
            "blocker.context_consumption.policy.params must be an object"
        )
    return ContextConsumptionSpec(
        context_ref=str(consumption["context_ref"]),
        policy=ContextConsumptionPolicySpec(
            policy_id=str(policy["policy_id"]),
            params=params,
        ),
    )


def _blocker_rule(payload: Mapping[str, Any]) -> BlockerRuleSpec:
    return BlockerRuleSpec(
        instance_id=str(payload["instance_id"]),
        component_id=str(payload["component_id"]),
        rsi=_rsi_spec(payload.get("rsi")),
        lookback=int(payload.get("lookback", 20)),
        long_block_above=payload.get("long_block_above"),
        short_block_below=payload.get("short_block_below"),
        context_consumption=_parse_blocker_context_consumption(payload.get("context_consumption")),
    )


def _atr_distance(payload: Mapping[str, Any] | None) -> AtrDistanceSpec | None:
    if payload is None:
        return None
    return AtrDistanceSpec(
        timeframe=str(payload["timeframe"]),
        period=int(payload["period"]),
        multiplier=float(payload["multiplier"]),
    )


def _optional_ema_spec(name: str, payload: Any) -> EmaSpec | None:
    if payload is None:
        return None
    ema = _require_mapping(name, payload)
    return EmaSpec(
        source=str(ema.get("source", "close")),
        timeframe=str(ema["timeframe"]),
        period=int(ema["period"]),
    )


def _exit_rule(payload: Mapping[str, Any]) -> ExitRuleSpec:
    return ExitRuleSpec(
        instance_id=str(payload["instance_id"]),
        component_id=str(payload["component_id"]),
        exit_kind=str(payload.get("exit_kind", "signal")),
        rsi=_rsi_spec(payload.get("rsi")),
        ema=_optional_ema_spec("ema", payload.get("ema")),
        fast_ema=_optional_ema_spec("fast_ema", payload.get("fast_ema")),
        slow_ema=_optional_ema_spec("slow_ema", payload.get("slow_ema")),
        confirm_bars=int(payload.get("confirm_bars", 1)),
        long_exit_above=payload.get("long_exit_above"),
        short_exit_below=payload.get("short_exit_below"),
        distance=_atr_distance(payload.get("distance")),
        usd_distance=payload.get("usd_distance"),
    )


def _trigger_spec(
    payload: Mapping[str, Any],
) -> TriggerSpec | ReclaimTriggerSpec | StrongReclaimTriggerSpec:
    component_id = str(payload["component_id"])
    if component_id == RECLAIM_ANCHOR_COMPONENT:
        return ReclaimTriggerSpec(lookback=int(payload.get("lookback", 1)))
    if component_id == STRONG_RECLAIM_ANCHOR_COMPONENT:
        return StrongReclaimTriggerSpec(lookback=int(payload.get("lookback", 1)))
    return TriggerSpec(component_id=component_id)


def _exit_policy_group(payload: Mapping[str, Any], *, name: str) -> ExitPolicyGroupSpec:
    exits_raw = payload.get("exits")
    if not isinstance(exits_raw, (list, tuple)):
        raise StrategySpecReportParseError(f"{name}.exits must be a list")
    return ExitPolicyGroupSpec(exits=tuple(_exit_rule(_require_mapping(f"{name}.exits[]", e)) for e in exits_raw))


def strategy_spec_from_report_dict(payload: Mapping[str, Any]) -> EmaPullbackStrategySpec:
    """Rebuild spec from ``RunVariant.strategy_spec`` (``strategy_spec_to_dict`` shape)."""

    root = _require_mapping("strategy_spec", payload)
    stack_raw = _require_mapping("anchor_stack", root["anchor_stack"])
    components_raw = _require_mapping("components", root["components"])
    trade_sides_raw = _require_mapping("trade_sides", root["trade_sides"])
    setup_raw = _require_mapping("setup", root["setup"])

    blockers_raw = components_raw.get("blockers")
    if not isinstance(blockers_raw, (list, tuple)):
        raise StrategySpecReportParseError("components.blockers must be a list")

    trigger_raw = components_raw.get("trigger")
    if not isinstance(trigger_raw, Mapping):
        raise StrategySpecReportParseError("components.trigger must be an object")

    enabled_raw = trade_sides_raw.get("enabled")
    if not isinstance(enabled_raw, (list, tuple)):
        raise StrategySpecReportParseError("trade_sides.enabled must be a list")

    tm_raw = _require_mapping("trade_management", root.get("trade_management"))
    ep_raw = _require_mapping(
        "trade_management.exit_policy",
        tm_raw.get("exit_policy"),
    )
    profiles_raw = _require_mapping("trade_management.exit_policy.profiles", ep_raw.get("profiles"))
    contexts = _parse_report_contexts(root.get("contexts"), ep_raw.get("context"))
    context_consumption = _parse_report_context_consumption(
        ep_raw.get("context_consumption"),
        legacy_context=ep_raw.get("context"),
        has_profile_exits=_report_has_profile_exits(profiles_raw),
    )
    trade_management = TradeManagementSpec(
        exit_policy=ExitPolicySpec(
            always_on=_exit_policy_group(
                _require_mapping("trade_management.exit_policy.always_on", ep_raw.get("always_on")),
                name="trade_management.exit_policy.always_on",
            ),
            profiles=ExitPolicyProfilesSpec(
                aligned=_exit_policy_group(
                    _require_mapping("trade_management.exit_policy.profiles.aligned", profiles_raw.get("aligned")),
                    name="trade_management.exit_policy.profiles.aligned",
                ),
                countertrend=_exit_policy_group(
                    _require_mapping(
                        "trade_management.exit_policy.profiles.countertrend",
                        profiles_raw.get("countertrend"),
                    ),
                    name="trade_management.exit_policy.profiles.countertrend",
                ),
                neutral=_exit_policy_group(
                    _require_mapping("trade_management.exit_policy.profiles.neutral", profiles_raw.get("neutral")),
                    name="trade_management.exit_policy.profiles.neutral",
                ),
            ),
            context_consumption=context_consumption,
        )
    )

    return EmaPullbackStrategySpec(
        variant=str(root["variant"]),
        symbol=str(root["symbol"]),
        base_timeframe=str(root["base_timeframe"]),
        anchor_stack=AnchorStackSpec(
            fast=_required_ema_spec(_require_mapping("fast", stack_raw["fast"])),
            anchor=_required_ema_spec(_require_mapping("anchor", stack_raw["anchor"])),
            slow=_required_ema_spec(_require_mapping("slow", stack_raw["slow"])),
        ),
        components=ComponentStackSpec(
            direction=str(components_raw["direction"]),
            blockers=tuple(_blocker_rule(b) for b in blockers_raw),
            setup=str(components_raw["setup"]),
            trigger=_trigger_spec(trigger_raw),
            risk=str(components_raw["risk"]),
        ),
        trade_sides=TradeSideSpec(enabled=tuple(enabled_raw)),
        setup=UntouchedAnchorSetupSpec(
            lookback=int(setup_raw.get("lookback", 50)),
            active_bars=int(setup_raw.get("active_bars", 3)),
        ),
        trade_management=trade_management,
        contexts=contexts,
    )


def _provider_from_report_mapping(
    context_ref: str,
    provider_raw: Any,
) -> tuple[str, ContextProviderSpec]:
    provider = _require_mapping(f"contexts.{context_ref}", provider_raw)
    return (
        str(context_ref),
        ContextProviderSpec(
            component_id=str(provider["component_id"]),
            timeframe=str(provider["timeframe"]),
            source=str(provider.get("source", "close")),
            fast_period=int(provider["fast_period"]),
            anchor_period=int(provider["anchor_period"]),
            slow_period=int(provider["slow_period"]),
        ),
    )


def _parse_report_contexts(
    contexts_raw: Any,
    legacy_context: Any,
) -> tuple[tuple[str, ContextProviderSpec], ...]:
    if isinstance(contexts_raw, Mapping) and contexts_raw:
        return tuple(
            _provider_from_report_mapping(context_ref, provider_raw)
            for context_ref, provider_raw in contexts_raw.items()
        )
    # Legacy reports: dataclasses.asdict serializes contexts as [(ref, provider_dict), ...].
    if isinstance(contexts_raw, (list, tuple)) and contexts_raw:
        providers: list[tuple[str, ContextProviderSpec]] = []
        for item in contexts_raw:
            if not isinstance(item, (list, tuple)) or len(item) != 2:
                continue
            context_ref, provider_raw = item[0], item[1]
            providers.append(_provider_from_report_mapping(str(context_ref), provider_raw))
        if providers:
            return tuple(providers)
    if isinstance(legacy_context, Mapping):
        return (
            (
                "htf",
                ContextProviderSpec(
                    component_id=str(legacy_context["component_id"]),
                    timeframe=str(legacy_context["timeframe"]),
                    source=str(legacy_context.get("source", "close")),
                    fast_period=int(legacy_context["fast_period"]),
                    anchor_period=int(legacy_context["anchor_period"]),
                    slow_period=int(legacy_context["slow_period"]),
                ),
            ),
        )
    return ()


def _parse_report_context_consumption(
    consumption_raw: Any,
    *,
    legacy_context: Any,
    has_profile_exits: bool,
) -> ContextConsumptionSpec | None:
    if isinstance(consumption_raw, Mapping):
        policy_raw = _require_mapping("context_consumption.policy", consumption_raw.get("policy"))
        return ContextConsumptionSpec(
            context_ref=str(consumption_raw["context_ref"]),
            policy=ContextConsumptionPolicySpec(
                policy_id=str(policy_raw["policy_id"]),
                params=tuple(),
            ),
        )
    if has_profile_exits and isinstance(legacy_context, Mapping):
        from research.strategies.ema_pullback.context.policies import EXIT_PROFILE_BY_HTF_STATE_POLICY

        return ContextConsumptionSpec(
            context_ref="htf",
            policy=ContextConsumptionPolicySpec(policy_id=EXIT_PROFILE_BY_HTF_STATE_POLICY, params=()),
        )
    return None


def _report_has_profile_exits(profiles_raw: Mapping[str, Any]) -> bool:
    for key in ("aligned", "countertrend", "neutral"):
        group = profiles_raw.get(key)
        if not isinstance(group, Mapping):
            continue
        exits = group.get("exits")
        if isinstance(exits, (list, tuple)) and len(exits) > 0:
            return True
    return False
