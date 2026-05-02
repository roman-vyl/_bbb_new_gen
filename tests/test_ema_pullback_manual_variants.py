from __future__ import annotations

from research.strategies.ema_pullback.spec_instances import (
    active_strategy_specs,
    ema_pullback_fast20_anchor200_slow1000_spec,
)


def test_spec_instance_factory_values() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec(symbol="ethusdt", base_timeframe="4h")
    assert spec.variant == "ema_pullback_fast20_anchor200_slow1000"
    assert spec.symbol == "ETHUSDT"
    assert spec.base_timeframe == "4h"
    assert spec.setup.lookback == 3
    assert {r.rule_type for r in spec.trade_management.exit_rules} == {
        "stop_loss_by_distance",
        "take_profit_by_distance",
    }


def test_active_strategy_specs_contains_only_single_stage10_spec() -> None:
    specs = active_strategy_specs("BTCUSDT", "1h")
    assert [s.variant for s in specs] == ["ema_pullback_fast20_anchor200_slow1000"]
