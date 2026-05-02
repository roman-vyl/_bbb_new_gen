from __future__ import annotations

import pytest

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
    strategy_spec_config_id,
)
from research.strategies.ema_pullback.spec_instances import ema_pullback_fast20_anchor200_slow1000_spec


def test_stage10_spec_factory_fields() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    assert spec.variant == "ema_pullback_fast20_anchor200_slow1000"
    assert spec.anchor_stack.fast.period == 20
    assert spec.anchor_stack.anchor.period == 200
    assert spec.anchor_stack.slow.period == 1000
    assert spec.components.direction == "ema_anchor_stack_bullish"
    assert spec.components.setup == "pullback_to_anchor"
    assert spec.components.trigger == "reclaim_anchor"


def test_strategy_spec_config_id_is_deterministic() -> None:
    a = ema_pullback_fast20_anchor200_slow1000_spec()
    b = ema_pullback_fast20_anchor200_slow1000_spec()
    assert strategy_spec_config_id(a) == strategy_spec_config_id(b)


def test_invalid_anchor_stack_order_rejected() -> None:
    with pytest.raises(ValueError, match="fast < anchor < slow"):
        AnchorStackSpec(
            fast=EmaSpec(source="close", timeframe="base", period=20),
            anchor=EmaSpec(source="close", timeframe="base", period=10),
            slow=EmaSpec(source="close", timeframe="base", period=1000),
        )


def test_trade_management_requires_both_distance_rules() -> None:
    with pytest.raises(ValueError, match="take_profit_by_distance"):
        TradeManagementSpec(
            exit_rules=(
                DistanceExitRuleSpec(
                    rule_type="stop_loss_by_distance",
                    distance=AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5),
                ),
            )
        )


def test_strategy_spec_requires_non_empty_identity_fields() -> None:
    with pytest.raises(ValueError, match="variant must be non-empty"):
        EmaPullbackStrategySpec(
            variant="",
            symbol="BTCUSDT",
            base_timeframe="1h",
            anchor_stack=AnchorStackSpec(
                fast=EmaSpec(source="close", timeframe="base", period=20),
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
