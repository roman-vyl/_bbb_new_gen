"""Deserialize ``EmaPullbackStrategySpec`` from report JSON (``asdict`` payload)."""

from __future__ import annotations

from typing import Any, Mapping

from research.strategies.ema_pullback.components.registry import RECLAIM_ANCHOR_COMPONENT
from research.strategies.ema_pullback.spec import (
    AnchorStackSpec,
    AtrDistanceSpec,
    BlockerRuleSpec,
    ComponentStackSpec,
    EmaPullbackStrategySpec,
    EmaSpec,
    ExitRuleSpec,
    ReclaimTriggerSpec,
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


def _ema_spec(payload: Mapping[str, Any]) -> EmaSpec:
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


def _exit_rule(payload: Mapping[str, Any]) -> ExitRuleSpec:
    return ExitRuleSpec(
        instance_id=str(payload["instance_id"]),
        component_id=str(payload["component_id"]),
        exit_kind=str(payload.get("exit_kind", "signal")),
        rsi=_rsi_spec(payload.get("rsi")),
        long_exit_above=payload.get("long_exit_above"),
        short_exit_below=payload.get("short_exit_below"),
        distance=_atr_distance(payload.get("distance")),
        usd_distance=payload.get("usd_distance"),
    )


def _trigger_spec(payload: Mapping[str, Any]) -> TriggerSpec | ReclaimTriggerSpec:
    component_id = str(payload["component_id"])
    if component_id == RECLAIM_ANCHOR_COMPONENT:
        return ReclaimTriggerSpec(lookback=int(payload.get("lookback", 1)))
    return TriggerSpec(component_id=component_id)


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
    exits_raw = components_raw.get("exits")
    if not isinstance(exits_raw, (list, tuple)):
        raise StrategySpecReportParseError("components.exits must be a list")

    trigger_raw = components_raw.get("trigger")
    if not isinstance(trigger_raw, Mapping):
        raise StrategySpecReportParseError("components.trigger must be an object")

    enabled_raw = trade_sides_raw.get("enabled")
    if not isinstance(enabled_raw, (list, tuple)):
        raise StrategySpecReportParseError("trade_sides.enabled must be a list")

    tm_raw = root.get("trade_management")
    trade_management = (
        TradeManagementSpec(profile=str(tm_raw.get("profile", "reserved")))
        if isinstance(tm_raw, Mapping)
        else TradeManagementSpec()
    )

    return EmaPullbackStrategySpec(
        variant=str(root["variant"]),
        symbol=str(root["symbol"]),
        base_timeframe=str(root["base_timeframe"]),
        anchor_stack=AnchorStackSpec(
            fast=_ema_spec(_require_mapping("fast", stack_raw["fast"])),
            anchor=_ema_spec(_require_mapping("anchor", stack_raw["anchor"])),
            slow=_ema_spec(_require_mapping("slow", stack_raw["slow"])),
        ),
        components=ComponentStackSpec(
            direction=str(components_raw["direction"]),
            blockers=tuple(_blocker_rule(b) for b in blockers_raw),
            setup=str(components_raw["setup"]),
            trigger=_trigger_spec(trigger_raw),
            exits=tuple(_exit_rule(e) for e in exits_raw),
            risk=str(components_raw["risk"]),
        ),
        trade_sides=TradeSideSpec(enabled=tuple(enabled_raw)),
        setup=UntouchedAnchorSetupSpec(
            lookback=int(setup_raw.get("lookback", 50)),
            active_bars=int(setup_raw.get("active_bars", 3)),
        ),
        trade_management=trade_management,
    )
