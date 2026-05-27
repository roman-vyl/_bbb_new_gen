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


def test_parse_run_report_rejects_prototype_trade_context_ref() -> None:
    payload = _minimal_report_payload(
        trade_records=[_minimal_trade(context_ref="htf")],
    )
    with pytest.raises(ValidationError, match="context_ref"):
        parse_run_report(payload)


def test_trade_record_model_forbids_context_ref() -> None:
    with pytest.raises(ValidationError, match="context_ref"):
        TradeRecord.model_validate(_minimal_trade(context_ref="htf"))
