"""Stage 3 tests: strategy config identity and instance contract."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from research.strategies.ema_pullback.config import (
    DEFAULT_CONFIG,
    canonical_identity_json,
    config_id_from_identity,
    identity_payload,
    strategy_config_id,
)
from research.strategies.ema_pullback.cli import config_from_args, parse_args
from research.strategies.ema_pullback.instance import StrategyInstance


def test_same_config_yields_same_config_id() -> None:
    assert strategy_config_id(DEFAULT_CONFIG) == strategy_config_id(DEFAULT_CONFIG)


def test_identity_change_changes_config_id() -> None:
    changed_fast = replace(DEFAULT_CONFIG, ema_fast=DEFAULT_CONFIG.ema_fast + 1)
    changed_fees = replace(DEFAULT_CONFIG, fees=DEFAULT_CONFIG.fees + 0.001)
    changed_profile = replace(DEFAULT_CONFIG, feature_profile="ema_pullback_alt")
    changed_trade_management = replace(DEFAULT_CONFIG, trade_management_profile="fixed_pct_sl_tp")
    base = strategy_config_id(DEFAULT_CONFIG)
    assert strategy_config_id(changed_fast) != base
    assert strategy_config_id(changed_fees) != base
    assert strategy_config_id(changed_profile) != base
    assert strategy_config_id(changed_trade_management) != base


def test_config_id_is_stable_for_dict_key_order() -> None:
    identity = identity_payload(DEFAULT_CONFIG)
    ordered_a = {
        "family": identity["family"],
        "variant": identity["variant"],
        "symbol": identity["symbol"],
        "timeframe": identity["timeframe"],
        "ema_fast": identity["ema_fast"],
        "ema_slow": identity["ema_slow"],
        "init_cash": identity["init_cash"],
        "fees": identity["fees"],
        "slippage": identity["slippage"],
    }
    ordered_b = {
        "slippage": identity["slippage"],
        "fees": identity["fees"],
        "init_cash": identity["init_cash"],
        "ema_slow": identity["ema_slow"],
        "ema_fast": identity["ema_fast"],
        "timeframe": identity["timeframe"],
        "symbol": identity["symbol"],
        "variant": identity["variant"],
        "family": identity["family"],
    }
    assert canonical_identity_json(ordered_a) == canonical_identity_json(ordered_b)
    assert config_id_from_identity(ordered_a) == config_id_from_identity(ordered_b)


def test_db_path_is_not_part_of_config_id() -> None:
    local_a = replace(DEFAULT_CONFIG, db_path=Path("a/market.sqlite"))
    local_b = replace(DEFAULT_CONFIG, db_path=Path("b/market.sqlite"))
    assert strategy_config_id(local_a) == strategy_config_id(local_b)


def test_trade_management_profile_is_included_in_identity_payload() -> None:
    identity = identity_payload(DEFAULT_CONFIG)
    assert identity["trade_management_profile"] == DEFAULT_CONFIG.trade_management_profile


def test_identity_payload_includes_strategy_spec_fingerprint() -> None:
    identity = identity_payload(DEFAULT_CONFIG)
    assert "strategy_spec" in identity
    assert identity["strategy_spec"] is None


def test_strategy_instance_exposes_config_id() -> None:
    instance = StrategyInstance.from_config(DEFAULT_CONFIG)
    assert instance.config is DEFAULT_CONFIG
    assert instance.config_id == strategy_config_id(DEFAULT_CONFIG)


def test_cli_overrides_build_final_strategy_config() -> None:
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
    assert cfg.ema_fast == DEFAULT_CONFIG.ema_fast
    assert cfg.ema_slow == DEFAULT_CONFIG.ema_slow
    assert cfg.init_cash == 1500.0
    assert cfg.fees == 0.001
    assert cfg.slippage == 0.0005
    assert cfg.feature_profile == DEFAULT_CONFIG.feature_profile
    assert cfg.trade_management_profile == DEFAULT_CONFIG.trade_management_profile
