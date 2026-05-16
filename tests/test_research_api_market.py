"""Research API BFF — market candles and EMA.

Requires: ``pip install -e ".[dev,workbench-api]"``.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.workbench_api

from fastapi.testclient import TestClient

from research_api.contracts.chart import ChartBar
from research_api.main import app
from research_api.services.indicators import compute_ema_points
from research_api.services.market_reader import candle_to_chart_bar, fetch_chart_bars, fetch_ema_points
from data_engine.contracts import Candle
from data_engine.store.db import Db


def _seed_candles(db_path, *, count: int = 5, step_ms: int = 300_000) -> tuple[str, str, int, int]:
    db = Db(db_path)
    db.apply_ddl()
    start = 1_714_550_400_000
    rows = [
        Candle(
            "BTCUSDT",
            "5m",
            start + i * step_ms,
            100.0 + i,
            101.0 + i,
            99.0 + i,
            100.5 + i,
            10.0 + i,
        )
        for i in range(count)
    ]
    db.upsert(rows)
    from_ms = start
    to_ms = start + count * step_ms
    return "BTCUSDT", "5m", from_ms, to_ms


def test_candle_to_chart_bar_time_seconds() -> None:
    bar = candle_to_chart_bar(
        Candle("BTCUSDT", "5m", 1_714_550_400_000, 1, 2, 0.5, 1.5, 3),
    )
    assert bar.time == 1_714_550_400


def test_fetch_chart_bars_and_ema(tmp_path) -> None:
    symbol, tf, from_ms, to_ms = _seed_candles(tmp_path / "market.sqlite")
    bars = fetch_chart_bars(
        symbol=symbol,
        timeframe=tf,
        from_ms=from_ms,
        to_ms=to_ms,
        db_path=tmp_path / "market.sqlite",
    )
    assert len(bars) == 5
    assert bars[0].time == from_ms // 1000

    ema = fetch_ema_points(
        symbol=symbol,
        timeframe=tf,
        period=2,
        from_ms=from_ms,
        to_ms=to_ms,
        db_path=tmp_path / "market.sqlite",
    )
    assert len(ema) == 5
    assert ema[0].time == bars[0].time


def test_compute_ema_points_matches_span2() -> None:
    bars = [
        ChartBar(time=1, open=1, high=1, low=1, close=10, volume=1),
        ChartBar(time=2, open=1, high=1, low=1, close=20, volume=1),
    ]
    ema = compute_ema_points(bars, period=2)
    assert ema[0].value == 10.0
    assert ema[1].value == pytest.approx((2 / 3) * 20 + (1 / 3) * 10)


def test_http_market_endpoints(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    import research_api.services.market_reader as reader

    db_file = tmp_path / "market.sqlite"
    symbol, tf, from_ms, to_ms = _seed_candles(db_file)

    class _Settings:
        db_path = db_file

    monkeypatch.setattr(reader, "Settings", lambda: _Settings())

    client = TestClient(app)
    candles = client.get(
        "/api/market/candles",
        params={"symbol": symbol, "timeframe": tf, "from": from_ms, "to": to_ms},
    )
    assert candles.status_code == 200
    assert len(candles.json()) == 5

    ema = client.get(
        "/api/market/indicators/ema",
        params={
            "symbol": symbol,
            "timeframe": tf,
            "period": 2,
            "from": from_ms,
            "to": to_ms,
        },
    )
    assert ema.status_code == 200
    assert len(ema.json()) == 5

    bad = client.get(
        "/api/market/candles",
        params={"symbol": symbol, "timeframe": tf, "from": to_ms, "to": from_ms},
    )
    assert bad.status_code == 400


def test_http_missing_db_returns_503(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    import research_api.services.market_reader as reader

    missing = tmp_path / "missing.sqlite"

    class _Settings:
        db_path = missing

    monkeypatch.setattr(reader, "Settings", lambda: _Settings())

    client = TestClient(app)
    resp = client.get(
        "/api/market/candles",
        params={"symbol": "BTCUSDT", "timeframe": "5m", "from": 0, "to": 300_000},
    )
    assert resp.status_code == 503
