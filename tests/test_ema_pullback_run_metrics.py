"""Tests for ema_pullback run helpers (no vectorbt)."""

from __future__ import annotations

import pytest

from research.strategies.ema_pullback.run import _print_comparison_table, ensure_finite_metric


def test_ensure_finite_metric_accepts_finite() -> None:
    assert ensure_finite_metric("sharpe_ratio", 0.0) == 0.0
    assert ensure_finite_metric("profit_factor", 1.25) == 1.25
    assert ensure_finite_metric("max_drawdown", -0.5) == -0.5


def test_ensure_finite_metric_rejects_nan() -> None:
    with pytest.raises(SystemExit, match="sharpe_ratio"):
        ensure_finite_metric("sharpe_ratio", float("nan"))


def test_ensure_finite_metric_rejects_inf() -> None:
    with pytest.raises(SystemExit, match="max_drawdown"):
        ensure_finite_metric("max_drawdown", float("inf"))


def test_comparison_table_includes_trades_column(capsys: pytest.CaptureFixture[str]) -> None:
    _print_comparison_table(
        [
            {
                "variant": "v",
                "config_id": "cid",
                "ema_fast": 20,
                "ema_slow": 200,
                "trades": 7,
                "sharpe": 0.1,
                "profit_factor": 1.2,
                "max_drawdown": -0.3,
            }
        ]
    )
    out = capsys.readouterr().out
    assert "trades" in out
