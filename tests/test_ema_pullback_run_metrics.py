"""Tests for ema_pullback run helpers (no vectorbt)."""

from __future__ import annotations

from types import SimpleNamespace
import sys

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.execution import backtest
from research.strategies.ema_pullback.execution.backtest import build_trade_side_metrics, ensure_finite_metric
from research.strategies.ema_pullback.execution.exits import PortfolioExitOutputs
from research.strategies.ema_pullback.execution.report_table import print_comparison_table
from research.strategies.ema_pullback.execution.signals import PortfolioSignals
from research.strategies.ema_pullback.spec_instances import default_ema_pullback_strategy_spec


def test_ensure_finite_metric_accepts_finite() -> None:
    assert ensure_finite_metric("sharpe_ratio", 0.0) == 0.0
    assert ensure_finite_metric("profit_factor", 1.25) == 1.25
    assert ensure_finite_metric("max_drawdown", -0.5) == -0.5


def test_ensure_finite_metric_rejects_nan() -> None:
    assert ensure_finite_metric("sharpe_ratio", float("nan")) == 0.0


def test_ensure_finite_metric_rejects_inf() -> None:
    assert ensure_finite_metric("max_drawdown", float("inf")) == 0.0


def test_comparison_table_includes_side_and_total_columns(capsys: pytest.CaptureFixture[str]) -> None:
    print_comparison_table(
        [
            {
                "variant": "v",
                "config_id": "cid",
                "fast": 20,
                "anchor": 200,
                "slow": 1000,
                "long_trades": 2,
                "long_pnl": 10.0,
                "long_return_pct": 0.1,
                "long_profit_factor": 2.0,
                "long_win_rate": 0.5,
                "short_trades": 0,
                "short_pnl": 0.0,
                "short_return_pct": 0.0,
                "short_profit_factor": None,
                "short_win_rate": None,
                "total_trades": 2,
                "total_pnl": 10.0,
                "total_return_pct": 0.1,
                "total_profit_factor": 2.0,
                "total_win_rate": 0.5,
                "total_sharpe": 0.1,
                "total_max_drawdown": -0.2,
                "open_trades_long": 0,
                "open_trades_short": 1,
                "open_trades_total": 1,
            }
        ]
    )
    out = capsys.readouterr().out
    assert "long_trades" in out
    assert "short_trades" in out
    assert "total_trades" in out
    assert "total_sharpe" in out
    assert "open_trades_total" in out
    assert "null" in out
    assert "fast" in out
    assert "anchor" in out
    assert "slow" in out


def test_build_trade_side_metrics_aggregates_normalized_records() -> None:
    metrics = build_trade_side_metrics(
        [
            {"direction": "long", "status": "closed", "pnl": 30.0},
            {"direction": "long", "status": "closed", "pnl": -10.0},
        ],
        init_cash=100.0,
        sharpe=0.5,
        max_drawdown=-0.1,
    )

    assert metrics.long.trades == 2
    assert metrics.long.pnl == 20.0
    assert metrics.long.return_pct == 0.2
    assert metrics.long.profit_factor == 3.0
    assert metrics.long.win_rate == 0.5
    assert metrics.short.trades == 0
    assert metrics.short.pnl == 0.0
    assert metrics.short.return_pct == 0.0
    assert metrics.short.profit_factor is None
    assert metrics.short.win_rate is None
    assert metrics.total.trades == 2
    assert metrics.total.pnl == 20.0
    assert metrics.total.return_pct == 0.2
    assert metrics.sharpe == 0.5
    assert metrics.max_drawdown == -0.1
    assert metrics.open_trades.total == 0


def test_build_trade_side_metrics_non_finite_profit_factor_is_null() -> None:
    metrics = build_trade_side_metrics(
        [{"direction": "long", "status": "closed", "pnl": 5.0}],
        init_cash=100.0,
        sharpe=0.0,
        max_drawdown=0.0,
    )

    assert metrics.long.profit_factor is None
    assert metrics.long.win_rate == 1.0
    assert metrics.total.profit_factor is None


def test_build_trade_side_metrics_ignores_open_trades_for_realized() -> None:
    metrics = build_trade_side_metrics(
        [
            {"direction": "long", "status": "closed", "pnl": 10.0},
            {"direction": "long", "status": "open", "pnl": 999.0},
            {"direction": "short", "status": "open", "pnl": -500.0},
        ],
        init_cash=100.0,
        sharpe=0.0,
        max_drawdown=0.0,
    )

    assert metrics.long.trades == 1
    assert metrics.long.pnl == 10.0
    assert metrics.total.pnl == 10.0
    assert metrics.open_trades.long == 1
    assert metrics.open_trades.short == 1
    assert metrics.open_trades.total == 2


def test_run_strategy_spec_wires_short_signals_and_masks_warmup(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeTrades:
        records = None

        def count(self) -> int:
            return 0

        def profit_factor(self) -> float:
            return 1.0

    class FakePortfolio:
        trades = FakeTrades()

        def sharpe_ratio(self) -> float:
            return 0.0

        def max_drawdown(self) -> float:
            return 0.0

    class FakePortfolioFactory:
        @staticmethod
        def from_signals(close: pd.Series, entries: pd.Series, exits: pd.Series, **kwargs: object) -> FakePortfolio:
            captured["close"] = close
            captured["entries"] = entries
            captured["exits"] = exits
            captured.update(kwargs)
            return FakePortfolio()

    monkeypatch.setitem(sys.modules, "vectorbt", SimpleNamespace(Portfolio=FakePortfolioFactory))

    def fake_build_signals_from_spec(df: pd.DataFrame, spec: object, plan: object) -> PortfolioSignals:
        values = pd.Series([True, True, True, True], index=df.index, dtype=bool)
        return PortfolioSignals(
            entries=values,
            short_entries=values,
        )

    def fake_build_exit_outputs_from_spec(
        df: pd.DataFrame, spec: object, plan: object
    ) -> PortfolioExitOutputs:
        exits = pd.Series(False, index=df.index, dtype=bool)
        sl_stop = pd.Series([float("nan"), 0.01, 0.01, 0.01], index=df.index)
        tp_stop = pd.Series([float("nan"), 0.02, 0.02, 0.02], index=df.index)
        return PortfolioExitOutputs(
            exits=exits,
            short_exits=exits,
            sl_stop=sl_stop,
            tp_stop=tp_stop,
        )

    monkeypatch.setattr(backtest, "build_signals_from_spec", fake_build_signals_from_spec)
    monkeypatch.setattr(backtest, "build_exit_outputs_from_spec", fake_build_exit_outputs_from_spec)

    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    close = pd.Series([100.0, 101.0, 102.0, 103.0], index=idx)
    ohlcv = pd.DataFrame(
        {
            "open": close,
            "high": close + 1.0,
            "low": close - 1.0,
            "close": close,
            "volume": 1.0,
        },
        index=idx,
    )

    backtest.run_strategy_spec(default_ema_pullback_strategy_spec(), ohlcv)

    assert captured["entries"].tolist() == [False, True, True, True]
    assert captured["short_entries"].tolist() == [False, True, True, True]
    assert captured["exits"].tolist() == [False, False, False, False]
    assert captured["short_exits"].tolist() == [False, False, False, False]
