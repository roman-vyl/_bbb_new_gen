"""RunReport contract — reject prototype fields, accept current writer output."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

pytestmark = pytest.mark.workbench_api

from research_api.contracts.runs import RunReport, TradeRecord
from research_api.services.results_reader import parse_run_report


def _minimal_trade(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "trade_id": 1,
        "direction": "long",
        "status": "closed",
        "entry_time_ms": 1_000_000,
        "exit_time_ms": 1_100_000,
        "entry_price": 100.0,
        "exit_price": 101.0,
        "exit_reason": "signal:exit",
        "size": 1.0,
        "pnl": 1.0,
        "return_pct": 0.01,
    }
    base.update(overrides)
    return base


def _minimal_report_payload(**variant_overrides: object) -> dict[str, object]:
    variant: dict[str, object] = {
        "variant": "exp_a",
        "config_id": "cfg_a",
        "symbol": "BTCUSDT",
        "timeframe": "5m",
        "strategy_spec": {"variant": "exp_a"},
        "metrics": {
            "long": {
                "trades": 1,
                "pnl": 1.0,
                "return_pct": 0.01,
                "profit_factor": None,
                "win_rate": 1.0,
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
                "pnl": 1.0,
                "return_pct": 0.01,
                "profit_factor": None,
                "win_rate": 1.0,
                "sharpe": 0.1,
                "max_drawdown": -0.01,
            },
            "open_trades": {"long": 0, "short": 0, "total": 0},
        },
        "component_counters": [],
        "trade_records": [_minimal_trade()],
    }
    variant.update(variant_overrides)
    return {
        "run_id": "2026-01-01T000000Z_ema_pullback_BTCUSDT_5m_test",
        "created_at": "2026-01-01T00:00:00Z",
        "report_schema_version": 5,
        "family": "ema_pullback",
        "symbol": "BTCUSDT",
        "timeframe": "5m",
        "candles": 10,
        "data_range": {"from_open_time_ms": 1_000_000, "to_open_time_ms": 2_000_000},
        "variants_count": 1,
        "variants": [variant],
    }


def test_parse_run_report_accepts_v5_minimal_payload() -> None:
    report = parse_run_report(_minimal_report_payload())
    assert report.report_schema_version == 5
    assert report.variants[0].trade_records[0].trade_id == 1


def test_trade_record_accepts_managed_path_bar_indices_and_break_even() -> None:
    trade = TradeRecord.model_validate(
        _minimal_trade(
            entry_idx=835,
            exit_idx=846,
            break_even={
                "enabled": True,
                "instance_id": "be_ao",
                "trigger_r": 1.0,
                "trigger_price": 101.5,
                "triggered": True,
                "trigger_time_ms": 1_050_000,
                "stop_moved_to": 100.0,
                "initial_stop_price": 98.0,
                "initial_risk": 2.0,
                "active_stop_management_source": "always_on",
            },
        )
    )
    assert trade.entry_idx == 835
    assert trade.break_even is not None
    assert trade.break_even.triggered is True
    report = parse_run_report(
        _minimal_report_payload(
            trade_records=[
                _minimal_trade(
                    entry_idx=10,
                    exit_idx=20,
                    break_even={
                        "enabled": True,
                        "instance_id": "be_al",
                        "trigger_r": 2.0,
                        "triggered": False,
                        "initial_stop_price": 50.0,
                        "initial_risk": 5.0,
                        "active_stop_management_source": "profile",
                    },
                )
            ],
        )
    )
    assert report.variants[0].trade_records[0].break_even is not None


def test_parse_run_report_rejects_prototype_trade_context_ref() -> None:
    payload = _minimal_report_payload(
        trade_records=[_minimal_trade(context_ref="htf")],
    )
    with pytest.raises(ValidationError, match="context_ref"):
        parse_run_report(payload)


def test_trade_record_model_forbids_context_ref() -> None:
    with pytest.raises(ValidationError, match="context_ref"):
        TradeRecord.model_validate(_minimal_trade(context_ref="htf"))


def test_parse_run_report_accepts_entry_setup_diagnostics_namespaced() -> None:
    payload = _minimal_report_payload(
        trade_records=[
            _minimal_trade(
                entry_setup_diagnostics={
                    "untouched_anchor": {
                        "side": "long",
                    },
                    "bounce_counter": {
                        "trend_episode_id": 7,
                        "effective_bounce_number": 2,
                        "completed_bounce_count": 1,
                        "side": "long",
                    },
                },
            ),
        ],
    )
    report = parse_run_report(payload)
    diag = report.variants[0].trade_records[0].entry_setup_diagnostics
    assert set(diag.keys()) == {"untouched_anchor", "bounce_counter"}
    assert diag["bounce_counter"]["trend_episode_id"] == 7
    assert diag["bounce_counter"]["effective_bounce_number"] == 2


def test_parse_run_report_defaults_missing_entry_setup_diagnostics() -> None:
    report = parse_run_report(_minimal_report_payload())
    assert report.variants[0].trade_records[0].entry_setup_diagnostics == {}


def test_trade_record_rejects_flat_bounce_counter_entry_fields() -> None:
    with pytest.raises(ValidationError, match="entry_trend_episode_id"):
        TradeRecord.model_validate(_minimal_trade(entry_trend_episode_id=7))
