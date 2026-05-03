"""Concrete StrategySpec instances for active ema_pullback runs."""

from __future__ import annotations

from research.strategies.ema_pullback.spec import (
    AnchorStackSpec,
    AtrDistanceSpec,
    BlockerRuleSpec,
    ComponentStackSpec,
    DistanceExitRuleSpec,
    EmaPullbackStrategySpec,
    EmaSpec,
    PullbackSetupSpec,
    ReclaimTriggerSpec,
    SignalExitRuleSpec,
    TradeSide,
    TradeSideSpec,
    TradeManagementSpec,
)


def _variant_from_periods(fast_period: int, anchor_period: int, slow_period: int) -> str:
    return (
        f"ema_pullback_fast{fast_period}"
        f"_anchor{anchor_period}"
        f"_slow{slow_period}"
    )


def variant_from_spec(spec: EmaPullbackStrategySpec) -> str:
    stack = spec.anchor_stack
    return _variant_from_periods(
        stack.fast.period,
        stack.anchor.period,
        stack.slow.period,
    )


def make_ema_pullback_strategy_spec(
    *,
    symbol: str = "BTCUSDT",
    base_timeframe: str = "1h",
    fast_period: int = 100,
    anchor_period: int = 200,
    slow_period: int = 1000,
    setup_lookback: int = 3,
    atr_period: int = 14,
    stop_atr_multiplier: float = 1.5,
    take_atr_multiplier: float = 4.0,
    enabled_sides: tuple[TradeSide, ...] = ("long",),
) -> EmaPullbackStrategySpec:
    return EmaPullbackStrategySpec(
        variant=_variant_from_periods(fast_period, anchor_period, slow_period),
        symbol=symbol.strip().upper(),
        base_timeframe=base_timeframe.strip(),
        anchor_stack=AnchorStackSpec(
            fast=EmaSpec(source="close", timeframe="base", period=fast_period),
            anchor=EmaSpec(source="close", timeframe="base", period=anchor_period),
            slow=EmaSpec(source="close", timeframe="base", period=slow_period),
        ),
        components=ComponentStackSpec(
            direction="ema_anchor_stack_bullish",
            blockers=(BlockerRuleSpec(component_id="no_blockers"),),
            setup="pullback_to_anchor",
            trigger=ReclaimTriggerSpec(),
            signal_exits=(SignalExitRuleSpec(component_id="no_signal_exit"),),
            risk="no_risk_filter",
        ),
        trade_sides=TradeSideSpec(enabled=enabled_sides),
        setup=PullbackSetupSpec(lookback=setup_lookback),
        trade_management=TradeManagementSpec(
            exit_rules=(
                DistanceExitRuleSpec(
                    rule_type="stop_loss_by_distance",
                    distance=AtrDistanceSpec(
                        timeframe="base",
                        period=atr_period,
                        multiplier=stop_atr_multiplier,
                    ),
                ),
                DistanceExitRuleSpec(
                    rule_type="take_profit_by_distance",
                    distance=AtrDistanceSpec(
                        timeframe="base",
                        period=atr_period,
                        multiplier=take_atr_multiplier,
                    ),
                ),
            )
        ),
    )


def default_ema_pullback_strategy_spec(
    symbol: str = "BTCUSDT",
    base_timeframe: str = "1h",
) -> EmaPullbackStrategySpec:
    """Active Stage-10 default: valid spec with no caller-supplied research parameters."""
    return make_ema_pullback_strategy_spec(symbol=symbol, base_timeframe=base_timeframe)


def active_strategy_specs(symbol: str, base_timeframe: str) -> list[EmaPullbackStrategySpec]:
    return [default_ema_pullback_strategy_spec(symbol=symbol, base_timeframe=base_timeframe)]
