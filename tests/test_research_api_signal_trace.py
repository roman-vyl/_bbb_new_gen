"""Signal trace endpoint tests."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.workbench_api

from fastapi.testclient import TestClient

from research_api.contracts.signal_trace import SignalTraceBundle
from research_api.main import app
from research_api.services.signal_trace_service import _warmup_bars_ms
from research.strategies.ema_pullback.component_builders import trade_management
from research.strategies.ema_pullback.spec_instances import make_ema_pullback_strategy_spec
from tests.ema_pullback_context_helpers import exit_policy_htf_consumption, htf_strategy_contexts


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
        component_event_markers=[
            {
                "time": 1,
                "role": "entry_block",
                "side": "long",
                "component_id": "rsi_lookback_extreme_blocker",
                "instance_id": "rsi1",
                "feature_family": "rsi",
                "source_timeframe": "1h",
                "base_timeframe": "5m",
                "rsi_value": 85.0,
                "condition": "extreme_seen",
                "params": {"threshold": 80.0},
                "label": "X-RSI",
                "tooltip": None,
            }
        ],
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
    assert body["component_event_markers"][0]["role"] == "entry_block"
    assert body["component_event_markers"][0]["feature_family"] == "rsi"


def test_signal_trace_warmup_ignores_htf_without_context_consumption() -> None:
    """always_on-only spec: no strategy.contexts → warmup is anchor/setup only."""
    spec = make_ema_pullback_strategy_spec(
        base_timeframe="5m",
        fast_period=20,
        anchor_period=50,
        slow_period=200,
        setup_lookback=50,
    )
    assert spec.contexts == ()
    warmup_ms = _warmup_bars_ms(spec, "5m")
    htf_slow_warmup_ms = 200 * 4 * 60 * 60 * 1000
    assert warmup_ms < htf_slow_warmup_ms


def test_signal_trace_warmup_accounts_for_htf_context() -> None:
    """Target shape: strategy.contexts.htf drives HTF warmup (via feature plan)."""
    from research.strategies.ema_pullback.component_builders import exit_rsi

    spec = make_ema_pullback_strategy_spec(
        base_timeframe="5m",
        fast_period=20,
        anchor_period=50,
        slow_period=200,
        setup_lookback=50,
        contexts=htf_strategy_contexts(
            timeframe="4h",
            fast_period=20,
            anchor_period=50,
            slow_period=200,
        ),
        trade_management_spec=trade_management(
            exit_policy_spec=exit_policy_htf_consumption(
                aligned=(exit_rsi(instance_id="rsi_profile"),),
            ),
        ),
    )
    assert len(spec.contexts) == 1
    warmup_ms = _warmup_bars_ms(spec, "5m")
    assert warmup_ms >= 200 * 4 * 60 * 60 * 1000
