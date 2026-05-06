from __future__ import annotations

import json
from pathlib import Path

import pytest

from research.experiments.config_loader import (
    ConfigValidationError,
    load_strategy_config,
    load_strategy_config_file,
)
from research.strategies.ema_pullback.config import DEFAULT_EXECUTION_CONFIG
from research.strategies.ema_pullback.execution import runner
from research.strategies.ema_pullback.instance_loader import (
    EmaPullbackInstanceValidationError,
)


def _instance(
    instance_id: str = "baseline",
    *,
    fast: int = 100,
    anchor: int = 200,
    slow: int = 1000,
) -> dict[str, object]:
    return {
        "instance_id": instance_id,
        "variant": f"ema_pullback_fast{fast}_anchor{anchor}_slow{slow}",
        "market": {"symbol": "BTCUSDT", "base_timeframe": "1h"},
        "execution": {},
        "strategy": {"trade_sides": ["long"]},
        "anchor_stack": {"fast": fast, "anchor": anchor, "slow": slow},
        "direction": {"component_id": "ema_anchor_stack_trend"},
        "setup": {"component_id": "pullback_to_anchor", "lookback": 3},
        "trigger": {"component_id": "reclaim_anchor"},
        "blockers": [{"instance_id": "no_blockers", "component_id": "no_blockers"}],
        "risk": {"component_id": "no_risk_filter"},
        "exits": [
            {
                "instance_id": "atr_stop_loss",
                "component_id": "atr_stop_loss",
                "distance": {"timeframe": "base", "period": 14, "multiplier": 1.5},
            },
            {
                "instance_id": "atr_take_profit",
                "component_id": "atr_take_profit",
                "distance": {"timeframe": "base", "period": 14, "multiplier": 4.0},
            },
        ],
    }


def _bundle(instances: list[dict[str, object]]) -> dict[str, object]:
    return {
        "schema_version": 1,
        "experiment_id": "ema_ext_smoke",
        "family": "ema_pullback",
        "instances": instances,
    }


def _write_json(path: Path, payload: dict[str, object]) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_load_single_object_external_config() -> None:
    payload = {
        "schema_version": 1,
        "experiment_id": "single",
        "family": "ema_pullback",
        **_instance("single_baseline"),
    }

    loaded = load_strategy_config(payload)

    assert loaded.experiment_id == "single"
    assert len(loaded.specs) == 1
    assert loaded.entries[0].instance_id == "single_baseline"
    assert loaded.specs[0].symbol == "BTCUSDT"


def test_load_bundle_external_config_from_file(tmp_path: Path) -> None:
    path = _write_json(
        tmp_path / "bundle.json",
        _bundle(
            [
                _instance("baseline"),
                _instance("fast_variant", fast=50, anchor=100, slow=200),
            ]
        ),
    )

    loaded = load_strategy_config_file(path)

    assert [entry.instance_id for entry in loaded.entries] == ["baseline", "fast_variant"]
    assert [spec.anchor_stack.fast.period for spec in loaded.specs] == [100, 50]
    assert loaded.identity_payload()["entries_count"] == 2


def test_loader_rejects_duplicate_instance_ids() -> None:
    with pytest.raises(ConfigValidationError, match="duplicate instance_id"):
        load_strategy_config(_bundle([_instance("dup"), _instance("dup")]))


def test_loader_rejects_unknown_envelope_fields_in_bundle() -> None:
    payload = _bundle([_instance()])
    payload["unexpected"] = True

    with pytest.raises(ConfigValidationError, match="unknown envelope field"):
        load_strategy_config(payload)


def test_loader_rejects_unsupported_family_before_dispatch() -> None:
    payload = _bundle([_instance()])
    payload["family"] = "other_family"

    with pytest.raises(ConfigValidationError, match="unsupported family"):
        load_strategy_config(payload)


def test_instance_loader_rejects_unknown_family_fields() -> None:
    payload = _bundle([_instance()])
    payload["instances"][0]["family_extra"] = "bad"  # type: ignore[index]

    with pytest.raises(EmaPullbackInstanceValidationError, match="unknown field"):
        load_strategy_config(payload)


def test_instance_loader_rejects_external_config_id_alias() -> None:
    instance = _instance()
    instance.pop("instance_id")
    instance["external_config_id"] = "legacy"

    with pytest.raises(ConfigValidationError, match="external_config_id"):
        load_strategy_config(_bundle([instance]))


def test_runner_does_not_load_candles_when_config_validation_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bad_instance = _instance()
    bad_instance.pop("anchor_stack")
    path = _write_json(tmp_path / "bad.json", _bundle([bad_instance]))
    called = False

    def fail_if_called(*_args: object, **_kwargs: object) -> object:
        nonlocal called
        called = True
        raise AssertionError("load_candles_once must not run on invalid config")

    monkeypatch.setattr(runner, "load_candles_once", fail_if_called)

    with pytest.raises(EmaPullbackInstanceValidationError, match="anchor_stack is required"):
        runner.run_strategy_specs_from_config(DEFAULT_EXECUTION_CONFIG, path)
    assert called is False

