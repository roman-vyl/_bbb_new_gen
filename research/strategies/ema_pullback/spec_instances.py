"""Concrete Stage 10 strategy spec instances."""

from __future__ import annotations

from research.strategies.ema_pullback.spec import (
    AnchorStackSpec,
    AtrDistanceSpec,
    DistanceExitRuleSpec,
    EmaPullbackStrategySpec,
    EmaSpec,
    PullbackSetupSpec,
    ReclaimTriggerSpec,
    TradeManagementSpec,
)


def ema_pullback_fast20_anchor200_slow1000_spec(
    symbol: str = "BTCUSDT",
    base_timeframe: str = "1h",
) -> EmaPullbackStrategySpec:
    return EmaPullbackStrategySpec(
        variant="ema_pullback_fast20_anchor200_slow1000",
        symbol=symbol.strip().upper(),
        base_timeframe=base_timeframe.strip(),
        anchor_stack=AnchorStackSpec(
            fast=EmaSpec(source="close", timeframe="base", period=20),
            anchor=EmaSpec(source="close", timeframe="base", period=200),
            slow=EmaSpec(source="close", timeframe="base", period=1000),
        ),
        setup=PullbackSetupSpec(component_id="pullback_to_anchor", lookback=3),
        trigger=ReclaimTriggerSpec(component_id="reclaim_anchor"),
        trade_management=TradeManagementSpec(
            profile="rule_based",
            exit_rules=(
                DistanceExitRuleSpec(
                    rule_type="stop_loss_by_distance",
                    distance=AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5),
                ),
                DistanceExitRuleSpec(
                    rule_type="take_profit_by_distance",
                    distance=AtrDistanceSpec(timeframe="base", period=14, multiplier=4.0),
                ),
            ),
        ),
    )


def active_strategy_specs(symbol: str, base_timeframe: str) -> list[EmaPullbackStrategySpec]:
    return [
        ema_pullback_fast20_anchor200_slow1000_spec(
            symbol=symbol,
            base_timeframe=base_timeframe,
        )
    ]
