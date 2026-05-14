from __future__ import annotations

from dataclasses import replace

import pytest

from research.strategies.ema_pullback.spec import (
    AnchorStackSpec,
    AtrDistanceSpec,
    EmaSpec,
    ExitRuleSpec,
    TradeManagementSpec,
    strategy_spec_config_id,
)
from research.strategies.ema_pullback.spec_instances import (
    make_ema_pullback_strategy_spec,
    variant_from_spec,
)


def test_default_spec_factory_is_valid_strategy_spec() -> None:
    spec = make_ema_pullback_strategy_spec()
    assert spec.variant.strip()
    assert spec.variant == variant_from_spec(spec)
    assert spec.symbol.strip()
    assert spec.base_timeframe.strip()
    stack = spec.anchor_stack
    assert stack.fast.period < stack.anchor.period < stack.slow.period
    assert spec.components.direction == "ema_anchor_stack_trend"
    assert spec.components.setup == "pullback_to_anchor"
    assert spec.components.trigger.component_id == "reclaim_anchor"
    assert [b.component_id for b in spec.components.blockers] == ["no_blockers"]
    assert [e.component_id for e in spec.components.exits] == ["atr_stop_loss", "atr_take_profit"]
    stop = [r for r in spec.components.exits if r.exit_kind == "stop_loss"]
    take = [r for r in spec.components.exits if r.exit_kind == "take_profit"]
    assert len(stop) == 1 and len(take) == 1


def test_strategy_spec_config_id_is_deterministic() -> None:
    a = make_ema_pullback_strategy_spec()
    b = make_ema_pullback_strategy_spec()
    assert strategy_spec_config_id(a) == strategy_spec_config_id(b)


def test_invalid_anchor_stack_order_rejected() -> None:
    with pytest.raises(ValueError, match="fast < anchor < slow"):
        AnchorStackSpec(
            fast=EmaSpec(source="close", timeframe="base", period=20),
            anchor=EmaSpec(source="close", timeframe="base", period=10),
            slow=EmaSpec(source="close", timeframe="base", period=1000),
        )


def test_exit_distance_rules_require_distance() -> None:
    with pytest.raises(ValueError, match="atr_stop_loss exit requires distance"):
        ExitRuleSpec(instance_id="atr_stop_loss", component_id="atr_stop_loss", exit_kind="stop_loss")


def test_exit_rule_rejects_component_kind_mismatch() -> None:
    distance = AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5)
    with pytest.raises(ValueError, match="rsi_signal_exit.*exit_kind 'signal'"):
        ExitRuleSpec(
            instance_id="rsi_exit",
            component_id="rsi_signal_exit",
            exit_kind="stop_loss",
            distance=distance,
        )


def test_signal_exit_rules_reject_distance_payload() -> None:
    distance = AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5)
    with pytest.raises(ValueError, match="signal exit must not define distance"):
        ExitRuleSpec(
            instance_id="rsi_exit",
            component_id="rsi_signal_exit",
            exit_kind="signal",
            distance=distance,
        )


def test_distance_exit_rules_reject_signal_thresholds() -> None:
    distance = AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5)
    with pytest.raises(ValueError, match="stop_loss exit must not define signal thresholds"):
        ExitRuleSpec(
            instance_id="atr_stop_loss",
            component_id="atr_stop_loss",
            exit_kind="stop_loss",
            distance=distance,
            long_exit_above=70.0,
        )


def test_constant_usd_stop_requires_positive_usd_distance() -> None:
    with pytest.raises(ValueError, match="constant_usd_stop_loss exit requires positive usd_distance"):
        ExitRuleSpec(
            instance_id="sl",
            component_id="constant_usd_stop_loss",
            exit_kind="stop_loss",
        )


def test_atr_stop_rejects_usd_distance() -> None:
    distance = AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5)
    with pytest.raises(ValueError, match="atr_stop_loss exit must not define usd_distance"):
        ExitRuleSpec(
            instance_id="sl",
            component_id="atr_stop_loss",
            exit_kind="stop_loss",
            distance=distance,
            usd_distance=100.0,
        )


def test_trade_management_is_reserved_stub() -> None:
    assert TradeManagementSpec().profile == "reserved"
    with pytest.raises(ValueError, match="profile must be non-empty"):
        TradeManagementSpec(profile="")


def test_component_stack_uses_typed_rule_specs() -> None:
    spec = make_ema_pullback_strategy_spec()
    assert spec.components.trigger.component_id == "reclaim_anchor"
    assert isinstance(spec.components.blockers, tuple)
    assert isinstance(spec.components.exits, tuple)
    assert spec.components.blockers[0].component_id == "no_blockers"
    assert spec.components.exits[0].component_id == "atr_stop_loss"


def test_strategy_spec_requires_non_empty_identity_fields() -> None:
    with pytest.raises(ValueError, match="variant must be non-empty"):
        replace(make_ema_pullback_strategy_spec(), variant="")
