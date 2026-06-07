from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from research.experiments.config_loader import load_strategy_config
from research.strategies.ema_pullback.spec import strategy_spec_to_dict


_BE_FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "research"
    / "experiments"
    / "configs"
    / "fixtures"
    / "exit_management_be_profile_override.json"
)


def _fixture_payload() -> dict[str, object]:
    return json.loads(_BE_FIXTURE.read_text(encoding="utf-8"))


def _strategy(payload: dict[str, object]) -> dict[str, object]:
    instances = payload["instances"]
    assert isinstance(instances, list)
    instance = instances[0]
    assert isinstance(instance, dict)
    strategy = instance["strategy"]
    assert isinstance(strategy, dict)
    return strategy


def _trade_management(payload: dict[str, object]) -> dict[str, object]:
    trade_management = _strategy(payload)["trade_management"]
    assert isinstance(trade_management, dict)
    return trade_management


def _diagnostic_only_exit_management() -> dict[str, object]:
    return {
        "mode": "diagnostic_only",
        "phase_rules": [
            {
                "rule_id": "to_proven_at_1atr",
                "to_phase": "proven",
                "condition": {
                    "type": "mfe_atr",
                    "threshold": 1.0,
                    "atr": {"timeframe": "base", "period": 14},
                },
            },
            {
                "rule_id": "to_runner_after_24_bars",
                "to_phase": "runner",
                "condition": {"type": "bars_in_trade", "threshold": 24},
            },
        ],
        "stop_management": [],
        "runtime_exits": [],
    }


def test_old_config_without_exit_management_uses_empty_contract() -> None:
    payload = _fixture_payload()
    _trade_management(payload).pop("exit_management")

    loaded = load_strategy_config(payload)
    exit_management = loaded.specs[0].trade_management.exit_management

    assert exit_management.mode is None
    assert exit_management.phase_rules == ()
    assert exit_management.stop_management == ()
    assert exit_management.runtime_exits == ()
    assert exit_management.always_on.rules == ()


def test_archived_break_even_exit_management_shape_still_loads() -> None:
    loaded = load_strategy_config(_fixture_payload())
    exit_management = loaded.specs[0].trade_management.exit_management

    assert exit_management.mode is None
    assert exit_management.phase_rules == ()
    assert exit_management.profiles.aligned.rules[0].instance_id == "be_aligned_1r"
    assert exit_management.always_on.rules[0].trigger_r == 2.0


def test_diagnostic_only_exit_management_config_loads() -> None:
    payload = _fixture_payload()
    _trade_management(payload)["exit_management"] = _diagnostic_only_exit_management()

    loaded = load_strategy_config(payload)
    exit_management = loaded.specs[0].trade_management.exit_management

    assert exit_management.mode == "diagnostic_only"
    assert [rule.rule_id for rule in exit_management.phase_rules] == [
        "to_proven_at_1atr",
        "to_runner_after_24_bars",
    ]
    assert exit_management.phase_rules[0].condition.type == "mfe_atr"
    assert exit_management.phase_rules[0].condition.atr is not None
    assert exit_management.phase_rules[0].condition.atr.period == 14
    assert exit_management.always_on.rules == ()
    assert exit_management.profiles.aligned.rules == ()


def test_diagnostic_only_rejects_non_empty_stop_management() -> None:
    payload = _fixture_payload()
    exit_management = _diagnostic_only_exit_management()
    exit_management["stop_management"] = [{"rule_id": "be_after_protected"}]
    _trade_management(payload)["exit_management"] = exit_management

    with pytest.raises(ValueError, match="stop_management is not supported in v1"):
        load_strategy_config(payload)


def test_diagnostic_only_rejects_non_empty_runtime_exits() -> None:
    payload = _fixture_payload()
    exit_management = _diagnostic_only_exit_management()
    exit_management["runtime_exits"] = [{"rule_id": "ema30_loss_runner"}]
    _trade_management(payload)["exit_management"] = exit_management

    with pytest.raises(ValueError, match="runtime_exits is not supported in v1"):
        load_strategy_config(payload)


def test_diagnostic_only_rejects_phase_rules_that_move_backwards() -> None:
    payload = _fixture_payload()
    exit_management = _diagnostic_only_exit_management()
    exit_management["phase_rules"] = [
        {
            "rule_id": "to_runner_at_2_5atr",
            "to_phase": "runner",
            "condition": {"type": "mfe_pct", "threshold": 0.025},
        },
        {
            "rule_id": "to_protected_at_1_5atr",
            "to_phase": "protected",
            "condition": {"type": "mfe_pct", "threshold": 0.015},
        },
    ]
    _trade_management(payload)["exit_management"] = exit_management

    with pytest.raises(ValueError, match="phase_rules must be ordered"):
        load_strategy_config(payload)


def test_default_exit_management_wire_shape_omits_new_empty_fields() -> None:
    payload = _fixture_payload()
    _trade_management(payload).pop("exit_management")
    loaded = load_strategy_config(payload)

    serialized = strategy_spec_to_dict(loaded.specs[0])
    exit_management = serialized["trade_management"]["exit_management"]

    assert "mode" not in exit_management
    assert "phase_rules" not in exit_management
    assert "stop_management" not in exit_management
    assert "runtime_exits" not in exit_management


def test_diagnostic_only_wire_shape_keeps_phase_rules() -> None:
    payload = _fixture_payload()
    _trade_management(payload)["exit_management"] = copy.deepcopy(
        _diagnostic_only_exit_management()
    )
    loaded = load_strategy_config(payload)

    serialized = strategy_spec_to_dict(loaded.specs[0])
    exit_management = serialized["trade_management"]["exit_management"]

    assert exit_management["mode"] == "diagnostic_only"
    assert exit_management["phase_rules"][0]["condition"]["type"] == "mfe_atr"
