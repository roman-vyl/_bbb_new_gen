"""Concrete StrategySpec instances for active ema_pullback runs."""

from __future__ import annotations

from research.strategies.ema_pullback.spec import (
    AnchorStackSpec,
    AtrDistanceSpec,
    ComponentStackSpec,
    DistanceExitRuleSpec,
    EmaPullbackStrategySpec,
    EmaSpec,
    PullbackSetupSpec,
    ReclaimTriggerSpec,
    TradeManagementSpec,
)


def default_ema_pullback_strategy_spec(
    symbol: str = "BTCUSDT",
    base_timeframe: str = "1h",
) -> EmaPullbackStrategySpec:
    """Active Stage-10 default: valid spec with no caller-supplied research parameters."""
    return EmaPullbackStrategySpec(
        variant="ema_pullback_fast100_anchor200_slow1000",
        symbol=symbol.strip().upper(),
        base_timeframe=base_timeframe.strip(),
        anchor_stack=AnchorStackSpec(
            fast=EmaSpec(source="close", timeframe="base", period=100),
            anchor=EmaSpec(source="close", timeframe="base", period=200),
            slow=EmaSpec(source="close", timeframe="base", period=1000),
        ),
        components=ComponentStackSpec(
            direction="ema_anchor_stack_bullish",
            blockers="no_blockers",
            setup="pullback_to_anchor",
            trigger="reclaim_anchor",
            exits="no_signal_exit",
            risk="no_risk_filter",
        ),
        setup=PullbackSetupSpec(lookback=3),
        trigger=ReclaimTriggerSpec(),
        trade_management=TradeManagementSpec(
            exit_rules=(
                DistanceExitRuleSpec(
                    rule_type="stop_loss_by_distance",
                    distance=AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5),
                ),
                DistanceExitRuleSpec(
                    rule_type="take_profit_by_distance",
                    distance=AtrDistanceSpec(timeframe="base", period=14, multiplier=4.0),
                ),
            )
        ),
    )


# Backward-compatible alias (historical name).
ema_pullback_fast20_anchor200_slow1000_spec = default_ema_pullback_strategy_spec


def active_strategy_specs(symbol: str, base_timeframe: str) -> list[EmaPullbackStrategySpec]:
    return [default_ema_pullback_strategy_spec(symbol=symbol, base_timeframe=base_timeframe)]
