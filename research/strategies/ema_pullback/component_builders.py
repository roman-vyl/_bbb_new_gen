"""Typed builders for ema_pullback StrategySpec components."""

from __future__ import annotations

from typing import Sequence, TypeVar
T = TypeVar("T")



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
    RSI_EXTREME_BLOCKER_COMPONENT,
    RSI_SIGNAL_EXIT_COMPONENT,
    TOUCH_ANCHOR_COMPONENT,
)
from research.strategies.ema_pullback.spec import (
    AnchorStackSpec,
    AtrDistanceSpec,
    BlockerRuleSpec,
    ComponentStackSpec,
    EmaSpec,
    ExitKind,
    ExitRuleSpec,
    PullbackSetupSpec,
    RsiFeatureSpec,
    TradeSide,
    TradeSideSpec,
    TriggerSpec,
)


def ema(period: int, *, timeframe: str = "base", source: str = "close") -> EmaSpec:
    return EmaSpec(source=source, timeframe=timeframe, period=period)


def anchor_stack(*, fast: EmaSpec, anchor: EmaSpec, slow: EmaSpec) -> AnchorStackSpec:
    return AnchorStackSpec(fast=fast, anchor=anchor, slow=slow)


def anchor_stack_from_periods(
    *,
    fast: int,
    anchor: int,
    slow: int,
    timeframe: str = "base",
    source: str = "close",
) -> AnchorStackSpec:
    return anchor_stack(
        fast=ema(fast, timeframe=timeframe, source=source),
        anchor=ema(anchor, timeframe=timeframe, source=source),
        slow=ema(slow, timeframe=timeframe, source=source),
    )


def rsi_feature(*, timeframe: str = "base", period: int = 14) -> RsiFeatureSpec:
    return RsiFeatureSpec(timeframe=timeframe, period=period)


def trigger(component_id: str) -> TriggerSpec:
    return TriggerSpec(component_id=component_id)


def trigger_touch_anchor() -> TriggerSpec:
    return trigger(TOUCH_ANCHOR_COMPONENT)


def trigger_reclaim_anchor() -> TriggerSpec:
    return trigger(RECLAIM_ANCHOR_COMPONENT)


def direction_ema_anchor_stack() -> str:
    return EMA_ANCHOR_STACK_TREND_COMPONENT


def setup_pullback_to_anchor() -> str:
    return PULLBACK_TO_ANCHOR_COMPONENT


def risk_no_filter() -> str:
    return NO_RISK_FILTER_COMPONENT


def blocker_rule(
    component_id: str,
    *,
    instance_id: str,
    rsi: RsiFeatureSpec | None = None,
    lookback: int = 1,
    long_min: float | None = None,
    short_max: float | None = None,
) -> BlockerRuleSpec:
    return BlockerRuleSpec(
        instance_id=instance_id,
        component_id=component_id,
        rsi=rsi,
        lookback=lookback,
        long_min=long_min,
        short_max=short_max,
    )


def blocker_none() -> BlockerRuleSpec:
    return blocker_rule(NO_BLOCKERS_COMPONENT, instance_id="no_blockers")


def blocker_counter_candle(*, instance_id: str = "counter_candle_blocker") -> BlockerRuleSpec:
    return blocker_rule(COUNTER_CANDLE_BLOCKER_COMPONENT, instance_id=instance_id)


def blocker_extreme_rsi(
    *,
    instance_id: str,
    timeframe: str = "base",
    period: int = 14,
    lookback: int = 1,
    long_min: float = 30.0,
    short_max: float = 70.0,
) -> BlockerRuleSpec:
    return blocker_rule(
        RSI_EXTREME_BLOCKER_COMPONENT,
        instance_id=instance_id,
        rsi=rsi_feature(timeframe=timeframe, period=period),
        lookback=lookback,
        long_min=long_min,
        short_max=short_max,
    )


def atr_distance(*, timeframe: str = "base", period: int, multiplier: float) -> AtrDistanceSpec:
    return AtrDistanceSpec(timeframe=timeframe, period=period, multiplier=multiplier)


def exit_rule(
    component_id: str,
    *,
    instance_id: str,
    exit_kind: ExitKind = "signal",
    rsi: RsiFeatureSpec | None = None,
    long_exit_above: float | None = None,
    short_exit_below: float | None = None,
    distance: AtrDistanceSpec | None = None,
    usd_distance: float | None = None,
) -> ExitRuleSpec:
    return ExitRuleSpec(
        instance_id=instance_id,
        component_id=component_id,
        exit_kind=exit_kind,
        rsi=rsi,
        long_exit_above=long_exit_above,
        short_exit_below=short_exit_below,
        distance=distance,
        usd_distance=usd_distance,
    )


