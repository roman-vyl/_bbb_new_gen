from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.config import DEFAULT_EXECUTION_CONFIG
from research.strategies.ema_pullback.execution.result_models import (
    LoadedCandles,
    VariantMetrics,
    VariantResult,
)
from research.strategies.ema_pullback.execution.results import (
    build_research_run_payload,
    write_research_results,
)
from research.strategies.ema_pullback.execution.runner import run_active_specs
from research.strategies.ema_pullback.spec_instances import ema_pullback_fast20_anchor200_slow1000_spec


def _ohlcv() -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=5, freq="h", tz="UTC")
    close = pd.Series([100.0, 101.0, 102.0, 103.0, 104.0], index=idx)
    return pd.DataFrame(
        {
            "open": close,
            "high": close + 0.1,
            "low": close - 0.1,
            "close": close,
            "volume": 1.0,
        },
        index=idx,
    )


def test_runner_uses_new_variant(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, str] = {}
    spec = ema_pullback_fast20_anchor200_slow1000_spec()

    def fake_load(_: object) -> LoadedCandles:
        return LoadedCandles(
            ohlcv=_ohlcv(),
            candles_count=5,
            from_open_time_ms=1,
            to_open_time_ms=5,
        )

    def fake_run(spec_arg: object, ohlcv: object, **_: object) -> VariantResult:
        assert ohlcv is not None
        seen["variant"] = spec_arg.variant
        return VariantResult(
            variant=spec_arg.variant,
            config_id="abc123",
            strategy_spec=spec_arg,
            metrics=VariantMetrics(trades=1, sharpe=1.0, profit_factor=1.2, max_drawdown=-0.1),
            trade_records=[],
        )

    def fake_write(payload: dict[str, object]) -> tuple[Path, Path]:
        seen["payload_variant"] = payload["variants"][0]["variant"]  # type: ignore[index]
        base = Path(__file__).resolve().parents[1] / "research" / "results"
        return base / "latest.json", base / "runs" / "run.json"

    monkeypatch.setattr("research.strategies.ema_pullback.execution.runner.load_candles_once", fake_load)
    monkeypatch.setattr("research.strategies.ema_pullback.execution.runner.run_strategy_spec", fake_run)
    monkeypatch.setattr(
        "research.strategies.ema_pullback.execution.runner.write_research_results", fake_write
    )

    run_active_specs(DEFAULT_EXECUTION_CONFIG)
    assert seen["variant"] == spec.variant
    assert seen["payload_variant"] == spec.variant


def test_report_payload_contains_strategy_spec_and_variant() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    variant_payload = VariantResult(
        variant=spec.variant,
        config_id="abc123",
        strategy_spec=spec,
        metrics=VariantMetrics(trades=1, sharpe=1.0, profit_factor=1.2, max_drawdown=-0.1),
        trade_records=[],
    ).to_payload()
    payload = build_research_run_payload(
        run_id="rid",
        created_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
        family="ema_pullback",
        symbol="BTCUSDT",
        timeframe="1h",
        candles_count=10,
        data_range_from_ms=1,
        data_range_to_ms=2,
        variants=[variant_payload],
    )
    row = payload["variants"][0]
    assert row["variant"] == "ema_pullback_fast20_anchor200_slow1000"
    assert "strategy_spec" in row


def test_write_research_results_roundtrip(tmp_path: Path) -> None:
    payload = {
        "run_id": "2026-05-01T120000Z_ema_pullback_BTCUSDT_1h",
        "created_at": "2026-05-01T12:00:00Z",
        "family": "ema_pullback",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "candles": 10,
        "data_range": {"from_open_time_ms": 1, "to_open_time_ms": 2},
        "variants_count": 1,
        "variants": [
            {
                "variant": "ema_pullback_fast20_anchor200_slow1000",
                "config_id": "abc123",
                "strategy_spec": {"variant": "ema_pullback_fast20_anchor200_slow1000"},
                "metrics": {},
                "trade_records": [],
            }
        ],
    }
    latest, run_path = write_research_results(payload, results_dir=tmp_path / "results")
    text = latest.read_text(encoding="utf-8")
    assert "strategy_spec" in text
    assert "ema_pullback_fast20_anchor200_slow1000" in text
    assert run_path.exists()
