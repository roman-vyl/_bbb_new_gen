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
    ExitPolicySpec,
    ExitRuleSpec,
    HtfContextConfigSpec,
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


def _blocker_rule(payload: Mapping[str, Any]) -> BlockerRuleSpec:
    return BlockerRuleSpec(
        instance_id=str(payload["instance_id"]),
        component_id=str(payload["component_id"]),
        rsi=_rsi_spec(payload.get("rsi")),
        lookback=int(payload.get("lookback", 20)),
        long_block_above=payload.get("long_block_above"),
        short_block_below=payload.get("short_block_below"),
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
    ctx_raw = _require_mapping("trade_management.exit_policy.context", ep_raw.get("context"))
    profiles_raw = _require_mapping("trade_management.exit_policy.profiles", ep_raw.get("profiles"))
    trade_management = TradeManagementSpec(
        exit_policy=ExitPolicySpec(
            context=HtfContextConfigSpec(
                component_id=str(ctx_raw["component_id"]),
                timeframe=str(ctx_raw["timeframe"]),
                source=str(ctx_raw["source"]),
                fast_period=int(ctx_raw["fast_period"]),
                anchor_period=int(ctx_raw["anchor_period"]),
                slow_period=int(ctx_raw["slow_period"]),
            ),
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
    )
