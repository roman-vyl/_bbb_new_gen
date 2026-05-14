"""Factory helpers for ema_pullback StrategySpec."""

from __future__ import annotations

from typing import Sequence

from research.strategies.ema_pullback.component_builders import (
    anchor_stack_from_periods,
    blocker_none,
    component_stack,
    direction_ema_anchor_stack,
    exits_atr_default,
    pullback_setup,
    risk_no_filter,
    setup_pullback_to_anchor,
    trade_sides,
    trigger_reclaim_anchor,
)
from research.strategies.ema_pullback.spec import (
    ComponentStackSpec,
    EmaPullbackStrategySpec,
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
    setup_lookback: int = 3,
    atr_period: int = 14,
    stop_atr_multiplier: float = 1.5,
    take_atr_multiplier: float = 4.0,
    enabled_sides: Sequence[TradeSide] = ("long",),
    components: ComponentStackSpec | None = None,
) -> EmaPullbackStrategySpec:
    resolved_components = (
        component_stack(
            direction=direction_ema_anchor_stack(),
            blockers=(blocker_none(),),
            setup=setup_pullback_to_anchor(),
            trigger=trigger_reclaim_anchor(),
            exits=exits_atr_default(
                atr_period=atr_period,
                stop_atr_multiplier=stop_atr_multiplier,
                take_atr_multiplier=take_atr_multiplier,
            ),
            risk=risk_no_filter(),
        )
        if components is None
        else components
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
        setup=pullback_setup(lookback=setup_lookback),
    )
