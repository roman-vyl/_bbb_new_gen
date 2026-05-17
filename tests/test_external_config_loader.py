from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from research.experiments.config_loader import (
    ConfigValidationError,
    load_strategy_config,
    load_strategy_config_file,
)
from research.strategies.ema_pullback.execution import runner
from research.strategies.ema_pullback.instance_loader import (
    EmaPullbackInstanceValidationError,
)


def _instance(
    instance_id: str = "baseline",
    *,
    variant: str | None = None,
    fast: int = 100,
    anchor: int = 200,
    slow: int = 1000,
    anchor_source: str = "close",
    anchor_timeframe: str = "base",
    trade_sides: object | None = None,
    exits: object | None = None,
) -> dict[str, object]:
    return {
        "instance_id": instance_id,
        **(
            {"variant": variant}
            if variant is not None
            else {"variant": f"ema_pullback_fast{fast}_anchor{anchor}_slow{slow}"}
        ),
        "market": {"symbol": "BTCUSDT", "base_timeframe": "1h"},
        "strategy": {
            "trade_sides": ["long"] if trade_sides is None else trade_sides,
            "anchor_stack": {
                "source": anchor_source,
                "timeframe": anchor_timeframe,
                "fast": fast,
                "anchor": anchor,
                "slow": slow,
            },
            "direction": {"component_id": "ema_anchor_stack_trend"},
            "setup": {
                "component_id": "untouched_anchor_setup",
                "lookback": 50,
                "active_bars": 3,
            },
            "trigger": {"component_id": "reclaim_anchor"},
            "blockers": [{"instance_id": "no_blockers", "component_id": "no_blockers"}],
            "risk": {"component_id": "no_risk_filter"},
            "exits": exits
            if exits is not None
            else [
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
        },
    }


def _bundle(instances: list[dict[str, object]]) -> dict[str, object]:
    return {
        "schema_version": 1,
        "experiment_id": "ema_ext_smoke",
        "family": "ema_pullback",
        "execution": {"init_cash": 10000.0, "fees": 0.0006, "slippage": 0.0001},
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
        "execution": {"init_cash": 5000.0},
        **_instance("single_baseline"),
    }

    loaded = load_strategy_config(payload)

    assert loaded.experiment_id == "single"
    assert len(loaded.specs) == 1
    assert loaded.entries[0].instance_id == "single_baseline"
    assert loaded.specs[0].symbol == "BTCUSDT"
    assert loaded.specs[0].anchor_stack.fast.source == "close"
    assert loaded.specs[0].anchor_stack.fast.timeframe == "base"
    assert loaded.execution.init_cash == 5000.0


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
    assert loaded.execution.fees == 0.0006
    assert loaded.execution.slippage == 0.0001
    assert loaded.identity_payload()["entries_count"] == 2


@pytest.mark.parametrize("schema_version", [2, "2"])
def test_loader_rejects_unsupported_schema_version(schema_version: object) -> None:
    payload = _bundle([_instance()])
    payload["schema_version"] = schema_version

    with pytest.raises(ConfigValidationError, match="schema_version must be exactly 1"):
        load_strategy_config(payload)


def test_load_external_config_supports_anchor_stack_source_and_timeframe() -> None:
    loaded = load_strategy_config(
        _bundle(
            [
                _instance(
                    "mtf_anchor",
                    anchor_source="close",
                    anchor_timeframe="4h",
                )
            ]
        )
    )

    spec = loaded.specs[0]
    assert spec.anchor_stack.fast.source == "close"
    assert spec.anchor_stack.anchor.source == "close"
    assert spec.anchor_stack.slow.source == "close"
    assert spec.anchor_stack.fast.timeframe == "4h"
    assert spec.anchor_stack.anchor.timeframe == "4h"
    assert spec.anchor_stack.slow.timeframe == "4h"


def test_load_external_config_supports_exit_atr_distance_timeframe() -> None:
    instance = _instance("mtf_exit_distance")
    strategy = instance["strategy"]
    assert isinstance(strategy, dict)
    exits = strategy["exits"]
    assert isinstance(exits, list)
    exits[0]["distance"]["timeframe"] = "15m"

    loaded = load_strategy_config(_bundle([instance]))

    spec = loaded.specs[0]
    assert spec.components.exits[0].distance is not None
    assert spec.components.exits[0].distance.timeframe == "15m"


def test_load_external_config_supports_constant_usd_stop_and_take() -> None:
    loaded = load_strategy_config(
        _bundle(
            [
                _instance(
                    "constant_usd_exits",
                    exits=[
                        {
                            "instance_id": "sl_usd",
                            "component_id": "constant_usd_stop_loss",
                            "usd_distance": 500.0,
                        },
                        {
                            "instance_id": "tp_usd",
                            "component_id": "constant_usd_take_profit",
                            "usd_distance": 1200.0,
                        },
                    ],
                )
            ]
        )
    )

    sl, tp = loaded.specs[0].components.exits
    assert sl.component_id == "constant_usd_stop_loss" and sl.usd_distance == 500.0 and sl.distance is None
    assert tp.component_id == "constant_usd_take_profit" and tp.usd_distance == 1200.0 and tp.distance is None


def test_load_external_config_supports_only_atr_stop_loss_exit() -> None:
    loaded = load_strategy_config(
        _bundle(
            [
                _instance(
                    "only_atr_sl",
                    exits=[
                        {
                            "instance_id": "atr_stop_loss",
                            "component_id": "atr_stop_loss",
                            "distance": {"timeframe": "base", "period": 14, "multiplier": 1.5},
                        }
                    ],
                )
            ]
        )
    )

    exit_rule = loaded.specs[0].components.exits[0]
    assert len(loaded.specs[0].components.exits) == 1
    assert exit_rule.exit_kind == "stop_loss"
    assert exit_rule.distance is not None
    assert exit_rule.distance.period == 14
    assert exit_rule.distance.multiplier == 1.5


def test_load_external_config_supports_only_atr_take_profit_exit() -> None:
    loaded = load_strategy_config(
        _bundle(
            [
                _instance(
                    "only_atr_tp",
                    exits=[
                        {
                            "instance_id": "atr_take_profit",
                            "component_id": "atr_take_profit",
                            "distance": {"timeframe": "base", "period": 14, "multiplier": 4.0},
                        }
                    ],
                )
            ]
        )
    )

    exit_rule = loaded.specs[0].components.exits[0]
    assert len(loaded.specs[0].components.exits) == 1
    assert exit_rule.exit_kind == "take_profit"
    assert exit_rule.distance is not None
    assert exit_rule.distance.period == 14
    assert exit_rule.distance.multiplier == 4.0


def test_load_external_config_supports_only_rsi_signal_exit() -> None:
    loaded = load_strategy_config(
        _bundle(
            [
                _instance(
                    "only_rsi_exit",
                    exits=[
                        {
                            "instance_id": "rsi_exit",
                            "component_id": "rsi_signal_exit",
                            "rsi": {"timeframe": "base", "period": 14},
                            "long_exit_above": 70.0,
                            "short_exit_below": 30.0,
                        }
                    ],
                )
            ]
        )
    )

    exit_rule = loaded.specs[0].components.exits[0]
    assert len(loaded.specs[0].components.exits) == 1
    assert exit_rule.exit_kind == "signal"
    assert exit_rule.distance is None
    assert exit_rule.rsi is not None
    assert exit_rule.rsi.timeframe == "base"
    assert exit_rule.rsi.period == 14
    assert exit_rule.long_exit_above == 70.0
    assert exit_rule.short_exit_below == 30.0


def test_load_external_config_accepts_user_variant_label() -> None:
    loaded = load_strategy_config(_bundle([_instance("baseline_long", variant="baseline_long")]))

    assert loaded.specs[0].variant == "baseline_long"


def test_load_external_config_derives_variant_when_omitted() -> None:
    instance = _instance("derived_variant", fast=21, anchor=55, slow=200)
    instance.pop("variant")

    loaded = load_strategy_config(_bundle([instance]))

    assert loaded.specs[0].variant == "ema_pullback_fast21_anchor55_slow200"


def test_load_external_config_accepts_enabled_trade_sides_mapping() -> None:
    loaded = load_strategy_config(
        _bundle([_instance("enabled_mapping", trade_sides={"enabled": ["long", "short"]})])
    )

    assert loaded.specs[0].trade_sides.enabled == ("long", "short")


def test_load_external_config_accepts_ui_friendly_trade_side_flags() -> None:
    loaded = load_strategy_config(
        _bundle([_instance("side_flags", trade_sides={"long": True, "short": False})])
    )

    assert loaded.specs[0].trade_sides.enabled == ("long",)


def test_load_external_config_rejects_non_bool_trade_side_flags() -> None:
    with pytest.raises(EmaPullbackInstanceValidationError, match="strategy.trade_sides.long"):
        load_strategy_config(_bundle([_instance("bad_side_flags", trade_sides={"long": "yes"})]))


def test_load_external_config_rejects_component_alias() -> None:
    instance = _instance("component_alias")
    strategy = instance["strategy"]
    assert isinstance(strategy, dict)
    trigger = strategy["trigger"]
    assert isinstance(trigger, dict)
    trigger.pop("component_id")
    trigger["component"] = "reclaim_anchor"

    with pytest.raises(EmaPullbackInstanceValidationError, match="component"):
        load_strategy_config(_bundle([instance]))


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


def test_loader_rejects_unknown_run_level_execution_fields() -> None:
    payload = _bundle([_instance()])
    execution = payload["execution"]
    assert isinstance(execution, dict)
    execution["leverage"] = 2

    with pytest.raises(ConfigValidationError, match="unknown execution field"):
        load_strategy_config(payload)


def test_instance_loader_rejects_unknown_family_fields() -> None:
    payload = _bundle([_instance()])
    payload["instances"][0]["strategy"]["family_extra"] = "bad"  # type: ignore[index]

    with pytest.raises(EmaPullbackInstanceValidationError, match="unknown field"):
        load_strategy_config(payload)


def test_instance_loader_rejects_external_config_id_alias() -> None:
    instance = _instance()
    instance.pop("instance_id")
    instance["external_config_id"] = "legacy"

    with pytest.raises(ConfigValidationError, match="external_config_id"):
        load_strategy_config(_bundle([instance]))


def test_instance_loader_rejects_instance_level_execution() -> None:
    instance = _instance()
    instance["execution"] = {"init_cash": 10000.0}

    with pytest.raises(EmaPullbackInstanceValidationError, match="unknown field"):
        load_strategy_config(_bundle([instance]))


def test_runner_does_not_load_candles_when_config_validation_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bad_instance = _instance()
    strategy = bad_instance["strategy"]
    assert isinstance(strategy, dict)
    strategy.pop("anchor_stack")
    path = _write_json(tmp_path / "bad.json", _bundle([bad_instance]))
    called = False

    def fail_if_called(*_args: object, **_kwargs: object) -> object:
        nonlocal called
        called = True
        raise AssertionError("load_candles_once must not run on invalid config")

    monkeypatch.setattr(runner, "load_candles_once", fail_if_called)

    with pytest.raises(EmaPullbackInstanceValidationError, match="anchor_stack is required"):
        runner.run_strategy_specs_from_config(path)
    assert called is False


def test_runner_applies_run_level_execution_from_external_config(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = _write_json(tmp_path / "good.json", _bundle([_instance()]))
    captured: dict[str, float] = {}

    monkeypatch.setattr(
        runner,
        "load_candles_once",
        lambda _cfg: SimpleNamespace(
            ohlcv=object(),
            candles_count=1,
            from_open_time_ms=1,
            to_open_time_ms=2,
        ),
    )

    def fake_run_strategy_spec(
        _spec: object,
        _ohlcv: object,
        *,
        init_cash: float,
        fees: float,
        slippage: float,
    ) -> object:
        captured.update({"init_cash": init_cash, "fees": fees, "slippage": slippage})
        return SimpleNamespace(to_payload=lambda: {"variant": "fake"})

    monkeypatch.setattr(runner, "run_strategy_spec", fake_run_strategy_spec)
    monkeypatch.setattr(runner, "comparison_row", lambda _result: {})
    monkeypatch.setattr(runner, "print_comparison_table", lambda _rows: None)
    monkeypatch.setattr(
        runner,
        "write_research_results",
        lambda _payload: (
            runner._ROOT / "research" / "results" / "latest.json",
            runner._ROOT / "research" / "results" / "runs" / "fake.json",
        ),
    )

    runner.run_strategy_specs_from_config(path)

    assert captured == {"init_cash": 10000.0, "fees": 0.0006, "slippage": 0.0001}


def test_instance_loader_rejects_top_level_component_shape() -> None:
    instance = _instance()
    strategy = instance["strategy"]
    assert isinstance(strategy, dict)
    instance["anchor_stack"] = strategy.pop("anchor_stack")

    with pytest.raises(EmaPullbackInstanceValidationError, match="unknown field"):
        load_strategy_config(_bundle([instance]))

