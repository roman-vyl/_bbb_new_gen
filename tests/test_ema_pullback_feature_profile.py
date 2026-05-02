from __future__ import annotations

from dataclasses import replace

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
from research.strategies.ema_pullback.spec_instances import (
    default_ema_pullback_strategy_spec,
    variant_from_spec,
)


def test_default_spec_factory_is_valid_strategy_spec() -> None:
    spec = default_ema_pullback_strategy_spec()
    assert spec.variant.strip()
    assert spec.variant == variant_from_spec(spec)
    assert spec.symbol.strip()
    assert spec.base_timeframe.strip()
    stack = spec.anchor_stack
    assert stack.fast.period < stack.anchor.period < stack.slow.period
    assert spec.components.direction == "ema_anchor_stack_bullish"
    assert spec.components.setup == "pullback_to_anchor"
    assert spec.components.trigger == "reclaim_anchor"
    stop = [r for r in spec.trade_management.exit_rules if r.rule_type == "stop_loss_by_distance"]
    take = [r for r in spec.trade_management.exit_rules if r.rule_type == "take_profit_by_distance"]
    assert len(stop) == 1 and len(take) == 1


def test_strategy_spec_config_id_is_deterministic() -> None:
    a = default_ema_pullback_strategy_spec()
    b = default_ema_pullback_strategy_spec()
    assert strategy_spec_config_id(a) == strategy_spec_config_id(b)


def test_invalid_anchor_stack_order_rejected() -> None:
    with pytest.raises(ValueError, match="fast < anchor < slow"):
        AnchorStackSpec(
            fast=EmaSpec(source="close", timeframe="base", period=20),
            anchor=EmaSpec(source="close", timeframe="base", period=10),
            slow=EmaSpec(source="close", timeframe="base", period=1000),
        )


def test_trade_management_requires_both_distance_rules() -> None:
    base = default_ema_pullback_strategy_spec()
    stop_distance = next(
        r.distance for r in base.trade_management.exit_rules if r.rule_type == "stop_loss_by_distance"
    )
    with pytest.raises(ValueError, match="take_profit_by_distance"):
        TradeManagementSpec(
            exit_rules=(
                DistanceExitRuleSpec(
                    rule_type="stop_loss_by_distance",
                    distance=stop_distance,
                ),
            )
        )


def test_strategy_spec_requires_non_empty_identity_fields() -> None:
    with pytest.raises(ValueError, match="variant must be non-empty"):
        replace(default_ema_pullback_strategy_spec(), variant="")
