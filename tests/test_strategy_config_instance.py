"""Runtime execution config tests."""

from __future__ import annotations

from pathlib import Path

import pytest

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
