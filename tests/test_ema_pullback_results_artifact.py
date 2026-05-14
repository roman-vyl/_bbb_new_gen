"""Research result JSON artifact schema and writer."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from research.strategies.ema_pullback.execution.results import (
    build_research_run_payload,
    build_run_id,
    extract_trade_records,
    json_safe,
    write_research_results,
)
from research.strategies.ema_pullback.spec_instances import (
    make_ema_pullback_strategy_spec,
    variant_from_spec,
)

REQUIRED_TOP = (
    "run_id",
    "created_at",
    "report_schema_version",
    "family",
    "symbol",
    "timeframe",
    "candles",
    "data_range",
    "variants_count",
    "variants",
)

REQUIRED_VARIANT = (
    "variant",
    "config_id",
    "symbol",
    "timeframe",
    "strategy_spec",
    "metrics",
    "component_counters",
    "trade_records",
)

REQUIRED_METRICS = ("long", "short", "total", "open_trades")

REQUIRED_SIDE_METRICS = ("trades", "pnl", "return_pct", "profit_factor", "win_rate")

REQUIRED_TOTAL_EXTRAS = ("sharpe", "max_drawdown")

REQUIRED_OPEN_TRADES = ("long", "short", "total")

# Market for this file's payload fixtures only (not module defaults in config.py).
_ARTIFACT_TEST_SYMBOL = "BTCUSDT"
_ARTIFACT_TEST_TIMEFRAME = "1h"

REQUIRED_TRADE_FIELDS = (
    "trade_id",
    "direction",
    "status",
    "entry_time_ms",
    "exit_time_ms",
    "entry_price",
    "exit_price",
    "size",
    "pnl",
    "return_pct",
    "exit_reason",
)


def test_build_run_id_format() -> None:
    utc = datetime(2026, 5, 1, 18, 30, 0, tzinfo=timezone.utc)
    rid = build_run_id(utc, "ema_pullback", "BTCUSDT", "1h")
    assert rid == "2026-05-01T183000Z_ema_pullback_BTCUSDT_1h"


def test_json_safe_nan_becomes_null() -> None:
    assert json_safe(float("nan")) is None
    assert json_safe({"x": float("inf")}) == {"x": None}


def test_build_research_run_payload_top_level_keys() -> None:
    spec = make_ema_pullback_strategy_spec(
        symbol=_ARTIFACT_TEST_SYMBOL,
        base_timeframe=_ARTIFACT_TEST_TIMEFRAME,
    )
    assert spec.variant == variant_from_spec(spec)
    variant = {
        "variant": spec.variant,
        "config_id": "abc123",
        "symbol": _ARTIFACT_TEST_SYMBOL,
        "timeframe": _ARTIFACT_TEST_TIMEFRAME,
        "strategy_spec": {
            "variant": spec.variant,
            "symbol": _ARTIFACT_TEST_SYMBOL,
            "base_timeframe": _ARTIFACT_TEST_TIMEFRAME,
        },
        "metrics": {
            "long": {"trades": 0, "pnl": 0.0, "return_pct": 0.0, "profit_factor": None, "win_rate": None},
            "short": {"trades": 0, "pnl": 0.0, "return_pct": 0.0, "profit_factor": None, "win_rate": None},
            "total": {
                "trades": 0,
                "pnl": 0.0,
                "return_pct": 0.0,
                "profit_factor": None,
                "win_rate": None,
                "sharpe": 0.0,
                "max_drawdown": 0.0,
            },
            "open_trades": {"long": 0, "short": 0, "total": 0},
        },
        "component_counters": [],
        "trade_records": [],
    }
    created = datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)
    payload = build_research_run_payload(
        run_id="rid",
        created_at=created,
        family="ema_pullback",
        symbol=_ARTIFACT_TEST_SYMBOL,
        timeframe=_ARTIFACT_TEST_TIMEFRAME,
        candles_count=100,
        data_range_from_ms=1,
        data_range_to_ms=2,
        variants=[variant],
    )
    assert tuple(payload.keys()) == REQUIRED_TOP
    assert payload["report_schema_version"] == 3
    assert payload["data_range"] == {"from_open_time_ms": 1, "to_open_time_ms": 2}
    assert payload["variants_count"] == 1
    v0 = payload["variants"][0]
    for k in REQUIRED_VARIANT:
        assert k in v0
    for k in REQUIRED_METRICS:
        assert k in v0["metrics"]
    for side_k in REQUIRED_SIDE_METRICS:
        assert side_k in v0["metrics"]["long"]
        assert side_k in v0["metrics"]["short"]
        assert side_k in v0["metrics"]["total"]
    for extra in REQUIRED_TOTAL_EXTRAS:
        assert extra in v0["metrics"]["total"]
    for ok in REQUIRED_OPEN_TRADES:
        assert ok in v0["metrics"]["open_trades"]
    raw = json.dumps(json_safe(payload), ensure_ascii=False)
    assert "ema_pullback" in raw


def test_write_research_results_creates_latest_and_run(tmp_path: Path) -> None:
    results_dir = tmp_path / "results"
    payload = {
        "run_id": "2026-05-01T120000Z_ema_pullback_BTCUSDT_1h",
        "created_at": "2026-05-01T12:00:00Z",
        "report_schema_version": 3,
        "family": "ema_pullback",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "candles": 1,
        "data_range": {"from_open_time_ms": 1, "to_open_time_ms": 2},
        "variants_count": 0,
        "variants": [],
    }
    latest, run_p = write_research_results(payload, results_dir=results_dir)
    assert latest == results_dir / "latest.json"
    assert run_p == results_dir / "runs" / f"{payload['run_id']}.json"
    assert latest.read_text(encoding="utf-8") == run_p.read_text(encoding="utf-8")
    roundtrip = json.loads(latest.read_text(encoding="utf-8"))
    assert roundtrip["run_id"] == payload["run_id"]


@pytest.mark.optional_vectorbt
def test_extract_trade_records_closed_and_open() -> None:
    pd = pytest.importorskip("pandas")
    vbt = pytest.importorskip("vectorbt")

    idx = pd.date_range("2024-01-01", periods=5, freq="h", tz="UTC")
    close = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0], index=idx)
    entries = pd.Series([False, True, False, False, False], index=idx)
    exits_closed = pd.Series([False, False, False, True, False], index=idx)
    pf_c = vbt.Portfolio.from_signals(close, entries, exits_closed, freq="1h")
    rec_c = extract_trade_records(pf_c, close)
    assert len(rec_c) == 1
    t0 = rec_c[0]
    for k in REQUIRED_TRADE_FIELDS:
        assert k in t0
    assert t0["status"] == "closed"
    assert t0["direction"] == "long"
    assert t0["entry_time_ms"] is not None
    assert t0["exit_time_ms"] is not None

    exits_open = pd.Series([False, False, False, False, False], index=idx)
    pf_o = vbt.Portfolio.from_signals(close, entries, exits_open, freq="1h")
    rec_o = extract_trade_records(pf_o, close)
    assert rec_o[0]["status"] == "open"
    assert rec_o[0]["exit_time_ms"] is None
    assert rec_o[0]["exit_price"] is None

    short_entries = pd.Series([False, True, False, False, False], index=idx)
    short_exits = pd.Series([False, False, False, True, False], index=idx)
    no_long = pd.Series(False, index=idx)
    pf_s = vbt.Portfolio.from_signals(
        close,
        no_long,
        no_long,
        short_entries=short_entries,
        short_exits=short_exits,
        freq="1h",
    )
    rec_s = extract_trade_records(pf_s, close)
    assert len(rec_s) == 1
    assert rec_s[0]["status"] == "closed"
    assert rec_s[0]["direction"] == "short"


def test_variant_payload_from_instance_matches_schema() -> None:
    from research.strategies.ema_pullback.execution.result_models import (
        OpenTradesBreakdown,
        SideMetrics,
        VariantMetrics,
        VariantResult,
    )

    spec = make_ema_pullback_strategy_spec()
    assert spec.variant == variant_from_spec(spec)
    vr = VariantResult(
        variant=spec.variant,
        config_id="abc123",
        symbol=spec.symbol,
        timeframe=spec.base_timeframe,
        strategy_spec={"variant": spec.variant},
        metrics=VariantMetrics(
            long=SideMetrics(trades=1, pnl=2.0, return_pct=0.02, profit_factor=None, win_rate=1.0),
            short=SideMetrics(trades=0, pnl=0.0, return_pct=0.0, profit_factor=None, win_rate=None),
            total=SideMetrics(trades=1, pnl=2.0, return_pct=0.02, profit_factor=None, win_rate=1.0),
            sharpe=0.1,
            max_drawdown=-0.05,
            open_trades=OpenTradesBreakdown(long=0, short=1, total=1),
        ),
        component_counters=[],
        trade_records=[],
    ).to_payload()
    for k in REQUIRED_VARIANT:
        assert k in vr
    assert vr["variant"] == vr["strategy_spec"]["variant"]
    assert isinstance(vr["trade_records"], list)
    assert isinstance(vr["component_counters"], list)
    assert tuple(vr["metrics"].keys()) == REQUIRED_METRICS
    assert vr["metrics"]["short"]["profit_factor"] is None
    assert vr["metrics"]["total"]["sharpe"] == 0.1
    assert vr["metrics"]["total"]["max_drawdown"] == -0.05
    assert vr["metrics"]["open_trades"] == {"long": 0, "short": 1, "total": 1}
    json.dumps(json_safe(vr), ensure_ascii=False)
