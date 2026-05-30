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
    EMA_BOUNCE_COUNTER_SETUP_COMPONENT,
    NO_BLOCKERS_COMPONENT,
    NO_RISK_FILTER_COMPONENT,
    NO_SIGNAL_EXIT_COMPONENT,
    UNTOUCHED_ANCHOR_SETUP_COMPONENT,
    RECLAIM_ANCHOR_COMPONENT,
    RSI_LOOKBACK_EXTREME_BLOCKER_COMPONENT,
    EMA_CLOSE_LOSS_EXIT_COMPONENT,
    EMA_CROSS_LOSS_EXIT_COMPONENT,
    RSI_SIGNAL_EXIT_COMPONENT,
    TOUCH_ANCHOR_COMPONENT,
)
from research.strategies.ema_pullback.spec import (
    AnchorStackSpec,
    AtrDistanceSpec,
    BlockerRuleSpec,
    ComponentStackSpec,
    EmaBounceCounterSetupSpec,
    EmaSpec,
    ExitPolicyGroupSpec,
    ExitPolicyProfilesSpec,
    ContextConsumptionPolicySpec,
    ContextConsumptionSpec,
    ContextProviderSpec,
    ExitPolicySpec,
    ExitKind,
    ExitRuleSpec,
    TradeManagementSpec,
    UntouchedAnchorSetupSpec,
    RsiFeatureSpec,
    SetupSpec,
    TradeSide,
    ReclaimTriggerSpec,
    StrongReclaimTriggerSpec,
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


def trigger_reclaim_anchor(*, lookback: int = 1) -> ReclaimTriggerSpec:
    return ReclaimTriggerSpec(lookback=lookback)


def trigger_strong_reclaim_anchor(*, lookback: int = 1) -> StrongReclaimTriggerSpec:
    return StrongReclaimTriggerSpec(lookback=lookback)


def direction_ema_anchor_stack() -> str:
    return EMA_ANCHOR_STACK_TREND_COMPONENT


def setup_untouched_anchor() -> str:
    return UNTOUCHED_ANCHOR_SETUP_COMPONENT


def setup_ema_bounce_counter() -> str:
    return EMA_BOUNCE_COUNTER_SETUP_COMPONENT


def risk_no_filter() -> str:
    return NO_RISK_FILTER_COMPONENT


def blocker_rule(
    component_id: str,
    *,
    instance_id: str,
    rsi: RsiFeatureSpec | None = None,
    lookback: int = 20,
    long_block_above: float | None = None,
    short_block_below: float | None = None,
    context_consumption: ContextConsumptionSpec | None = None,
) -> BlockerRuleSpec:
    return BlockerRuleSpec(
        instance_id=instance_id,
        component_id=component_id,
        rsi=rsi,
        lookback=lookback,
        long_block_above=long_block_above,
        short_block_below=short_block_below,
        context_consumption=context_consumption,
    )


def blocker_none() -> BlockerRuleSpec:
    return blocker_rule(NO_BLOCKERS_COMPONENT, instance_id="no_blockers")


def blocker_counter_candle(
    *,
    instance_id: str = "counter_candle_blocker",
    context_consumption: ContextConsumptionSpec | None = None,
) -> BlockerRuleSpec:
    return blocker_rule(
        COUNTER_CANDLE_BLOCKER_COMPONENT,
        instance_id=instance_id,
        context_consumption=context_consumption,
    )


def blocker_extreme_rsi(
    *,
    instance_id: str,
    timeframe: str = "base",
    period: int = 14,
    lookback: int = 20,
    long_block_above: float = 80.0,
    short_block_below: float = 20.0,
    context_consumption: ContextConsumptionSpec | None = None,
) -> BlockerRuleSpec:
    return blocker_rule(
        RSI_LOOKBACK_EXTREME_BLOCKER_COMPONENT,
        instance_id=instance_id,
        rsi=rsi_feature(timeframe=timeframe, period=period),
        lookback=lookback,
        long_block_above=long_block_above,
        short_block_below=short_block_below,
        context_consumption=context_consumption,
    )


def atr_distance(*, timeframe: str = "base", period: int, multiplier: float) -> AtrDistanceSpec:
    return AtrDistanceSpec(timeframe=timeframe, period=period, multiplier=multiplier)


def exit_rule(
    component_id: str,
    *,
    instance_id: str,
    exit_kind: ExitKind = "signal",
    rsi: RsiFeatureSpec | None = None,
    ema: EmaSpec | None = None,
    fast_ema: EmaSpec | None = None,
    slow_ema: EmaSpec | None = None,
    confirm_bars: int = 1,
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
        ema=ema,
        fast_ema=fast_ema,
        slow_ema=slow_ema,
        confirm_bars=confirm_bars,
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


def exit_ema_close_loss(
    *,
    instance_id: str,
    ema: EmaSpec,
    confirm_bars: int = 1,
) -> ExitRuleSpec:
    return exit_rule(
        EMA_CLOSE_LOSS_EXIT_COMPONENT,
        instance_id=instance_id,
        exit_kind="signal",
        ema=ema,
        confirm_bars=confirm_bars,
    )


def exit_ema_cross_loss(
    *,
    instance_id: str,
    fast_ema: EmaSpec,
    slow_ema: EmaSpec,
    confirm_bars: int = 1,
) -> ExitRuleSpec:
    return exit_rule(
        EMA_CROSS_LOSS_EXIT_COMPONENT,
        instance_id=instance_id,
        exit_kind="signal",
        fast_ema=fast_ema,
        slow_ema=slow_ema,
        confirm_bars=confirm_bars,
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


def context_provider(
    *,
    timeframe: str,
    fast_period: int,
    anchor_period: int,
    slow_period: int,
    source: str = "close",
    component_id: str = "htf_context",
) -> ContextProviderSpec:
    return ContextProviderSpec(
        component_id=component_id,
        timeframe=timeframe,
        source=source,
        fast_period=fast_period,
        anchor_period=anchor_period,
        slow_period=slow_period,
    )


def strategy_contexts(
    providers: Sequence[tuple[str, ContextProviderSpec]],
) -> tuple[tuple[str, ContextProviderSpec], ...]:
    return _normalize_sequence("strategy.contexts", providers)


def context_consumption(
    *,
    context_ref: str,
    policy_id: str,
    params: Sequence[tuple[str, object]] = (),
) -> ContextConsumptionSpec:
    return ContextConsumptionSpec(
        context_ref=context_ref,
        policy=ContextConsumptionPolicySpec(
            policy_id=policy_id,
            params=tuple(params),
        ),
    )


def exit_policy_group(exits: Sequence[ExitRuleSpec]) -> ExitPolicyGroupSpec:
    return ExitPolicyGroupSpec(exits=_normalize_sequence("trade_management.exit_policy.exits", exits))


def exit_policy_profiles(
    *,
    aligned: Sequence[ExitRuleSpec],
    countertrend: Sequence[ExitRuleSpec],
    neutral: Sequence[ExitRuleSpec],
) -> ExitPolicyProfilesSpec:
    return ExitPolicyProfilesSpec(
        aligned=exit_policy_group(aligned),
        countertrend=exit_policy_group(countertrend),
        neutral=exit_policy_group(neutral),
    )


def exit_policy(
    *,
    always_on: Sequence[ExitRuleSpec],
    aligned: Sequence[ExitRuleSpec],
    countertrend: Sequence[ExitRuleSpec],
    neutral: Sequence[ExitRuleSpec],
    context_consumption_spec: ContextConsumptionSpec | None = None,
) -> ExitPolicySpec:
    return ExitPolicySpec(
        always_on=exit_policy_group(always_on),
        profiles=exit_policy_profiles(
            aligned=aligned,
            countertrend=countertrend,
            neutral=neutral,
        ),
        context_consumption=context_consumption_spec,
    )


def trade_management(*, exit_policy_spec: ExitPolicySpec) -> TradeManagementSpec:
    return TradeManagementSpec(exit_policy=exit_policy_spec)


def _normalize_sequence(name: str, values: Sequence[T]) -> tuple[T, ...]:
    if isinstance(values, (str, bytes)):
        raise TypeError(f"{name} must be a sequence of typed values, not str/bytes")
    return tuple(values)


def trade_sides(enabled: Sequence[TradeSide] = ("long",)) -> TradeSideSpec:
    return TradeSideSpec(enabled=_normalize_sequence("trade_sides.enabled", enabled))


def untouched_anchor_setup_spec(
    *, lookback: int = 50, active_bars: int = 3
) -> UntouchedAnchorSetupSpec:
    return UntouchedAnchorSetupSpec(lookback=lookback, active_bars=active_bars)


def ema_bounce_counter_setup_spec(
    *,
    fast_ema: int | EmaSpec = 50,
    anchor_ema: int | EmaSpec = 200,
    slow_ema: int | EmaSpec = 500,
    max_bounces: int = 3,
    raw_touch_mode: str = "range_cross",
    touch_lookback_bars: int = 10,
    trend_start_confirmation_bars: int = 1,
    trend_break_confirmation_bars: int = 1,
) -> EmaBounceCounterSetupSpec:
    def coerce(value: int | EmaSpec) -> EmaSpec:
        if isinstance(value, EmaSpec):
            return value
        return ema(int(value), timeframe="base", source="close")

    return EmaBounceCounterSetupSpec(
        fast_ema=coerce(fast_ema),
        anchor_ema=coerce(anchor_ema),
        slow_ema=coerce(slow_ema),
        max_bounces=max_bounces,
        raw_touch_mode=raw_touch_mode,
        touch_lookback_bars=touch_lookback_bars,
        trend_start_confirmation_bars=trend_start_confirmation_bars,
        trend_break_confirmation_bars=trend_break_confirmation_bars,
    )


def setup_rule(
    *,
    instance_id: str,
    component_id: str,
    params: SetupSpec,
) -> SetupRuleSpec:
    from research.strategies.ema_pullback.spec import SetupRuleSpec

    return SetupRuleSpec(
        instance_id=instance_id,
        component_id=component_id,
        params=params,
    )


def default_setups(
    *,
    lookback: int = 50,
    active_bars: int = 3,
) -> tuple[SetupRuleSpec, ...]:
    from research.strategies.ema_pullback.spec import SetupRuleSpec

    return (
        SetupRuleSpec(
            instance_id="setup",
            component_id=setup_untouched_anchor(),
            params=untouched_anchor_setup_spec(lookback=lookback, active_bars=active_bars),
        ),
    )


def component_stack(
    *,
    direction: str | None = None,
    blockers: Sequence[BlockerRuleSpec] | None = None,
    trigger: TriggerSpec | None = None,
    risk: str | None = None,
) -> ComponentStackSpec:
    if blockers is None:
        normalized_blockers = (blocker_none(),)
    else:
        normalized_blockers = _normalize_sequence("components.blockers", blockers)

    return ComponentStackSpec(
        direction=direction_ema_anchor_stack() if direction is None else direction,
        blockers=normalized_blockers,
        trigger=trigger_reclaim_anchor() if trigger is None else trigger,
        risk=risk_no_filter() if risk is None else risk,
    )

