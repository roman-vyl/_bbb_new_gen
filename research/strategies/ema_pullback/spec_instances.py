"""Factory helpers for ema_pullback StrategySpec."""

from __future__ import annotations

from typing import Sequence

from research.strategies.ema_pullback.component_builders import (
    anchor_stack_from_periods,
    blocker_none,
    component_stack,
    direction_ema_anchor_stack,
    exit_policy,
    exits_atr_default,
    htf_context_config,
    risk_no_filter,
    setup_untouched_anchor,
    trade_management,
    trade_sides,
    trigger_reclaim_anchor,
    untouched_anchor_setup_spec,
)
from research.strategies.ema_pullback.spec import (
    ComponentStackSpec,
    EmaPullbackStrategySpec,
    TradeManagementSpec,
    TradeSide,
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
    variant: str | None = None,
    symbol: str = "BTCUSDT",
    base_timeframe: str = "1h",
    fast_period: int = 100,
    anchor_period: int = 200,
    slow_period: int = 1000,
    anchor_source: str = "close",
    anchor_timeframe: str = "base",
    setup_lookback: int = 50,
    setup_active_bars: int = 3,
    trigger_lookback: int = 1,
    atr_period: int = 14,
    stop_atr_multiplier: float = 1.5,
    take_atr_multiplier: float = 4.0,
    htf_context_timeframe: str = "4h",
    htf_fast_period: int = 100,
    htf_anchor_period: int = 200,
    htf_slow_period: int = 1000,
    enabled_sides: Sequence[TradeSide] = ("long",),
    components: ComponentStackSpec | None = None,
    trade_management_spec: TradeManagementSpec | None = None,
) -> EmaPullbackStrategySpec:
    resolved_components = (
        component_stack(
            direction=direction_ema_anchor_stack(),
            blockers=(blocker_none(),),
            setup=setup_untouched_anchor(),
            trigger=trigger_reclaim_anchor(lookback=trigger_lookback),
            risk=risk_no_filter(),
        )
        if components is None
        else components
    )
    default_sl, default_tp = exits_atr_default(
        atr_period=atr_period,
        stop_atr_multiplier=stop_atr_multiplier,
        take_atr_multiplier=take_atr_multiplier,
    )
    trade_mgmt = (
        trade_management_spec
        if trade_management_spec is not None
        else trade_management(
            exit_policy_spec=exit_policy(
                context=htf_context_config(
                    timeframe=htf_context_timeframe,
                    source="close",
                    fast_period=htf_fast_period,
                    anchor_period=htf_anchor_period,
                    slow_period=htf_slow_period,
                ),
                always_on=(default_sl, default_tp),
                aligned=(),
                countertrend=(),
                neutral=(),
            )
        )
    )

    return EmaPullbackStrategySpec(
        variant=(
            _variant_from_periods(fast_period, anchor_period, slow_period)
            if variant is None
            else variant.strip()
        ),
        symbol=symbol.strip().upper(),
        base_timeframe=base_timeframe.strip(),
        anchor_stack=anchor_stack_from_periods(
            fast=fast_period,
            anchor=anchor_period,
            slow=slow_period,
            timeframe=anchor_timeframe,
            source=anchor_source,
        ),
        components=resolved_components,
        trade_sides=trade_sides(enabled_sides),
        setup=untouched_anchor_setup_spec(
            lookback=setup_lookback,
            active_bars=setup_active_bars,
        ),
        trade_management=trade_mgmt,
    )
