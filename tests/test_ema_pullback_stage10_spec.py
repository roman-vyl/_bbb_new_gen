from __future__ import annotations

import pytest

from research.strategies.ema_pullback.spec import (
    AtrDistanceSpec,
    DistanceExitRuleSpec,
    EmaPullbackStrategySpec,
    EmaSpec,
    PullbackSetupSpec,
    ReclaimTriggerSpec,
    TradeManagementSpec,
)
from research.strategies.ema_pullback.spec_instances import (
    active_strategy_specs,
    ema_pullback_fast20_anchor200_slow1000_spec,
)


def test_valid_spec_creates() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    assert spec.variant == "ema_pullback_fast20_anchor200_slow1000"
    assert spec.anchor_stack.fast.period == 20
    assert spec.anchor_stack.anchor.period == 200
    assert spec.anchor_stack.slow.period == 1000


def test_non_base_timeframe_fails() -> None:
    with pytest.raises(ValueError, match="timeframe"):
        EmaSpec(source="close", timeframe="4h", period=20)


def test_non_close_source_fails() -> None:
    with pytest.raises(ValueError, match="source"):
        EmaSpec(source="open", timeframe="base", period=20)


def test_invalid_rule_type_fails_in_distance_rule() -> None:
    with pytest.raises(ValueError, match="rule_type"):
        DistanceExitRuleSpec(
            rule_type="unknown_rule",
            distance=AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5),
        )


def test_missing_stop_or_take_fails_in_trade_management() -> None:
    with pytest.raises(ValueError, match="stop_loss_by_distance"):
        TradeManagementSpec(
            exit_rules=(
                DistanceExitRuleSpec(
                    rule_type="take_profit_by_distance",
                    distance=AtrDistanceSpec(timeframe="base", period=14, multiplier=4.0),
                ),
            )
        )


def test_active_specs_contains_only_new_spec() -> None:
    specs = active_strategy_specs(symbol="BTCUSDT", base_timeframe="1h")
    assert len(specs) == 1
    assert specs[0].variant == "ema_pullback_fast20_anchor200_slow1000"


def test_setup_and_trigger_validation() -> None:
    with pytest.raises(ValueError, match="pullback_to_anchor"):
        PullbackSetupSpec(component_id="bad_setup", lookback=3)
    with pytest.raises(ValueError, match="reclaim_anchor"):
        ReclaimTriggerSpec(component_id="bad_trigger")


def test_strategy_spec_basic_non_empty_validation() -> None:
    with pytest.raises(ValueError, match="variant"):
        EmaPullbackStrategySpec(
            variant="",
            symbol="BTCUSDT",
            base_timeframe="1h",
            anchor_stack=ema_pullback_fast20_anchor200_slow1000_spec().anchor_stack,
            setup=PullbackSetupSpec(),
            trigger=ReclaimTriggerSpec(),
            trade_management=ema_pullback_fast20_anchor200_slow1000_spec().trade_management,
        )