def exit_no_signal() -> ExitRuleSpec:
    return exit_rule(NO_SIGNAL_EXIT_COMPONENT, instance_id="no_signal_exit", exit_kind="signal")


def exit_rsi(
    *,
    instance_id: str,
    timeframe: str = "base",
    period: int = 14,
    long_exit_above: float = 70.0,
    short_exit_below: float = 30.0,
) -> ExitRuleSpec:
    return exit_rule(
        RSI_SIGNAL_EXIT_COMPONENT,
        instance_id=instance_id,
        exit_kind="signal",
        rsi=rsi_feature(timeframe=timeframe, period=period),
        long_exit_above=long_exit_above,
        short_exit_below=short_exit_below,
    )


def exit_atr_stop_loss(
    *,
    atr_period: int,
    atr_multiplier: float,
    instance_id: str = "atr_stop_loss",
    timeframe: str = "base",
) -> ExitRuleSpec:
    return exit_rule(
        ATR_STOP_LOSS_COMPONENT,
        instance_id=instance_id,
        exit_kind="stop_loss",
        distance=atr_distance(timeframe=timeframe, period=atr_period, multiplier=atr_multiplier),
    )


def exit_atr_take_profit(
    *,
    atr_period: int,
    atr_multiplier: float,
    instance_id: str = "atr_take_profit",
    timeframe: str = "base",
) -> ExitRuleSpec:
    return exit_rule(
        ATR_TAKE_PROFIT_COMPONENT,
        instance_id=instance_id,
        exit_kind="take_profit",
        distance=atr_distance(timeframe=timeframe, period=atr_period, multiplier=atr_multiplier),
    )


def exit_constant_usd_stop_loss(
    *,
    usd_distance: float,
    instance_id: str = "constant_usd_stop_loss",
) -> ExitRuleSpec:
    return exit_rule(
        CONSTANT_USD_STOP_LOSS_COMPONENT,
        instance_id=instance_id,
        exit_kind="stop_loss",
        usd_distance=float(usd_distance),
    )


def exit_constant_usd_take_profit(
    *,
    usd_distance: float,
    instance_id: str = "constant_usd_take_profit",
) -> ExitRuleSpec:
    return exit_rule(
        CONSTANT_USD_TAKE_PROFIT_COMPONENT,
        instance_id=instance_id,
        exit_kind="take_profit",
        usd_distance=float(usd_distance),
    )


def exits_atr_default(
    *,
    atr_period: int,
    stop_atr_multiplier: float,
    take_atr_multiplier: float,
) -> tuple[ExitRuleSpec, ExitRuleSpec]:
    return (
        exit_atr_stop_loss(atr_period=atr_period, atr_multiplier=stop_atr_multiplier),
        exit_atr_take_profit(atr_period=atr_period, atr_multiplier=take_atr_multiplier),
    )


def _normalize_sequence(name: str, values: Sequence[T]) -> tuple[T, ...]:
    if isinstance(values, (str, bytes)):
        raise TypeError(f"{name} must be a sequence of typed values, not str/bytes")
    return tuple(values)


def trade_sides(enabled: Sequence[TradeSide] = ("long",)) -> TradeSideSpec:
    return TradeSideSpec(enabled=_normalize_sequence("trade_sides.enabled", enabled))


def pullback_setup(*, lookback: int = 3) -> PullbackSetupSpec:
    return PullbackSetupSpec(lookback=lookback)


def component_stack(
    *,
    direction: str | None = None,
    blockers: Sequence[BlockerRuleSpec] | None = None,
    setup: str | None = None,
    trigger: TriggerSpec | None = None,
    exits: Sequence[ExitRuleSpec] | None = None,
    risk: str | None = None,
) -> ComponentStackSpec:
    if blockers is None:
        normalized_blockers = (blocker_none(),)
    else:
        normalized_blockers = _normalize_sequence("components.blockers", blockers)

    if exits is None:
        normalized_exits = exits_atr_default(
            atr_period=14,
            stop_atr_multiplier=1.5,
            take_atr_multiplier=4.0,
        )
    else:
        normalized_exits = _normalize_sequence("components.exits", exits)

    return ComponentStackSpec(
        direction=direction_ema_anchor_stack() if direction is None else direction,
        blockers=normalized_blockers,
        setup=setup_pullback_to_anchor() if setup is None else setup,
        trigger=trigger_reclaim_anchor() if trigger is None else trigger,
        exits=normalized_exits,
        risk=risk_no_filter() if risk is None else risk,
    )

