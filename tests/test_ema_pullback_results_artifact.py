"""Stage 9: research result JSON artifact schema and writer."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from research.strategies.ema_pullback.config import DEFAULT_CONFIG, StrategyConfig
from research.strategies.ema_pullback.instance import StrategyInstance
from research.strategies.ema_pullback.execution.results import (
    build_research_run_payload,
    build_run_id,
    extract_trade_records,
    json_safe,
    write_research_results,
)

REQUIRED_TOP = (
    "run_id",
    "created_at",
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
    "feature_profile",
    "components",
    "trade_management_profile",
    "params",
    "metrics",
    "trade_records",
)

COMPONENT_ROLES = ("direction", "blockers", "setup", "trigger", "exits", "risk")

REQUIRED_METRICS = ("trades", "sharpe", "profit_factor", "max_drawdown")

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
    inst = StrategyInstance.from_config(DEFAULT_CONFIG)
    cfg = inst.config
    variant = {
        "variant": cfg.variant,
        "config_id": inst.config_id,
        "symbol": cfg.symbol,
        "timeframe": cfg.timeframe,
        "feature_profile": cfg.feature_profile,
        "components": {k: getattr(cfg, f"{k}_component") for k in COMPONENT_ROLES},
        "trade_management_profile": cfg.trade_management_profile,
        "params": {
            "ema_fast": cfg.ema_fast,
            "ema_slow": cfg.ema_slow,
            "init_cash": cfg.init_cash,
            "fees": cfg.fees,
            "slippage": cfg.slippage,
        },
        "metrics": {"trades": 0, "sharpe": 0.0, "profit_factor": 1.0, "max_drawdown": 0.0},
        "trade_records": [],
    }
    created = datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)
    payload = build_research_run_payload(
        run_id="rid",
        created_at=created,
        family=cfg.family,
        symbol=cfg.symbol,
        timeframe=cfg.timeframe,
        candles_count=100,
        data_range_from_ms=1,
        data_range_to_ms=2,
        variants=[variant],
    )
    assert tuple(payload.keys()) == REQUIRED_TOP
    assert payload["data_range"] == {"from_open_time_ms": 1, "to_open_time_ms": 2}
    assert payload["variants_count"] == 1
    v0 = payload["variants"][0]
    for k in REQUIRED_VARIANT:
        assert k in v0
    assert tuple(v0["components"].keys()) == COMPONENT_ROLES
    for k in REQUIRED_METRICS:
        assert k in v0["metrics"]
    raw = json.dumps(json_safe(payload), ensure_ascii=False)
    assert "ema_pullback" in raw


def test_write_research_results_creates_latest_and_run(tmp_path: Path) -> None:
    results_dir = tmp_path / "results"
    payload = {
        "run_id": "2026-05-01T120000Z_ema_pullback_BTCUSDT_1h",
        "created_at": "2026-05-01T12:00:00Z",
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


def test_variant_payload_from_instance_matches_schema() -> None:
    pd = pytest.importorskip("pandas")
    pytest.importorskip("vectorbt")
    from research.strategies.ema_pullback.run import _run_instance_on_ohlcv

    n = 400
    idx = pd.date_range("2024-01-01", periods=n, freq="h", tz="UTC")
    # Choppy series so the backtest mixes wins and losses (finite profit factor).
    close = 100.0 + pd.Series([((i % 7) - 3) * 0.8 for i in range(n)], dtype=float, index=idx).cumsum()
    ohlcv = pd.DataFrame(
        {
            "open": close,
            "high": close + 0.1,
            "low": close - 0.1,
            "close": close,
            "volume": 1.0,
        },
        index=idx,
    )
    cfg = StrategyConfig(
        family="ema_pullback",
        variant="unit_variant",
        symbol="BTCUSDT",
        timeframe="1h",
        db_path=None,
        ema_fast=5,
        ema_slow=15,
        init_cash=10_000.0,
        fees=0.0001,
        slippage=0.0001,
    )
    instance = StrategyInstance.from_config(cfg)
    vr = _run_instance_on_ohlcv(instance, ohlcv)
    for k in REQUIRED_VARIANT:
        assert k in vr
    assert tuple(vr["components"].keys()) == COMPONENT_ROLES
    assert isinstance(vr["trade_records"], list)
    json.dumps(json_safe(vr), ensure_ascii=False)
