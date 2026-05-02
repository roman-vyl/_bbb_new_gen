from __future__ import annotations

from research.strategies.ema_pullback.spec_instances import (
    active_strategy_specs,
    default_ema_pullback_strategy_spec,
)


def test_spec_instance_factory_values() -> None:
    reference = default_ema_pullback_strategy_spec()
    spec = default_ema_pullback_strategy_spec(symbol="ethusdt", base_timeframe="4h")
    assert spec.variant == reference.variant
    assert spec.symbol == "ETHUSDT"
    assert spec.base_timeframe == "4h"
    assert spec.setup.lookback == reference.setup.lookback
    assert spec.anchor_stack == reference.anchor_stack
    assert spec.trade_management == reference.trade_management
    assert {r.rule_type for r in spec.trade_management.exit_rules} == {
        "stop_loss_by_distance",
        "take_profit_by_distance",
    }


def test_active_strategy_specs_matches_default_factory() -> None:
    specs = active_strategy_specs("BTCUSDT", "1h")
    assert len(specs) == 1
    assert specs[0] == default_ema_pullback_strategy_spec(symbol="BTCUSDT", base_timeframe="1h")
