"""Runtime execution config tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from research.strategies.ema_pullback.component_builders import (
    blocker_counter_candle,
    blocker_extreme_rsi,
    blocker_none,
    component_stack,
    exit_atr_stop_loss,
    exit_atr_take_profit,
    exit_no_signal,
    exit_rsi,
    exits_atr_default,
    trade_sides,
    trigger_reclaim_anchor,
    trigger_touch_anchor,
)
from research.strategies.ema_pullback.config import (
    DEFAULT_EXECUTION_CONFIG,
    ExecutionConfig,
)
from research.strategies.ema_pullback.cli import config_from_args, parse_args
from research.strategies.ema_pullback.spec import TradeSideSpec, strategy_spec_config_id
from research.strategies.ema_pullback.spec_instances import (
    default_ema_pullback_strategy_spec,
    make_ema_pullback_strategy_spec,
)


def test_default_execution_config_contains_only_runtime_fields() -> None:
    cfg = DEFAULT_EXECUTION_CONFIG
    assert set(cfg.__dataclass_fields__) == {
        "family",
        "symbol",
        "timeframe",
        "db_path",
        "init_cash",
        "fees",
        "slippage",
    }


def test_execution_config_validates_runtime_fields() -> None:
    cfg = ExecutionConfig(
        family="ema_pullback",
        symbol="ETHUSDT",
        timeframe="4h",
        db_path=Path("custom.sqlite"),
        init_cash=1500.0,
        fees=0.001,
        slippage=0.0005,
    )
    assert cfg.symbol == "ETHUSDT"
    assert cfg.timeframe == "4h"


def test_runtime_changes_do_not_change_strategy_spec_id() -> None:
    spec = default_ema_pullback_strategy_spec(symbol="BTCUSDT", base_timeframe="1h")
    base_id = strategy_spec_config_id(spec)
    _runtime_a = ExecutionConfig("ema_pullback", "BTCUSDT", "1h", Path("a.sqlite"), 100.0, 0.0, 0.0)
    _runtime_b = ExecutionConfig("ema_pullback", "BTCUSDT", "1h", Path("b.sqlite"), 500.0, 0.001, 0.0005)
    assert strategy_spec_config_id(spec) == base_id


def test_default_strategy_spec_is_long_only() -> None:
    spec = default_ema_pullback_strategy_spec()
    assert spec.trade_sides.enabled == ("long",)


def test_trade_side_spec_accepts_long_and_short() -> None:
    sides = TradeSideSpec(enabled=("long", "short"))
    assert sides.enabled == ("long", "short")
    assert sides.includes("long") is True
    assert sides.includes("short") is True


def test_trade_side_spec_rejects_invalid_values() -> None:
    with pytest.raises(ValueError, match="non-empty"):
        TradeSideSpec(enabled=())
    with pytest.raises(ValueError, match="one of"):
        TradeSideSpec(enabled=("long", "flat"))  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="duplicates"):
        TradeSideSpec(enabled=("long", "long"))


def test_trade_sides_are_part_of_strategy_spec_config_id() -> None:
    long_only = make_ema_pullback_strategy_spec(enabled_sides=("long",))
    bidirectional = make_ema_pullback_strategy_spec(enabled_sides=("long", "short"))
    assert long_only.variant == bidirectional.variant
    assert strategy_spec_config_id(long_only) != strategy_spec_config_id(bidirectional)


def test_factory_accepts_sequence_for_enabled_sides() -> None:
    spec = make_ema_pullback_strategy_spec(enabled_sides=["long", "short"])
    assert spec.trade_sides.enabled == ("long", "short")


def test_cli_overrides_build_final_execution_config() -> None:
    args = parse_args(
        [
            "--symbol",
            "ethusdt",
            "--tf",
            "4h",
            "--db-path",
            "custom.sqlite",
            "--init-cash",
            "1500",
            "--fees",
            "0.001",
            "--slippage",
            "0.0005",
        ]
    )
    cfg = config_from_args(args)
    assert cfg.symbol == "ETHUSDT"
    assert cfg.timeframe == "4h"
    assert cfg.db_path == Path("custom.sqlite")
    assert cfg.init_cash == 1500.0
    assert cfg.fees == 0.001
    assert cfg.slippage == 0.0005


def test_exit_shortcuts_build_expected_component_kinds() -> None:
    no_signal = exit_no_signal()
    rsi = exit_rsi(
        instance_id="rsi_exit_base",
        timeframe="base",
        period=14,
        long_exit_above=80.0,
        short_exit_below=20.0,
    )
    stop = exit_atr_stop_loss(atr_period=14, atr_multiplier=1.5)
    take = exit_atr_take_profit(atr_period=14, atr_multiplier=4.0)

    assert (no_signal.component_id, no_signal.exit_kind) == ("no_signal_exit", "signal")
    assert (rsi.component_id, rsi.exit_kind) == ("rsi_signal_exit", "signal")
    assert (stop.component_id, stop.exit_kind) == ("atr_stop_loss", "stop_loss")
    assert (take.component_id, take.exit_kind) == ("atr_take_profit", "take_profit")
    assert no_signal.instance_id == "no_signal_exit"
    assert rsi.instance_id == "rsi_exit_base"
    assert stop.instance_id == "atr_stop_loss"
    assert take.instance_id == "atr_take_profit"


def test_exits_atr_default_builds_two_distance_exit_rules() -> None:
    exits = exits_atr_default(
        atr_period=14,
        stop_atr_multiplier=1.5,
        take_atr_multiplier=4.0,
    )
    assert len(exits) == 2
    assert [rule.component_id for rule in exits] == ["atr_stop_loss", "atr_take_profit"]
    assert [rule.instance_id for rule in exits] == ["atr_stop_loss", "atr_take_profit"]
    assert [rule.exit_kind for rule in exits] == ["stop_loss", "take_profit"]
    assert [rule.distance.multiplier if rule.distance else None for rule in exits] == [1.5, 4.0]


def test_component_stack_default_matches_baseline_defaults() -> None:
    stack = component_stack()
    assert stack.direction == "ema_anchor_stack_trend"
    assert [b.component_id for b in stack.blockers] == ["no_blockers"]
    assert [b.instance_id for b in stack.blockers] == ["no_blockers"]
    assert stack.setup == "pullback_to_anchor"
    assert stack.trigger.component_id == "reclaim_anchor"
    assert stack.exits == exits_atr_default(
        atr_period=14,
        stop_atr_multiplier=1.5,
        take_atr_multiplier=4.0,
    )
    assert stack.risk == "no_risk_filter"


def test_builders_normalize_sequences_to_tuples() -> None:
    sides = trade_sides(["long", "short"])
    blockers_list = [
        blocker_none(),
        blocker_counter_candle(),
        blocker_extreme_rsi(instance_id="rsi_base"),
    ]
    exits_list = [exit_no_signal(), exit_rsi(instance_id="rsi_exit_base")]
    stack = component_stack(
        blockers=blockers_list,
        exits=exits_list,
        trigger=trigger_touch_anchor(),
    )

    assert sides.enabled == ("long", "short")
    assert isinstance(stack.blockers, tuple)
    assert isinstance(stack.exits, tuple)
    assert stack.trigger == trigger_touch_anchor()


def test_builders_reject_str_and_bytes_for_sequence_inputs() -> None:
    with pytest.raises(TypeError, match="str/bytes"):
        trade_sides("long")  # type: ignore[arg-type]
    with pytest.raises(TypeError, match="str/bytes"):
        component_stack(blockers="no_blockers")  # type: ignore[arg-type]
    with pytest.raises(TypeError, match="str/bytes"):
        component_stack(exits=b"atr_stop_loss")  # type: ignore[arg-type]


def test_blocker_and_trigger_shortcuts_return_expected_components() -> None:
    assert blocker_none().component_id == "no_blockers"
    assert blocker_none().instance_id == "no_blockers"
    assert blocker_counter_candle().component_id == "counter_candle_blocker"
    assert blocker_extreme_rsi(instance_id="rsi_base").component_id == "rsi_extreme_blocker"
    assert trigger_reclaim_anchor().component_id == "reclaim_anchor"
    assert trigger_touch_anchor().component_id == "touch_anchor"


def test_component_stack_rejects_duplicate_instance_ids_per_role() -> None:
    with pytest.raises(ValueError, match="components.blockers instance_id must be unique"):
        component_stack(
            blockers=(
                blocker_counter_candle(instance_id="duplicate"),
                blocker_extreme_rsi(instance_id="duplicate"),
            )
        )

    with pytest.raises(ValueError, match="components.exits instance_id must be unique"):
        component_stack(
            exits=(
                exit_no_signal(),
                exit_rsi(instance_id="no_signal_exit"),
            )
        )


def test_repeated_components_require_explicit_distinct_instance_ids() -> None:
    stack = component_stack(
        blockers=(
            blocker_extreme_rsi(instance_id="rsi_5m", timeframe="5m", lookback=20),
            blocker_extreme_rsi(instance_id="rsi_15m", timeframe="15m", lookback=40),
        ),
        exits=(
            exit_atr_stop_loss(atr_period=14, atr_multiplier=1.5, instance_id="atr_sl_fast"),
            exit_atr_stop_loss(atr_period=14, atr_multiplier=2.0, instance_id="atr_sl_slow"),
            exit_atr_take_profit(atr_period=14, atr_multiplier=4.0),
        ),
    )

    assert [rule.component_id for rule in stack.blockers] == [
        "rsi_extreme_blocker",
        "rsi_extreme_blocker",
    ]
    assert [rule.instance_id for rule in stack.blockers] == ["rsi_5m", "rsi_15m"]
    assert [rule.instance_id for rule in stack.exits] == [
        "atr_sl_fast",
        "atr_sl_slow",
        "atr_take_profit",
    ]
