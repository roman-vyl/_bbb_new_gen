"""Research API BFF — runs endpoints.

Requires: ``pip install -e ".[dev,workbench-api]"`` (fastapi, httpx).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

pytestmark = pytest.mark.workbench_api

from fastapi.testclient import TestClient

from research_api.main import app
from research_api.services.results_reader import (
    UnsupportedSchemaVersionError,
    list_run_summaries,
    load_run_report,
)
from research_api.services.run_id import InvalidRunIdError, validate_run_id

_SAMPLE_REPORT = {
    "run_id": "2026-05-01T120000Z_ema_pullback_BTCUSDT_5m",
    "created_at": "2026-05-01T12:00:00Z",
    "report_schema_version": 3,
    "family": "ema_pullback",
    "symbol": "BTCUSDT",
    "timeframe": "5m",
    "candles": 10,
    "data_range": {"from_open_time_ms": 1, "to_open_time_ms": 2},
    "variants_count": 1,
    "variants": [
        {
            "variant": "v1",
            "config_id": "cfg",
            "symbol": "BTCUSDT",
            "timeframe": "5m",
            "strategy_spec": {"variant": "v1"},
            "metrics": {
                "long": {
                    "trades": 0,
                    "pnl": 0.0,
                    "return_pct": 0.0,
                    "profit_factor": None,
                    "win_rate": None,
                },
                "short": {
                    "trades": 0,
                    "pnl": 0.0,
                    "return_pct": 0.0,
                    "profit_factor": None,
                    "win_rate": None,
                },
                "total": {
                    "trades": 1,
                    "pnl": 10.0,
                    "return_pct": 0.01,
                    "profit_factor": None,
                    "win_rate": None,
                    "sharpe": 0.0,
                    "max_drawdown": 0.0,
                },
                "open_trades": {"long": 0, "short": 0, "total": 0},
            },
            "component_counters": [],
            "trade_records": [
                {
                    "trade_id": 1,
                    "direction": "long",
                    "status": "closed",
                    "entry_time_ms": 1000,
                    "exit_time_ms": 2000,
                    "entry_price": 1.0,
                    "exit_price": 1.1,
                    "size": 0.1,
                    "pnl": 1.0,
                    "return_pct": 0.01,
                    "exit_reason": "stop_loss:sl1",
                }
            ],
        }
    ],
}


def _write_artifacts(results_dir: Path, *, schema_version: int = 3) -> str:
    payload = {**_SAMPLE_REPORT, "report_schema_version": schema_version}
    run_id = str(payload["run_id"])
    runs = results_dir / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, indent=2)
    (runs / f"{run_id}.json").write_text(text, encoding="utf-8")
    (results_dir / "latest.json").write_text(text, encoding="utf-8")
    return run_id


def test_list_and_load_run(tmp_path: Path) -> None:
    run_id = _write_artifacts(tmp_path)
    summaries = list_run_summaries(results_dir=tmp_path)
    assert len(summaries) == 1
    assert summaries[0].run_id == run_id

    report = load_run_report(run_id=run_id, results_dir=tmp_path)
    assert report.report_schema_version == 3
    assert report.variants[0].trade_overlays[0].exit_reason == "stop_loss:sl1"


def test_unsupported_schema_version(tmp_path: Path) -> None:
    _write_artifacts(tmp_path, schema_version=99)
    with pytest.raises(UnsupportedSchemaVersionError):
        list_run_summaries(results_dir=tmp_path)


def test_http_runs_endpoints(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import research_api.services.results_reader as reader

    monkeypatch.setattr(reader, "default_results_dir", lambda: tmp_path)
    run_id = _write_artifacts(tmp_path)

    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok"}

    listed = client.get("/api/research/runs")
    assert listed.status_code == 200
    assert listed.json()[0]["run_id"] == run_id

    latest = client.get("/api/research/runs/latest")
    assert latest.status_code == 200
    assert latest.json()["run_id"] == run_id

    one = client.get(f"/api/research/runs/{run_id}")
    assert one.status_code == 200
    assert one.json()["variants"][0]["trade_records"][0]["exit_reason"] == "stop_loss:sl1"

    missing = client.get("/api/research/runs/does-not-exist")
    assert missing.status_code == 404


def test_validate_run_id_rejects_unsafe() -> None:
    with pytest.raises(InvalidRunIdError):
        validate_run_id("../latest")
    with pytest.raises(InvalidRunIdError):
        validate_run_id("foo/bar")
    with pytest.raises(InvalidRunIdError):
        validate_run_id("foo\\bar")


def test_http_invalid_run_id_returns_400(monkeypatch: pytest.MonkeyPatch) -> None:
    import research_api.services.results_reader as reader

    monkeypatch.setattr(reader, "default_results_dir", lambda: Path("/unused"))

    client = TestClient(app)
    # Single path segment after decode (encoded ``/`` is rejected by the ASGI stack with 404).
    for bad_id in ("%2E%2E", "foo%5Cbar", "bad%20id", "foo%40bar"):
        resp = client.get(f"/api/research/runs/{bad_id}")
        assert resp.status_code == 400, bad_id
        assert "Invalid run_id" in resp.json()["detail"]


def test_http_missing_valid_run_id_returns_404(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import research_api.services.results_reader as reader

    monkeypatch.setattr(reader, "default_results_dir", lambda: tmp_path)

    client = TestClient(app)
    valid_missing = "2026-05-01T120000Z_ema_pullback_BTCUSDT_5m"
    resp = client.get(f"/api/research/runs/{valid_missing}")
    assert resp.status_code == 404


def test_http_unsupported_schema(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import research_api.services.results_reader as reader

    monkeypatch.setattr(reader, "default_results_dir", lambda: tmp_path)
    _write_artifacts(tmp_path, schema_version=99)

    client = TestClient(app)
    resp = client.get("/api/research/runs")
    assert resp.status_code == 422
    assert "Unsupported report_schema_version" in resp.json()["detail"]
