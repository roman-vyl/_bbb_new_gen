"""Research API BFF — component catalog and config draft endpoints."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

pytestmark = pytest.mark.workbench_api

from fastapi.testclient import TestClient

from research_api.main import app
from research_api.services import config_service


def _valid_draft() -> dict[str, object]:
    return {
        "config_version": 1,
        "experiment_id": "api_config_smoke",
        "family": "ema_pullback",
        "execution": {"init_cash": 10000.0, "fees": 0.0006, "slippage": 0.0001},
        "instances": [
            {
                "instance_id": "baseline",
                "variant": "baseline",
                "market": {"symbol": "BTCUSDT", "base_timeframe": "5m"},
                "strategy": {
                    "trade_sides": {"long": True, "short": False},
                    "anchor_stack": {
                        "source": "close",
                        "timeframe": "base",
                        "fast": 100,
                        "anchor": 200,
                        "slow": 1000,
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
                    "exits": [
                        {
                            "instance_id": "atr_sl",
                            "component_id": "atr_stop_loss",
                            "distance": {"timeframe": "base", "period": 14, "multiplier": 1.5},
                        },
                        {
                            "instance_id": "atr_tp",
                            "component_id": "atr_take_profit",
                            "distance": {"timeframe": "base", "period": 14, "multiplier": 4.0},
                        },
                    ],
                },
            }
        ],
    }


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_component_catalog_returns_ema_pullback_components(client: TestClient) -> None:
    res = client.get("/api/research/component-catalog?family=ema_pullback")
    assert res.status_code == 200
    body = res.json()
    assert body["family"] == "ema_pullback"
    assert any(
        c["component_id"] == "rsi_lookback_extreme_blocker" for c in body["components"]
    )
    setup_components = [c for c in body["components"] if c.get("role") == "setup"]
    assert [c["component_id"] for c in setup_components] == ["untouched_anchor_setup"]
    params = setup_components[0]["params_schema"]
    assert set(params) == {"lookback", "active_bars"}
    assert params["lookback"]["default"] == 50
    assert params["active_bars"]["default"] == 3
    reclaim_components = [c for c in body["components"] if c.get("component_id") == "reclaim_anchor"]
    assert len(reclaim_components) == 1
    reclaim_params = reclaim_components[0]["params_schema"]
    assert reclaim_params["lookback"]["default"] == 1
    assert reclaim_params["lookback"]["min"] == 1
    strong_components = [
        c for c in body["components"] if c.get("component_id") == "strong_reclaim_anchor"
    ]
    assert len(strong_components) == 1
    strong_params = strong_components[0]["params_schema"]
    assert strong_params["lookback"]["default"] == 1
    assert strong_params["lookback"]["min"] == 1


def test_validate_config_ok(client: TestClient) -> None:
    res = client.post("/api/research/config/validate", json=_valid_draft())
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert res.json()["errors"] == []


def test_validate_config_rejects_bad_instance(client: TestClient) -> None:
    draft = _valid_draft()
    instances = list(draft["instances"])  # type: ignore[index]
    inst = dict(instances[0])  # type: ignore[arg-type]
    strategy = dict(inst["strategy"])  # type: ignore[arg-type]
    strategy["trigger"] = {"component_id": "unknown_trigger"}
    inst["strategy"] = strategy
    instances[0] = inst
    draft["instances"] = instances

    res = client.post("/api/research/config/validate", json=draft)
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert body["errors"]


def test_serialize_invalid_draft_returns_requested_format(client: TestClient) -> None:
    draft = _valid_draft()
    draft["experiment_id"] = ""

    res = client.post("/api/research/config/serialize?format=yaml", json=draft)
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert body["format"] == "yaml"
    assert body["content"] == ""


def test_serialize_config_json(client: TestClient) -> None:
    res = client.post("/api/research/config/serialize?format=json", json=_valid_draft())
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["format"] == "json"
    parsed = json.loads(body["content"])
    assert parsed["schema_version"] == 1
    assert parsed["experiment_id"] == "api_config_smoke"


def test_save_config_writes_file(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configs_root = tmp_path / "configs"
    monkeypatch.setattr(config_service, "_CONFIGS_ROOT", configs_root)

    res = client.post(
        "/api/research/config/save",
        json={"draft": _valid_draft()},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["path"] is not None
    saved = configs_root / "ema_pullback" / "api_config_smoke.json"
    assert saved.exists()
    payload = json.loads(saved.read_text(encoding="utf-8"))
    assert payload["family"] == "ema_pullback"


def test_save_config_rejects_invalid_draft(client: TestClient) -> None:
    draft = _valid_draft()
    draft["experiment_id"] = ""

    res = client.post("/api/research/config/save", json={"draft": draft})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert body["path"] is None


@pytest.mark.parametrize(
    "family",
    [
        "unknown_family",
        "../ema_pullback",
        "ema_pullback/../../../etc",
        "foo/bar",
    ],
)
def test_config_state_rejects_bad_family(client: TestClient, family: str) -> None:
    res = client.get(f"/api/research/configs/state?family={family}")
    assert res.status_code == 400
    assert "unsupported family" in res.json()["detail"]


@pytest.mark.parametrize(
    "family",
    [
        "unknown_family",
        "../ema_pullback",
        "ema_pullback/foo",
    ],
)
def test_select_config_rejects_bad_family(client: TestClient, family: str) -> None:
    res = client.put(
        "/api/research/configs/selected",
        json={"family": family, "experiment_id": "any"},
    )
    assert res.status_code == 400
    assert "unsupported family" in res.json()["detail"]


def test_save_config_selects_saved_ema_pullback(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    configs_root = tmp_path / "configs"
    selection_file = configs_root / ".workbench_selection.json"
    monkeypatch.setattr(config_service, "_CONFIGS_ROOT", configs_root)
    monkeypatch.setattr(config_service, "_SELECTION_FILE", selection_file)

    res = client.post("/api/research/config/save", json={"draft": _valid_draft()})
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert selection_file.is_file()
    store = json.loads(selection_file.read_text(encoding="utf-8"))
    assert store["ema_pullback"] == "api_config_smoke"


def test_config_state_empty(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configs_root = tmp_path / "configs"
    monkeypatch.setattr(config_service, "_CONFIGS_ROOT", configs_root)
    monkeypatch.setattr(config_service, "_SELECTION_FILE", configs_root / ".workbench_selection.json")

    res = client.get("/api/research/configs/state?family=ema_pullback")
    assert res.status_code == 200
    body = res.json()
    assert body["family"] == "ema_pullback"
    assert body["configs"] == []
    assert body["draft"] is None


def test_config_state_loads_saved_config(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    configs_root = tmp_path / "configs"
    monkeypatch.setattr(config_service, "_CONFIGS_ROOT", configs_root)
    monkeypatch.setattr(config_service, "_SELECTION_FILE", configs_root / ".workbench_selection.json")

    save = client.post("/api/research/config/save", json={"draft": _valid_draft()})
    assert save.json()["ok"] is True

    res = client.get("/api/research/configs/state?family=ema_pullback")
    assert res.status_code == 200
    body = res.json()
    assert len(body["configs"]) == 1
    assert body["selected_experiment_id"] == "api_config_smoke"
    assert body["draft"]["experiment_id"] == "api_config_smoke"
    assert body["draft"]["instances"][0]["instance_id"] == "baseline"


def test_select_config_switches_draft(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    configs_root = tmp_path / "configs"
    monkeypatch.setattr(config_service, "_CONFIGS_ROOT", configs_root)
    monkeypatch.setattr(config_service, "_SELECTION_FILE", configs_root / ".workbench_selection.json")

    first = _valid_draft()
    client.post("/api/research/config/save", json={"draft": first})

    second = _valid_draft()
    second["experiment_id"] = "api_config_alt"
    instances = list(second["instances"])  # type: ignore[index]
    inst = dict(instances[0])  # type: ignore[arg-type]
    inst["instance_id"] = "alt"
    inst["variant"] = "alt"
    instances[0] = inst
    second["instances"] = instances
    client.post("/api/research/config/save", json={"draft": second})

    res = client.put(
        "/api/research/configs/selected",
        json={"family": "ema_pullback", "experiment_id": "api_config_alt"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["selected_experiment_id"] == "api_config_alt"
    assert body["draft"]["instances"][0]["instance_id"] == "alt"
