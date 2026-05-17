"""Family-local parser for external ema_pullback strategy instances."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from research.strategies.ema_pullback import component_builders as builders
from research.strategies.ema_pullback.components.registry import (
    ATR_STOP_LOSS_COMPONENT,
    ATR_TAKE_PROFIT_COMPONENT,
    CONSTANT_USD_STOP_LOSS_COMPONENT,
    CONSTANT_USD_TAKE_PROFIT_COMPONENT,
    COUNTER_CANDLE_BLOCKER_COMPONENT,
    EMA_ANCHOR_STACK_TREND_COMPONENT,
    NO_BLOCKERS_COMPONENT,
    NO_RISK_FILTER_COMPONENT,
    NO_SIGNAL_EXIT_COMPONENT,
    PULLBACK_TO_ANCHOR_COMPONENT,
    RECLAIM_ANCHOR_COMPONENT,
    RSI_LOOKBACK_EXTREME_BLOCKER_COMPONENT,
    RSI_SIGNAL_EXIT_COMPONENT,
    TOUCH_ANCHOR_COMPONENT,
    resolve_component,
)
from research.strategies.ema_pullback.spec import (
    BlockerRuleSpec,
    EmaPullbackStrategySpec,
    ExitRuleSpec,
    TradeSide,
    strategy_spec_config_id,
)
from research.strategies.ema_pullback.spec_instances import (
    make_ema_pullback_strategy_spec,
)


class EmaPullbackInstanceValidationError(ValueError):
    """Raised when a single ema_pullback instance is invalid."""


@dataclass(frozen=True)
class LoadedEmaPullbackInstance:
    spec: EmaPullbackStrategySpec
    strategy_spec_config_id: str


_INSTANCE_FIELDS = frozenset(
    {
        "instance_id",
        "variant",
        "market",
        "strategy",
    }
)

_STRATEGY_FIELDS = frozenset(
    {
        "trade_sides",
        "anchor_stack",
        "direction",
        "setup",
        "trigger",
        "blockers",
        "risk",
        "exits",
    }
)


def load_ema_pullback_config_entry(instance: Mapping[str, Any]) -> LoadedEmaPullbackInstance:
    spec = load_ema_pullback_instance(instance)
    return LoadedEmaPullbackInstance(
        spec=spec,
        strategy_spec_config_id=strategy_spec_config_id(spec),
    )


def load_ema_pullback_instance(instance: Mapping[str, Any]) -> EmaPullbackStrategySpec:
    payload = _require_mapping("ema_pullback instance", instance)
    _reject_unknown_fields("ema_pullback instance", payload, _INSTANCE_FIELDS)
    for key in _INSTANCE_FIELDS - {"variant"}:
        _require_present(payload, key)

    instance_id = _require_non_empty_str(payload, "instance_id")
    if "external_config_id" in payload:
        raise EmaPullbackInstanceValidationError("external_config_id is not supported; use instance_id")

    market = _parse_market(payload["market"])
    strategy = _parse_strategy(payload["strategy"])
    periods = _parse_anchor_stack(strategy["anchor_stack"])
    direction = _parse_direction(strategy["direction"])
    setup_component, setup_lookback = _parse_setup(strategy["setup"])
    trigger = _parse_trigger(strategy["trigger"])
    blockers = _parse_blockers(strategy["blockers"])
    risk = _parse_risk(strategy["risk"])
    exits = _parse_exits(strategy["exits"])

    components = builders.component_stack(
        direction=direction,
        blockers=blockers,
        setup=setup_component,
        trigger=trigger,
        exits=exits,
        risk=risk,
    )
    variant = _optional_non_empty_str(payload, "variant", default="")
    spec = make_ema_pullback_strategy_spec(
        variant=variant if variant else None,
        symbol=market["symbol"],
        base_timeframe=market["base_timeframe"],
        fast_period=periods["fast"],
        anchor_period=periods["anchor"],
        slow_period=periods["slow"],
        anchor_source=periods["source"],
        anchor_timeframe=periods["timeframe"],
        setup_lookback=setup_lookback,
        enabled_sides=_parse_trade_sides(strategy["trade_sides"]),
        components=components,
    )
    return spec


def _parse_market(value: Any) -> dict[str, str]:
    payload = _require_mapping("market", value)
    _reject_unknown_fields("market", payload, {"symbol", "base_timeframe"})
    return {
        "symbol": _require_non_empty_str(payload, "symbol").upper(),
        "base_timeframe": _require_non_empty_str(payload, "base_timeframe"),
    }


def _parse_strategy(value: Any) -> Mapping[str, Any]:
    payload = _require_mapping("strategy", value)
    _reject_unknown_fields("strategy", payload, _STRATEGY_FIELDS)
    for key in _STRATEGY_FIELDS:
        _require_present(payload, key)
    return payload


def _parse_trade_sides(value: Any) -> tuple[TradeSide, ...]:
    trade_sides_value = value
    if isinstance(trade_sides_value, Mapping):
        if "enabled" in trade_sides_value:
            _reject_unknown_fields("strategy.trade_sides", trade_sides_value, {"enabled"})
            trade_sides_value = _require_present(trade_sides_value, "enabled")
        else:
            _reject_unknown_fields("strategy.trade_sides", trade_sides_value, {"long", "short"})
            return _parse_trade_side_flags(trade_sides_value)
    if not isinstance(trade_sides_value, Sequence) or isinstance(trade_sides_value, (str, bytes)):
        raise EmaPullbackInstanceValidationError("strategy.trade_sides must be a list")
    return builders.trade_sides(tuple(trade_sides_value)).enabled


def _parse_trade_side_flags(payload: Mapping[str, Any]) -> tuple[TradeSide, ...]:
    enabled: list[TradeSide] = []
    for side in ("long", "short"):
        value = payload.get(side, False)
        if not isinstance(value, bool):
            raise EmaPullbackInstanceValidationError(f"strategy.trade_sides.{side} must be a boolean")
        if value:
            enabled.append(side)
    return builders.trade_sides(tuple(enabled)).enabled


def _parse_anchor_stack(value: Any) -> dict[str, Any]:
    payload = _require_mapping("anchor_stack", value)
    _reject_unknown_fields("anchor_stack", payload, {"source", "timeframe", "fast", "anchor", "slow"})
    return {
        "source": _optional_non_empty_str(payload, "source", default="close"),
        "timeframe": _optional_non_empty_str(payload, "timeframe", default="base"),
        "fast": _require_positive_int(payload, "fast"),
        "anchor": _require_positive_int(payload, "anchor"),
        "slow": _require_positive_int(payload, "slow"),
    }


def _parse_direction(value: Any) -> str:
    component_id = _parse_component_id("direction", value)
    _assert_known_component("direction", component_id)
    if component_id != EMA_ANCHOR_STACK_TREND_COMPONENT:
        raise EmaPullbackInstanceValidationError(f"unsupported direction component_id {component_id!r}")
    return builders.direction_ema_anchor_stack()


def _parse_setup(value: Any) -> tuple[str, int]:
    payload = _component_mapping("setup", value, extra_fields={"lookback"})
    component_id = _require_non_empty_str(payload, "component_id")
    _assert_known_component("setup", component_id)
    if component_id != PULLBACK_TO_ANCHOR_COMPONENT:
        raise EmaPullbackInstanceValidationError(f"unsupported setup component_id {component_id!r}")
    lookback = _optional_positive_int(payload, "lookback", default=3)
    return builders.setup_pullback_to_anchor(), builders.pullback_setup(lookback=lookback).lookback


def _parse_trigger(value: Any) -> Any:
    component_id = _parse_component_id("trigger", value)
    _assert_known_component("trigger", component_id)
    if component_id not in {RECLAIM_ANCHOR_COMPONENT, TOUCH_ANCHOR_COMPONENT}:
        raise EmaPullbackInstanceValidationError(f"unsupported trigger component_id {component_id!r}")
    return builders.trigger(component_id)


def _parse_blockers(value: Any) -> tuple[BlockerRuleSpec, ...]:
    if not isinstance(value, list) or not value:
        raise EmaPullbackInstanceValidationError("blockers must be a non-empty list")
    return tuple(_parse_blocker(index, item) for index, item in enumerate(value))


def _parse_blocker(index: int, value: Any) -> BlockerRuleSpec:
    payload = _require_mapping(f"blockers[{index}]", value)
    component_id = _require_non_empty_str(payload, "component_id")
    _assert_known_component("blockers", component_id)
    instance_id = _require_non_empty_str(payload, "instance_id")
    common = {"instance_id", "component_id"}
    if component_id == NO_BLOCKERS_COMPONENT:
        _reject_unknown_fields(f"blockers[{index}]", payload, common)
        return builders.blocker_rule(NO_BLOCKERS_COMPONENT, instance_id=instance_id)
    if component_id == COUNTER_CANDLE_BLOCKER_COMPONENT:
        _reject_unknown_fields(f"blockers[{index}]", payload, common)
        return builders.blocker_counter_candle(instance_id=instance_id)
    if component_id == RSI_LOOKBACK_EXTREME_BLOCKER_COMPONENT:
        allowed = common | {
            "rsi",
            "timeframe",
            "period",
            "lookback",
            "long_block_above",
            "short_block_below",
        }
        _reject_unknown_fields(f"blockers[{index}]", payload, allowed)
        rsi = _parse_rsi_payload(payload)
        return builders.blocker_extreme_rsi(
            instance_id=instance_id,
            timeframe=rsi["timeframe"],
            period=rsi["period"],
            lookback=_optional_positive_int(payload, "lookback", default=20),
            long_block_above=_optional_number(payload, "long_block_above", default=80.0),
            short_block_below=_optional_number(payload, "short_block_below", default=20.0),
        )
    raise EmaPullbackInstanceValidationError(f"unsupported blocker component_id {component_id!r}")


def _parse_risk(value: Any) -> str:
    component_id = _parse_component_id("risk", value)
    _assert_known_component("risk", component_id)
    if component_id != NO_RISK_FILTER_COMPONENT:
        raise EmaPullbackInstanceValidationError(f"unsupported risk component_id {component_id!r}")
    return builders.risk_no_filter()


def _parse_exits(value: Any) -> tuple[ExitRuleSpec, ...]:
    if not isinstance(value, list) or not value:
        raise EmaPullbackInstanceValidationError("exits must be a non-empty list")
    return tuple(_parse_exit(index, item) for index, item in enumerate(value))


def _parse_exit(index: int, value: Any) -> ExitRuleSpec:
    payload = _require_mapping(f"exits[{index}]", value)
    component_id = _require_non_empty_str(payload, "component_id")
    _assert_known_component("exits", component_id)
    instance_id = _require_non_empty_str(payload, "instance_id")
    common = {"instance_id", "component_id"}
    if component_id == NO_SIGNAL_EXIT_COMPONENT:
        _reject_unknown_fields(f"exits[{index}]", payload, common)
        return builders.exit_rule(NO_SIGNAL_EXIT_COMPONENT, instance_id=instance_id, exit_kind="signal")
    if component_id == RSI_SIGNAL_EXIT_COMPONENT:
        allowed = common | {"rsi", "timeframe", "period", "long_exit_above", "short_exit_below"}
        _reject_unknown_fields(f"exits[{index}]", payload, allowed)
        rsi = _parse_rsi_payload(payload)
        return builders.exit_rsi(
            instance_id=instance_id,
            timeframe=rsi["timeframe"],
            period=rsi["period"],
            long_exit_above=_optional_number(payload, "long_exit_above", default=70.0),
            short_exit_below=_optional_number(payload, "short_exit_below", default=30.0),
        )
    if component_id in {ATR_STOP_LOSS_COMPONENT, ATR_TAKE_PROFIT_COMPONENT}:
        allowed = common | {"distance", "timeframe", "period", "multiplier"}
        _reject_unknown_fields(f"exits[{index}]", payload, allowed)
        distance = _parse_distance_payload(payload)
        if component_id == ATR_STOP_LOSS_COMPONENT:
            return builders.exit_atr_stop_loss(
                instance_id=instance_id,
                timeframe=distance["timeframe"],
                atr_period=distance["period"],
                atr_multiplier=distance["multiplier"],
            )
        return builders.exit_atr_take_profit(
            instance_id=instance_id,
            timeframe=distance["timeframe"],
            atr_period=distance["period"],
            atr_multiplier=distance["multiplier"],
        )
    if component_id in {CONSTANT_USD_STOP_LOSS_COMPONENT, CONSTANT_USD_TAKE_PROFIT_COMPONENT}:
        allowed = common | {"usd_distance"}
        _reject_unknown_fields(f"exits[{index}]", payload, allowed)
        usd_distance = _require_positive_number(payload, "usd_distance")
        if component_id == CONSTANT_USD_STOP_LOSS_COMPONENT:
            return builders.exit_constant_usd_stop_loss(instance_id=instance_id, usd_distance=usd_distance)
        return builders.exit_constant_usd_take_profit(instance_id=instance_id, usd_distance=usd_distance)
    raise EmaPullbackInstanceValidationError(f"unsupported exit component_id {component_id!r}")


def _parse_rsi_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    nested = payload.get("rsi")
    if nested is not None:
        rsi = _require_mapping("rsi", nested)
        _reject_unknown_fields("rsi", rsi, {"timeframe", "period"})
        return {
            "timeframe": _optional_non_empty_str(rsi, "timeframe", default="base"),
            "period": _optional_positive_int(rsi, "period", default=14),
        }
    return {
        "timeframe": _optional_non_empty_str(payload, "timeframe", default="base"),
        "period": _optional_positive_int(payload, "period", default=14),
    }


def _parse_distance_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    nested = payload.get("distance")
    if nested is not None:
        distance = _require_mapping("distance", nested)
        _reject_unknown_fields("distance", distance, {"timeframe", "period", "multiplier"})
        return {
            "timeframe": _optional_non_empty_str(distance, "timeframe", default="base"),
            "period": _require_positive_int(distance, "period"),
            "multiplier": _require_positive_number(distance, "multiplier"),
        }
    return {
        "timeframe": _optional_non_empty_str(payload, "timeframe", default="base"),
        "period": _require_positive_int(payload, "period"),
        "multiplier": _require_positive_number(payload, "multiplier"),
    }


def _parse_component_id(name: str, value: Any) -> str:
    if isinstance(value, str):
        if not value.strip():
            raise EmaPullbackInstanceValidationError(f"{name} component_id must be non-empty")
        return value.strip()
    payload = _component_mapping(name, value)
    return _require_non_empty_str(payload, "component_id")


def _component_mapping(
    name: str,
    value: Any,
    *,
    extra_fields: set[str] | None = None,
) -> Mapping[str, Any]:
    payload = _require_mapping(name, value)
    _reject_unknown_fields(name, payload, {"component_id"} | (extra_fields or set()))
    return payload


def _assert_known_component(role: str, component_id: str) -> None:
    try:
        resolve_component(role, component_id)
    except ValueError as exc:
        raise EmaPullbackInstanceValidationError(str(exc)) from exc


def _reject_unknown_fields(name: str, payload: Mapping[str, Any], allowed: set[str] | frozenset[str]) -> None:
    unknown = sorted(set(payload) - set(allowed))
    if unknown:
        raise EmaPullbackInstanceValidationError(f"{name} has unknown field(s): {', '.join(unknown)}")


def _require_mapping(name: str, value: Any) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise EmaPullbackInstanceValidationError(f"{name} must be an object")
    return value


def _require_present(payload: Mapping[str, Any], key: str) -> Any:
    if key not in payload:
        raise EmaPullbackInstanceValidationError(f"{key} is required")
    return payload[key]


def _require_non_empty_str(payload: Mapping[str, Any], key: str) -> str:
    value = _require_present(payload, key)
    if not isinstance(value, str) or not value.strip():
        raise EmaPullbackInstanceValidationError(f"{key} must be a non-empty string")
    return value.strip()


def _optional_non_empty_str(payload: Mapping[str, Any], key: str, *, default: str) -> str:
    if key not in payload:
        return default
    return _require_non_empty_str(payload, key)


def _require_positive_int(payload: Mapping[str, Any], key: str) -> int:
    value = _require_present(payload, key)
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise EmaPullbackInstanceValidationError(f"{key} must be a positive integer")
    return value


def _optional_positive_int(payload: Mapping[str, Any], key: str, *, default: int) -> int:
    if key not in payload:
        return default
    return _require_positive_int(payload, key)


def _require_positive_number(payload: Mapping[str, Any], key: str) -> float:
    value = _require_present(payload, key)
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
        raise EmaPullbackInstanceValidationError(f"{key} must be a positive number")
    return float(value)


def _optional_number(payload: Mapping[str, Any], key: str, *, default: float) -> float:
    if key not in payload:
        return default
    value = payload[key]
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise EmaPullbackInstanceValidationError(f"{key} must be a number")
    return float(value)

