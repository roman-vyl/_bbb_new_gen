"""Tests for ema_atr_directional run helpers (no vectorbt)."""

from __future__ import annotations

import pytest

from research.strategies.ema_atr_directional.run import ensure_finite_metric


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
