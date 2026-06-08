"""Unified execution combiner: bar sequencing semantics."""

from __future__ import annotations

from dataclasses import replace

import pandas as pd
import pytest

from research.strategies.ema_pullback.execution.execution_adapters import (
    LegacyBreakEvenExitAdapter,
    ManagedExitProviderAdapter,
)
from research.strategies.ema_pullback.execution.execution_combiner import run_execution_combiner_loop
from research.strategies.ema_pullback.execution.managed_exit_provider import ManagedExitProvider
from research.strategies.ema_pullback.spec import (
    BreakEvenStopParamsSpec,
    ExitManagementSpec,
    ManagementActivateWhenSpec,
    PhaseRuleConditionSpec,
    PhaseRuleSpec,
    StopManagementRuleSpec,
    empty_exit_management,
)
from research.strategies.ema_pullback.spec_instances import make_ema_pullback_strategy_spec
from tests.test_managed_execution_integration import (
    _false_series,
    _managed_be_spec,
    _minimal_exit_outputs,
    _series,
)


def test_legacy_and_v2_share_no_same_bar_reentry_after_close() -> None:
    """Both adapters use combiner rule: close on bar N blocks entry on bar N."""
    from research.strategies.ema_pullback.spec import (
        PhaseRuntimeExitParamsSpec,
        RuntimeExitRuleSpec,
    )

    spec = _managed_be_spec()
    exit_management = replace(
        spec.trade_management.exit_management,
        phase_rules=(
            PhaseRuleSpec(
                rule_id="to_exhaustion",
                to_phase="exhaustion",
                condition=PhaseRuleConditionSpec(type="bars_in_trade", threshold=1),
            ),
        ),
        stop_management=(),
        runtime_exits=(
            RuntimeExitRuleSpec(
                rule_id="exit_ex",
                component_id="phase_runtime_exit",
                activate_when=ManagementActivateWhenSpec(phase_at_least="exhaustion"),
                params=PhaseRuntimeExitParamsSpec(exit_price="close"),
            ),
        ),
    )
    spec = replace(
        spec,
        trade_management=replace(spec.trade_management, exit_management=exit_management),
    )
    n = 3
    close = _series([100.0, 101.0, 102.0])
    open_ = close - 0.1
    high = close + 0.5
    low = close - 0.5
    entries = pd.Series([True, True, False], index=close.index, dtype=bool)
    exit_outputs = _minimal_exit_outputs(n, tp_ratio=0.50)
    provider = ManagedExitProvider(
        phase_rules=exit_management.phase_rules,
        stop_management=(),
        take_management=(),
        runtime_exits=exit_management.runtime_exits,
    )
    adapter = ManagedExitProviderAdapter(provider=provider, index=close.index)
    result = run_execution_combiner_loop(
        spec=spec,
        close=close,
        open_=open_,
        high=high,
        low=low,
        entries=entries,
        short_entries=_false_series(n, close.index),
        exit_outputs=exit_outputs,
        adapter=adapter,
    )
    closed = [item for item in result.closed if not item.get("open")]
    assert len(closed) == 1
    assert closed[0]["entry_idx"] == 0


def test_legacy_be_delayed_activation_via_combiner() -> None:
    from research.strategies.ema_pullback.component_builders import (
        break_even_stop_rule,
        exit_management,
        exit_policy,
        exits_atr_default,
        trade_management,
    )

    sl, tp = exits_atr_default(atr_period=14, stop_atr_multiplier=1.5, take_atr_multiplier=4.0)
    tm = trade_management(
        exit_policy_spec=exit_policy(always_on=(sl, tp), aligned=(), countertrend=(), neutral=()),
        exit_management_spec=exit_management(
            always_on=(break_even_stop_rule(instance_id="be_ao", trigger_r=1.0, offset_r=0.0),),
        ),
    )
    spec = make_ema_pullback_strategy_spec(trade_management_spec=tm)
    n = 4
    idx = pd.RangeIndex(n)
    close = pd.Series([100.0, 110.0, 101.0, 100.0], index=idx)
    open_ = pd.Series([100.0, 105.0, 108.0, 100.5], index=idx)
    high = pd.Series([101.0, 111.0, 109.0, 101.0], index=idx)
    low = pd.Series([99.0, 104.0, 99.5, 99.0], index=idx)
    entries = pd.Series([True, False, False, False], index=idx)
    exit_outputs = _minimal_exit_outputs(n, sl_ratio=0.10, tp_ratio=0.20)
    traces: list[object] = []
    adapter = LegacyBreakEvenExitAdapter(spec=spec, close=close)
    run_execution_combiner_loop(
        spec=spec,
        close=close,
        open_=open_,
        high=high,
        low=low,
        entries=entries,
        short_entries=_false_series(n, idx),
        exit_outputs=exit_outputs,
        adapter=adapter,
        traces_out=traces,
    )
    assert traces[1] is not None
    assert getattr(traces[1], "break_even_triggered_on_bar", False) is True
    assert getattr(traces[1], "pending_stop_price", None) == pytest.approx(100.0)
    assert getattr(traces[1], "effective_stop_price", None) == pytest.approx(90.0)
