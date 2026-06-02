"""Exit management: signal trace, reports, config fixture, backtest routing."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from research.experiments.config_loader import load_strategy_config_file
from research.strategies.ema_pullback.component_builders import (
    break_even_stop_rule,
    exit_management,
    exit_policy,
    exits_atr_default,
    trade_management,
)
from research.strategies.ema_pullback.execution import backtest
from research.strategies.ema_pullback.execution.exit_attribution import ExitAttributionResult
from research.strategies.ema_pullback.execution.exit_management import (
    has_exit_management_rules,
    run_managed_bar_loop,
)
from research.strategies.ema_pullback.execution.results import build_managed_trade_records
from research.strategies.ema_pullback.execution.signal_trace import build_signal_trace_from_spec
from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec_instances import make_ema_pullback_strategy_spec

from tests.ema_pullback_context_helpers import exit_policy_htf_consumption

_FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "research"
    / "experiments"
    / "configs"
    / "fixtures"
    / "exit_management_be_profile_override.json"
)


def _ohlcv(periods: int = 120) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=periods, freq="h", tz="UTC")
    close = pd.Series(range(100, 100 + periods), index=idx, dtype=float)
    return pd.DataFrame(
        {
            "open": close - 0.5,
            "high": close + 1.0,
            "low": close - 1.0,
            "close": close,
            "volume": 1.0,
        },
        index=idx,
    )


def _tm_with_be() -> object:
    sl, tp = exits_atr_default(atr_period=14, stop_atr_multiplier=1.5, take_atr_multiplier=4.0)
    return trade_management(
        exit_policy_spec=exit_policy(always_on=(sl, tp), aligned=(), countertrend=(), neutral=()),
        exit_management_spec=exit_management(
            always_on=(break_even_stop_rule(instance_id="be_ao", trigger_r=1.0),),
        ),
    )


def test_fixture_loads_exit_management_shape() -> None:
    bundle = load_strategy_config_file(_FIXTURE)
    em = bundle.specs[0].trade_management.exit_management
    assert em.profiles.aligned.rules[0].instance_id == "be_aligned_1r"
    assert em.always_on.rules[0].trigger_r == 2.0


def test_fixture_matches_design_json_fragment() -> None:
    payload = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    em = payload["instances"][0]["strategy"]["trade_management"]["exit_management"]
    assert em["profiles"]["aligned"]["rules"][0]["instance_id"] == "be_aligned_1r"


def test_build_managed_trade_records_break_even_exit_reason() -> None:
    from research.strategies.ema_pullback.execution.exit_management import _OpenPosition, ResolvedManagementRule
    from research.strategies.ema_pullback.spec import ExitManagementRuleSpec

    rule = ExitManagementRuleSpec(
        instance_id="be_ao",
        component_id="break_even_stop",
        trigger_r=1.0,
        offset_r=0.0,
        apply_once=True,
    )
    pos = _OpenPosition(
        direction="long",
        entry_idx=0,
        entry_price=100.0,
        locked_profile="neutral",
        resolved=ResolvedManagementRule(rule=rule, source="always_on"),
        initial_stop_price=90.0,
        initial_risk=10.0,
        effective_stop=100.0,
        triggered=True,
        stop_moved_to=100.0,
    )
    idx = pd.RangeIndex(5)
    close = pd.Series([100.0, 101.0, 102.0, 103.0, 104.0], index=idx)
    closed = [
        {
            "position": pos,
            "exit_idx": 2,
            "exit_price": 99.0,
            "exit_attribution": ExitAttributionResult(
                "break_even:be_ao",
                "always_on",
                None,
                "break_even_stop",
                "be_ao",
                "break_even",
            ),
        }
    ]
    records = build_managed_trade_records(closed, index=idx, close=close)
    assert records[0]["exit_reason"] == "break_even:be_ao"
    assert records[0]["exit_kind"] == "break_even"
    assert records[0]["break_even"]["triggered"] is True


def test_signal_trace_attaches_exit_management_when_traces_active() -> None:
    from research.strategies.ema_pullback.execution.exit_management import BarManagementTrace
    from research.strategies.ema_pullback.execution.signal_trace import (
        SideSignalTrace,
        _attach_exit_management_internals,
    )

    traces = [
        None,
        BarManagementTrace(
            effective_stop_price=90.0,
            pending_stop_price=100.0,
            break_even_active=True,
            break_even_triggered_on_bar=True,
            break_even_trigger_price=101.0,
            break_even_stop_moved_to=100.0,
            break_even_initial_risk=10.0,
            break_even_instance_id="be_ao",
            active_stop_management_source="always_on",
            position_direction="long",
        ),
    ]
    base = SideSignalTrace(
        direction_ok=[False, False],
        blockers_ok=[True, True],
        setup_ok=[False, False],
        trigger_ok=[False, False],
        risk_ok=[True, True],
        signal_entry=[False, False],
        stop_ready=[True, True],
        portfolio_entry=[False, False],
        internals={},
    )
    attached = _attach_exit_management_internals(base, traces=traces, side="long")
    em = attached.internals["exit_management"]
    assert em["break_even_triggered_on_bar"][1] is True
    assert em["pending_stop_price"][1] == 100.0


def test_duplicate_break_even_per_group_fails_validation() -> None:
    with pytest.raises(ValueError, match="at most one break_even_stop"):
        exit_management(
            always_on=(
                break_even_stop_rule(instance_id="be_a", trigger_r=1.0),
                break_even_stop_rule(instance_id="be_b", trigger_r=1.0),
            ),
        )


@pytest.mark.optional_vectorbt
def test_run_strategy_spec_without_exit_management_skips_managed_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pytest.importorskip("vectorbt")

    def _boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("run_managed_bar_loop must not run when exit_management is empty")

    monkeypatch.setattr(backtest, "run_managed_bar_loop", _boom)
    spec = make_ema_pullback_strategy_spec()
    assert not has_exit_management_rules(spec)
    result = backtest.run_strategy_spec(spec, _ohlcv(120))
    assert result.metrics.total.trades >= 0


def test_resolve_never_triggered_break_even_diagnostics() -> None:
    from research.strategies.ema_pullback.execution.exit_management import (
        build_break_even_diagnostics,
        _OpenPosition,
        ResolvedManagementRule,
    )
    from research.strategies.ema_pullback.spec import ExitManagementRuleSpec

    rule = ExitManagementRuleSpec(
        instance_id="be_ao",
        component_id="break_even_stop",
        trigger_r=1.0,
        offset_r=0.0,
        apply_once=True,
    )
    pos = _OpenPosition(
        direction="long",
        entry_idx=0,
        entry_price=100.0,
        locked_profile="neutral",
        resolved=ResolvedManagementRule(rule=rule, source="always_on"),
        initial_stop_price=90.0,
        initial_risk=10.0,
        effective_stop=90.0,
        triggered=False,
    )
    diag = build_break_even_diagnostics(pos)
    assert diag is not None
    assert diag.triggered is False
    assert diag.stop_moved_to is None
