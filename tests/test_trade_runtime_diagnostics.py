from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.execution.trade_runtime import (
    TradeRuntimeState,
    build_trade_runtime_diagnostics,
    evaluate_phase_rules,
)
from research.strategies.ema_pullback.spec import (
    PhaseRuleAtrSpec,
    PhaseRuleConditionSpec,
    PhaseRuleSpec,
)


def _series(values: list[float]) -> pd.Series:
    return pd.Series(
        values,
        index=pd.date_range("2024-01-01", periods=len(values), freq="h", tz="UTC"),
        dtype=float,
    )


def _phase_rule(
    rule_id: str,
    to_phase: str,
    condition_type: str,
    threshold: float,
    *,
    atr: PhaseRuleAtrSpec | None = None,
) -> PhaseRuleSpec:
    return PhaseRuleSpec(
        rule_id=rule_id,
        to_phase=to_phase,  # type: ignore[arg-type]
        condition=PhaseRuleConditionSpec(
            type=condition_type,  # type: ignore[arg-type]
            threshold=threshold,
            atr=atr,
        ),
    )


def test_long_runtime_state_uses_favorable_high_and_adverse_low() -> None:
    high = _series([100.5, 103.0, 105.0, 104.0])
    low = _series([99.5, 98.0, 101.0, 100.0])
    close = _series([100.0, 102.0, 104.0, 103.0])
    result = build_trade_runtime_diagnostics(
        trade_records=[
            {
                "trade_id": "L1",
                "status": "closed",
                "direction": "long",
                "entry_idx": 1,
                "exit_idx": 3,
                "entry_price": 100.0,
                "exit_price": 103.0,
                "exit_reason": "signal:exit",
                "entry_profile": "aligned",
                "exit_component_id": "no_signal_exit",
            }
        ],
        high=high,
        low=low,
        close=close,
        phase_rules=(),
    )

    state = result.states_by_trade_id["L1"]
    assert state.bars_in_trade == 3
    assert state.best_price == 105.0
    assert state.worst_price == 98.0
    assert state.mfe_price == 105.0
    assert state.mae_price == 98.0
    assert state.mfe_pct == pytest.approx(0.05)
    assert state.mae_pct == pytest.approx(-0.02)
    assert result.events[-1].event_type == "exit_executed"
    assert result.events[-1].component_id == "no_signal_exit"


def test_short_runtime_state_uses_favorable_low_and_adverse_high() -> None:
    high = _series([100.5, 103.0, 101.0, 104.0])
    low = _series([99.5, 97.0, 95.0, 96.0])
    close = _series([100.0, 98.0, 96.0, 97.0])
    result = build_trade_runtime_diagnostics(
        trade_records=[
            {
                "trade_id": "S1",
                "status": "closed",
                "direction": "short",
                "entry_idx": 1,
                "exit_idx": 3,
                "entry_price": 100.0,
                "exit_price": 97.0,
                "exit_reason": "take_profit:tp",
                "entry_profile": "countertrend",
            }
        ],
        high=high,
        low=low,
        close=close,
        phase_rules=(),
    )

    state = result.states_by_trade_id["S1"]
    assert state.bars_in_trade == 3
    assert state.best_price == 95.0
    assert state.worst_price == 104.0
    assert state.mfe_price == 95.0
    assert state.mae_price == 104.0
    assert state.mfe_pct == pytest.approx(0.05)
    assert state.mae_pct == pytest.approx(-0.04)


def test_phase_rules_support_mfe_pct_bars_and_mfe_atr() -> None:
    high = _series([101.0, 102.0, 104.0, 106.0])
    low = _series([99.0, 100.0, 101.0, 102.0])
    close = _series([100.0, 101.0, 103.0, 105.0])
    atr = _series([2.0, 2.0, 2.0, 2.0])

    result = build_trade_runtime_diagnostics(
        trade_records=[
            {
                "trade_id": "T1",
                "status": "closed",
                "direction": "long",
                "entry_idx": 0,
                "exit_idx": 3,
                "entry_price": 100.0,
                "exit_price": 105.0,
                "exit_reason": "signal:exit",
            }
        ],
        high=high,
        low=low,
        close=close,
        phase_rules=(
            _phase_rule(
                "to_proven_at_1atr",
                "proven",
                "mfe_atr",
                1.0,
                atr=PhaseRuleAtrSpec(timeframe="base", period=14),
            ),
            _phase_rule("to_protected_after_2_bars", "protected", "bars_in_trade", 2),
            _phase_rule("to_runner_at_5pct", "runner", "mfe_pct", 0.05),
        ),
        atr_series_by_key={("base", 14): atr},
    )

    phase_events = [event for event in result.events if event.event_type == "phase_changed"]
    assert [event.rule_id for event in phase_events] == [
        "to_proven_at_1atr",
        "to_protected_after_2_bars",
        "to_runner_at_5pct",
    ]
    assert [event.to_phase for event in phase_events] == ["proven", "protected", "runner"]
    assert result.states_by_trade_id["T1"].max_phase_reached == "runner"


def test_runtime_phase_evaluation_does_not_move_backwards() -> None:
    state = TradeRuntimeState(
        trade_id="T1",
        side="long",
        entry_idx=0,
        entry_time_ms=0,
        entry_price=100.0,
        bars_in_trade=5,
        phase="runner",
        max_phase_reached="runner",
        best_price=106.0,
        worst_price=99.0,
        mfe_price=106.0,
        mfe_pct=0.06,
        mae_price=99.0,
        mae_pct=-0.01,
        active_stop_price=None,
        active_stop_source=None,
        initial_stop_price=None,
        initial_take_profit_price=None,
        locked_exit_profile=None,
    )

    events = evaluate_phase_rules(
        state,
        (_phase_rule("late_protected", "protected", "mfe_pct", 0.01),),
        bar_index=4,
        time_ms=0,
    )

    assert events == []
    assert state.phase == "runner"
    assert state.max_phase_reached == "runner"


def test_open_trades_are_ignored_by_runtime_diagnostics() -> None:
    high = _series([101.0, 102.0])
    low = _series([99.0, 100.0])
    close = _series([100.0, 101.0])

    result = build_trade_runtime_diagnostics(
        trade_records=[
            {
                "trade_id": "O1",
                "status": "open",
                "direction": "long",
                "entry_idx": 0,
                "exit_idx": 1,
                "entry_price": 100.0,
            }
        ],
        high=high,
        low=low,
        close=close,
        phase_rules=(),
    )

    assert result.states_by_trade_id == {}
    assert result.events == []
