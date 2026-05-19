"""Signal trace endpoint tests."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.workbench_api

from fastapi.testclient import TestClient

from research_api.contracts.signal_trace import SignalTraceBundle
from research_api.main import app


def test_signal_trace_endpoint_returns_bundle(monkeypatch: pytest.MonkeyPatch) -> None:
    sample = SignalTraceBundle(
        times=[1, 2],
        meta={
            "variant": "v1",
            "component_ids": {
                "direction": "ema_anchor_stack_trend",
                "setup": "untouched_anchor_setup",
                "trigger": "reclaim_anchor",
                "risk": "no_risk_filter",
            },
            "setup_params": {"lookback": 50, "active_bars": 3},
            "blocker_instances": [{"instance_id": "no_blockers", "component_id": "no_blockers"}],
        },
        long={
            "direction_ok": [True, False],
            "blockers_ok": [True, True],
            "setup_ok": [False, True],
            "trigger_ok": [True, True],
            "risk_ok": [True, True],
            "signal_entry": [False, False],
            "stop_ready": [True, True],
            "portfolio_entry": [False, False],
            "internals": {},
        },
        short={
            "direction_ok": [False, False],
            "blockers_ok": [True, True],
            "setup_ok": [False, False],
            "trigger_ok": [False, False],
            "risk_ok": [True, True],
            "signal_entry": [False, False],
            "stop_ready": [True, True],
            "portfolio_entry": [False, False],
            "internals": {},
        },
    )

    def _fake_fetch(**_: object) -> SignalTraceBundle:
        return sample

    monkeypatch.setattr(
        "research_api.routers.research_runs.fetch_signal_trace_bundle",
        _fake_fetch,
    )

    client = TestClient(app)
    res = client.get(
        "/api/research/runs/run1/signal-trace",
        params={"variant": "v1", "from": 0, "to": 1000},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["times"] == [1, 2]
    assert body["long"]["setup_ok"] == [False, True]
