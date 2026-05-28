"""Phase 4 — context consumption trace and v5 trade attribution."""

from __future__ import annotations

import pytest

from research.strategies.ema_pullback.component_builders import (
    component_stack,
    direction_ema_anchor_stack,
    risk_no_filter,
    setup_untouched_anchor,
    trigger_reclaim_anchor,
)
from research.strategies.ema_pullback.execution.results import extract_trade_records
from research.strategies.ema_pullback.execution.signal_trace import build_signal_trace_from_spec
from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec_instances import make_ema_pullback_strategy_spec
from tests.ema_pullback_context_helpers import (
    blocker_htf_state_gate,
    context_bundle_for_spec,
    exit_policy_htf_consumption,
    htf_strategy_contexts,
)


def test_signal_trace_emits_context_consumption_trace() -> None:
    pytest.importorskip("pandas")
    import pandas as pd

    from research.strategies.ema_pullback.component_builders import exit_rsi, trade_management

    spec = make_ema_pullback_strategy_spec(
        contexts=htf_strategy_contexts(),
        components=component_stack(
            direction=direction_ema_anchor_stack(),
            blockers=(blocker_htf_state_gate(allowed_states=("up",)),),
            setup=setup_untouched_anchor(),
            trigger=trigger_reclaim_anchor(),
            risk=risk_no_filter(),
        ),
        trade_management_spec=trade_management(
            exit_policy_spec=exit_policy_htf_consumption(
                aligned=(exit_rsi(instance_id="rsi_profile"),),
            ),
        ),
    )
    plan = build_feature_plan_from_strategy_spec(spec)
    idx = pd.date_range("2024-01-01", periods=3, freq="h", tz="UTC")
    close = pd.Series([100.0, 101.0, 102.0], index=idx)
    ohlcv = pd.DataFrame(
        {"close": close, "open": close, "high": close, "low": close, "volume": 1.0},
        index=idx,
    )
    df = add_feature_columns_from_plan(ohlcv, plan)
    cols = plan.htf_context_columns_for("htf")
    df[cols["fast"]] = [103.0, 101.0, 102.0]
    df[cols["anchor"]] = [102.0, 102.0, 102.0]
    df[cols["slow"]] = [101.0, 103.0, 102.0]

    trace = build_signal_trace_from_spec(df, spec, plan, context_overlay_ref="htf")
    roles = {record["role"] for record in trace.context_consumption_trace}
    assert "exit_policy" in roles
    assert "blockers" in roles
    exit_record = next(r for r in trace.context_consumption_trace if r["role"] == "exit_policy")
    assert exit_record["context_ref"] == "htf"
    assert exit_record["policy_id"] == "exit_profile_by_htf_state"
    assert exit_record["context_applied"] == [True, True, True]
    blocker_record = next(r for r in trace.context_consumption_trace if r["role"] == "blockers")
    assert blocker_record["policy_id"] == "htf_state_gate"
    assert blocker_record["context_applied"] == [True, False, False]
    assert blocker_record["outcome"]["state_at_bar"] == ["up", "down", "neutral"]
    assert blocker_record["outcome"]["allowed_states"] == ["up"]


def test_trade_records_include_separate_entry_and_exit_consumption() -> None:
    pytest.importorskip("pandas")
    import pandas as pd

    spec = make_ema_pullback_strategy_spec(
        contexts=htf_strategy_contexts(),
        components=component_stack(
            direction=direction_ema_anchor_stack(),
            blockers=(blocker_htf_state_gate(allowed_states=("up",)),),
            setup=setup_untouched_anchor(),
            trigger=trigger_reclaim_anchor(),
            risk=risk_no_filter(),
        ),
    )
    plan = build_feature_plan_from_strategy_spec(spec)
    idx = pd.date_range("2024-01-01", periods=1, freq="h", tz="UTC")
    close = pd.Series([100.0], index=idx)
    ohlcv = pd.DataFrame(
        {"close": close, "open": close, "high": close, "low": close, "volume": 1.0},
        index=idx,
    )
    df = add_feature_columns_from_plan(ohlcv, plan)
    cols = plan.htf_context_columns_for("htf")
    df[cols["fast"]] = [103.0]
    df[cols["anchor"]] = [102.0]
    df[cols["slow"]] = [101.0]
    bundle = context_bundle_for_spec(spec, df, plan)
    context_state = bundle.get("htf").state_series()
    profile_long = pd.Series(["aligned"], index=idx)
    profile_short = pd.Series(["neutral"], index=idx)

    records_df = pd.DataFrame(
        [
            {
                "direction": 0,
                "status": 1,
                "entry_idx": 0,
                "exit_idx": 0,
                "entry_price": 100.0,
                "exit_price": 101.0,
                "size": 1.0,
                "pnl": 1.0,
                "return": 0.01,
            }
        ]
    )

    class _Trades:
        records = records_df

    class _Pf:
        trades = _Trades()

    records = extract_trade_records(
        _Pf(),
        close,
        profile_long=profile_long,
        profile_short=profile_short,
        context_state=context_state,
        strategy_spec=spec,
        context_bundle=bundle,
    )
    assert len(records) == 1
    entry_cc = records[0]["entry_context_consumption"]
    assert entry_cc["policy_id"] == "htf_state_gate"
    assert entry_cc["applied"] is True
    assert "exit_context_consumption" not in records[0]


def test_trade_entry_consumption_applied_false_when_gate_blocks() -> None:
    pytest.importorskip("pandas")
    import pandas as pd

    spec = make_ema_pullback_strategy_spec(
        contexts=htf_strategy_contexts(),
        components=component_stack(
            direction=direction_ema_anchor_stack(),
            blockers=(blocker_htf_state_gate(allowed_states=("up",)),),
            setup=setup_untouched_anchor(),
            trigger=trigger_reclaim_anchor(),
            risk=risk_no_filter(),
        ),
    )
    plan = build_feature_plan_from_strategy_spec(spec)
    idx = pd.date_range("2024-01-01", periods=1, freq="h", tz="UTC")
    close = pd.Series([100.0], index=idx)
    ohlcv = pd.DataFrame(
        {"close": close, "open": close, "high": close, "low": close, "volume": 1.0},
        index=idx,
    )
    df = add_feature_columns_from_plan(ohlcv, plan)
    cols = plan.htf_context_columns_for("htf")
    df[cols["fast"]] = [101.0]
    df[cols["anchor"]] = [102.0]
    df[cols["slow"]] = [103.0]
    bundle = context_bundle_for_spec(spec, df, plan)

    records_df = pd.DataFrame(
        [
            {
                "direction": 0,
                "status": 1,
                "entry_idx": 0,
                "exit_idx": 0,
                "entry_price": 100.0,
                "exit_price": 101.0,
                "size": 1.0,
                "pnl": 1.0,
                "return": 0.01,
            }
        ]
    )

    class _Trades:
        records = records_df

    class _Pf:
        trades = _Trades()

    records = extract_trade_records(
        _Pf(),
        close,
        strategy_spec=spec,
        context_bundle=bundle,
    )
    assert records[0]["entry_context_consumption"]["applied"] is False
