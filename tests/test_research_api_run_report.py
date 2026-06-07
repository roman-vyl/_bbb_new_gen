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


def _trade_management_block(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "phase_at_exit": "runner",
        "max_phase_reached": "runner",
        "active_stop_source_at_exit": None,
        "active_stop_price_at_exit": None,
        "exit_layer": "stop_loss",
        "exit_rule_id": "atr_sl",
        "exit_component_id": "atr_stop_loss",
        "best_price_before_exit": 106.0,
        "giveback_from_best_price_pct": 0.01,
        "capture_ratio": 0.5,
        "mfe_pct": 0.06,
        "bars_to_proven": 1,
        "mfe_at_proven_pct": 0.02,
        "bars_to_protected": 2,
        "mfe_at_protected_pct": 0.04,
        "bars_to_runner": 4,
        "mfe_at_runner_pct": 0.06,
    }
    base.update(overrides)
    return base


def _trade_management_event(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "trade_id": "1",
        "time_ms": 1_050_000,
        "bar_index": 5,
        "side": "long",
        "event_type": "phase_changed",
        "from_phase": "initial_risk",
        "to_phase": "proven",
        "rule_id": "to_proven_at_1atr",
        "component_id": None,
        "price": 102.0,
        "stop_price": None,
        "mfe_pct": 0.02,
        "mae_pct": 0.01,
        "bars_in_trade": 2,
        "metadata": {"condition_type": "mfe_atr"},
    }
    base.update(overrides)
    return base


def _trade_management_summary_fixture() -> dict[str, object]:
    return {
        "by_phase_reached": {
            "initial_risk": {"trade_count": 1, "share_of_all_trades": 1.0},
            "runner": {"trade_count": 1, "share_of_all_trades": 1.0},
        },
        "phase_transition_counts": {"proven": 1, "runner": 1},
        "exit_layer_breakdown": {"stop_loss": 1},
        "active_stop_source_breakdown": {},
        "runner_capture_summary": {"trade_count": 1, "avg_capture_ratio": 0.5},
        "protected_trade_summary": {
            "trade_count": 1,
            "protected_not_runner_count": 0,
        },
    }


def test_parse_run_report_accepts_old_report_without_trade_management_fields() -> None:
    report = parse_run_report(_minimal_report_payload())
    variant = report.variants[0]
    trade = variant.trade_records[0]

    assert trade.trade_management is None
    assert variant.trade_management_events is None
    assert variant.metrics.trade_management_summary is None


def test_parse_run_report_preserves_diagnostic_only_trade_management_fields() -> None:
    payload = _minimal_report_payload(
        trade_management_events=[
            _trade_management_event(),
            _trade_management_event(
                event_type="exit_executed",
                from_phase="runner",
                to_phase=None,
                bar_index=8,
            ),
        ],
        metrics={
            **_minimal_report_payload()["variants"][0]["metrics"],  # type: ignore[index]
            "trade_management_summary": _trade_management_summary_fixture(),
        },
        trade_records=[_minimal_trade(trade_management=_trade_management_block())],
    )
    payload["report_schema_version"] = 6

    report = parse_run_report(payload)
    variant = report.variants[0]
    trade = variant.trade_records[0]

    assert trade.trade_management is not None
    assert trade.trade_management.phase_at_exit == "runner"
    assert trade.trade_management.bars_to_runner == 4
    assert variant.trade_management_events is not None
    assert len(variant.trade_management_events) == 2
    assert variant.trade_management_events[0].event_type == "phase_changed"
    assert variant.trade_management_events[1].event_type == "exit_executed"
    assert variant.metrics.trade_management_summary is not None
    assert variant.metrics.trade_management_summary["runner_capture_summary"]["trade_count"] == 1


def test_parse_run_summary_report_preserves_trade_management_summary_without_events() -> None:
    from research_api.services.results_reader import parse_run_summary_report

    variant = _minimal_report_payload()["variants"][0]
    assert isinstance(variant, dict)
    metrics = variant["metrics"]
    assert isinstance(metrics, dict)
    metrics["trade_management_summary"] = _trade_management_summary_fixture()
    compact_payload = {
        "run_id": "2026-01-01T000000Z_ema_pullback_BTCUSDT_5m_test",
        "created_at": "2026-01-01T00:00:00Z",
        "report_schema_version": 6,
        "family": "ema_pullback",
        "symbol": "BTCUSDT",
        "timeframe": "5m",
        "data_range": {"from_open_time_ms": 1_000_000, "to_open_time_ms": 2_000_000},
        "variants_count": 1,
        "variants": [
            {
                **variant,
                "trade_records_count": 1,
                "closed_trades_count": 1,
                "open_trades_count": 0,
            }
        ],
        "artifact_kind": "run_summary",
        "summary_schema_version": 1,
        "source_report_path": "research/results/runs/2026-01-01T000000Z_ema_pullback_BTCUSDT_5m_test.json",
    }

    summary = parse_run_summary_report(compact_payload)
    compact_variant = summary.variants[0]

    assert summary.artifact_kind == "run_summary"
    assert compact_variant.metrics.trade_management_summary is not None
    assert compact_variant.metrics.trade_management_summary["phase_transition_counts"]["runner"] == 1
    assert not hasattr(compact_variant, "trade_management_events")
    assert compact_variant.trade_records_count == 1
