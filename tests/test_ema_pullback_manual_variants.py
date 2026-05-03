from __future__ import annotations

from research.strategies.ema_pullback.component_builders import (
    anchor_stack_from_periods,
    exits_atr_default,
)
from research.strategies.ema_pullback.spec_instances import (
    active_strategy_specs,
    default_ema_pullback_strategy_spec,
    make_ema_pullback_strategy_spec,
    variant_from_spec,
)


def test_spec_instance_factory_values() -> None:
    reference = default_ema_pullback_strategy_spec()
    spec = default_ema_pullback_strategy_spec(symbol="ethusdt", base_timeframe="4h")
    assert spec.variant == reference.variant
    assert spec.variant == variant_from_spec(spec)
    assert spec.symbol == "ETHUSDT"
    assert spec.base_timeframe == "4h"
    assert spec.setup.lookback == reference.setup.lookback
    assert spec.anchor_stack == reference.anchor_stack
    assert spec.trade_management == reference.trade_management
    assert {r.exit_kind for r in spec.components.exits} == {"stop_loss", "take_profit"}


def test_active_strategy_specs_matches_default_factory() -> None:
    specs = active_strategy_specs("BTCUSDT", "1h")
    assert len(specs) == 1
    spec = specs[0]
    assert spec == default_ema_pullback_strategy_spec(symbol="BTCUSDT", base_timeframe="1h")
    assert spec.variant == variant_from_spec(spec)
    assert (
        spec.anchor_stack.fast.period
        < spec.anchor_stack.anchor.period
        < spec.anchor_stack.slow.period
    )
    assert spec.components.direction == "ema_anchor_stack_bullish"
    assert [b.component_id for b in spec.components.blockers] == ["no_blockers"]
    assert spec.components.setup == "pullback_to_anchor"
    assert spec.components.trigger.component_id == "reclaim_anchor"
    assert [e.component_id for e in spec.components.exits] == ["atr_stop_loss", "atr_take_profit"]
    assert spec.components.risk == "no_risk_filter"


def test_custom_spec_variant_follows_anchor_stack_periods() -> None:
    spec = make_ema_pullback_strategy_spec(fast_period=7, anchor_period=11, slow_period=13)
    assert spec.variant == variant_from_spec(spec)
    assert spec.anchor_stack.fast.period == 7
    assert spec.anchor_stack.anchor.period == 11
    assert spec.anchor_stack.slow.period == 13


def test_anchor_stack_builder_matches_factory_anchor_periods() -> None:
    spec = make_ema_pullback_strategy_spec(fast_period=21, anchor_period=55, slow_period=200)
    expected = anchor_stack_from_periods(fast=21, anchor=55, slow=200)
    assert spec.anchor_stack == expected


def test_factory_uses_default_atr_exit_shortcuts_in_expected_order() -> None:
    spec = make_ema_pullback_strategy_spec(
        atr_period=21,
        stop_atr_multiplier=2.0,
        take_atr_multiplier=5.0,
    )
    expected_exits = exits_atr_default(
        atr_period=21,
        stop_atr_multiplier=2.0,
        take_atr_multiplier=5.0,
    )
    assert spec.components.exits == expected_exits
