from __future__ import annotations

from dataclasses import replace

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.execution.signal_trace import (
    build_signal_trace_from_spec,
    slice_signal_trace,
)
from research.strategies.ema_pullback.execution.exits import PortfolioExitOutputs
from research.strategies.ema_pullback.execution.signals import build_signals_from_spec
from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.component_builders import trigger_strong_reclaim_anchor
from research.strategies.ema_pullback.spec import (
    ReclaimTriggerSpec,
    StrongReclaimTriggerSpec,
    strategy_spec_to_dict,
)
from research.strategies.ema_pullback.spec_instances import make_ema_pullback_strategy_spec
from research.strategies.ema_pullback.spec_report import strategy_spec_from_report_dict


def _ohlcv(periods: int = 80) -> pd.DataFrame:
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


def test_signal_entry_trace_matches_build_signals_from_spec() -> None:
    spec = make_ema_pullback_strategy_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(), plan)

    signals = build_signals_from_spec(df, spec, plan)
    trace = build_signal_trace_from_spec(df, spec, plan)

    assert trace.long.signal_entry == signals.entries.fillna(False).astype(bool).tolist()
    assert trace.short.signal_entry == signals.short_entries.fillna(False).astype(bool).tolist()
    assert len(trace.times) == len(df)


def test_build_signals_from_spec_works_with_strong_reclaim_anchor() -> None:
    spec = make_ema_pullback_strategy_spec()
    spec = replace(
        spec,
        components=replace(
            spec.components, trigger=trigger_strong_reclaim_anchor(lookback=2)
        ),
    )
    assert isinstance(spec.components.trigger, StrongReclaimTriggerSpec)
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(periods=30), plan)
    signals = build_signals_from_spec(df, spec, plan)
    assert len(signals.entries) == len(df)
    assert len(signals.short_entries) == len(df)


def test_signal_trace_meta_and_internals_for_strong_reclaim_anchor() -> None:
    spec = make_ema_pullback_strategy_spec()
    spec = replace(
        spec,
        components=replace(
            spec.components, trigger=trigger_strong_reclaim_anchor(lookback=2)
        ),
    )
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(periods=30), plan)
    trace = build_signal_trace_from_spec(df, spec, plan)
    assert trace.meta["trigger_params"] == {"lookback": 2}
    trigger_internals = trace.long.internals["trigger"]
    for key in ("probed", "had_prior_probe", "reclaimed", "trigger"):
        assert key in trigger_internals


def test_signal_trace_meta_includes_trigger_params_for_reclaim() -> None:
    spec = make_ema_pullback_strategy_spec(trigger_lookback=2)
    assert isinstance(spec.components.trigger, ReclaimTriggerSpec)
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(periods=30), plan)
    trace = build_signal_trace_from_spec(df, spec, plan)
    assert trace.meta["trigger_params"] == {"lookback": 2}


def test_strategy_spec_roundtrip_from_report_dict() -> None:
    spec = make_ema_pullback_strategy_spec(variant="roundtrip_test", trigger_lookback=3)
    restored = strategy_spec_from_report_dict(strategy_spec_to_dict(spec))
    assert restored.variant == spec.variant
    assert restored.components.setup == spec.components.setup
    assert restored.components.trigger.component_id == spec.components.trigger.component_id
    assert isinstance(restored.components.trigger, ReclaimTriggerSpec)
    assert restored.components.trigger.lookback == 3
    assert len(restored.components.blockers) == len(spec.components.blockers)


def test_strategy_spec_roundtrip_preserves_blocker_htf_regime_gate_params() -> None:
    from dataclasses import asdict
    from tests.ema_pullback_context_helpers import (
        blocker_htf_regime_gate,
        htf_strategy_contexts,
    )

    base = make_ema_pullback_strategy_spec(contexts=htf_strategy_contexts(context_ref="htf_1"))
    spec = replace(
        base,
        components=replace(
            base.components,
            blockers=(blocker_htf_regime_gate(context_ref="htf_1", allowed_regimes=("aligned", "neutral")),),
        ),
    )
    wire = strategy_spec_to_dict(spec)
    blocker = wire["components"]["blockers"][0]
    assert blocker["context_consumption"]["policy"]["params"] == {
        "allowed_regimes": ["aligned", "neutral"],
    }
    restored = strategy_spec_from_report_dict(wire)
    consumption = restored.components.blockers[0].context_consumption
    assert consumption is not None
    assert dict(consumption.policy.params) == {"allowed_regimes": ["aligned", "neutral"]}

    legacy_wire = asdict(spec)
    restored_legacy = strategy_spec_from_report_dict(legacy_wire)
    legacy_consumption = restored_legacy.components.blockers[0].context_consumption
    assert legacy_consumption is not None
    assert dict(legacy_consumption.policy.params) == {"allowed_regimes": ["aligned", "neutral"]}


def test_signal_trace_after_htf_regime_gate_report_roundtrip() -> None:
    from tests.ema_pullback_context_helpers import (
        blocker_htf_regime_gate,
        htf_strategy_contexts,
    )

    base = make_ema_pullback_strategy_spec(contexts=htf_strategy_contexts(context_ref="htf_1"))
    spec = replace(
        base,
        components=replace(
            base.components,
            blockers=(blocker_htf_regime_gate(context_ref="htf_1", allowed_regimes=("aligned", "neutral")),),
        ),
    )
    restored = strategy_spec_from_report_dict(strategy_spec_to_dict(spec))
    plan = build_feature_plan_from_strategy_spec(restored)
    df = add_feature_columns_from_plan(_ohlcv(periods=30), plan)
    trace = build_signal_trace_from_spec(df, restored, plan, context_overlay_ref="htf_1")
    assert len(trace.times) == len(df)
    assert any(record.get("policy_id") == "htf_regime_gate" for record in trace.context_consumption_trace)


def test_strategy_spec_roundtrip_preserves_named_contexts() -> None:
    from research.strategies.ema_pullback.component_builders import exit_rsi, trade_management
    from tests.ema_pullback_context_helpers import exit_policy_htf_consumption, htf_strategy_contexts

    spec = make_ema_pullback_strategy_spec(
        contexts=htf_strategy_contexts(context_ref="htf_1"),
        trade_management_spec=trade_management(
            exit_policy_spec=exit_policy_htf_consumption(
                context_ref="htf_1",
                aligned=(exit_rsi(instance_id="rsi_profile"),),
            ),
        ),
    )
    wire = strategy_spec_to_dict(spec)
    assert isinstance(wire["contexts"], dict)
    assert "htf_1" in wire["contexts"]
    restored = strategy_spec_from_report_dict(wire)
    assert "htf_1" in restored.contexts_by_ref()
    consumption = restored.trade_management.exit_policy.context_consumption
    assert consumption is not None
    assert consumption.context_ref == "htf_1"


def test_strategy_spec_from_report_dict_accepts_legacy_contexts_list() -> None:
    from dataclasses import asdict
    from research.strategies.ema_pullback.component_builders import exit_rsi, trade_management
    from tests.ema_pullback_context_helpers import exit_policy_htf_consumption, htf_strategy_contexts

    spec = make_ema_pullback_strategy_spec(
        contexts=htf_strategy_contexts(context_ref="htf_1"),
        trade_management_spec=trade_management(
            exit_policy_spec=exit_policy_htf_consumption(
                context_ref="htf_1",
                aligned=(exit_rsi(instance_id="rsi_profile"),),
            ),
        ),
    )
    legacy_wire = asdict(spec)
    restored = strategy_spec_from_report_dict(legacy_wire)
    assert "htf_1" in restored.contexts_by_ref()


def test_signal_trace_after_strategy_spec_report_roundtrip() -> None:
    spec = make_ema_pullback_strategy_spec(trigger_lookback=2)
    restored = strategy_spec_from_report_dict(strategy_spec_to_dict(spec))
    plan = build_feature_plan_from_strategy_spec(restored)
    df = add_feature_columns_from_plan(_ohlcv(periods=30), plan)
    trace = build_signal_trace_from_spec(df, restored, plan)
    assert trace.meta["trigger_params"] == {"lookback": 2}
    assert len(trace.times) == len(df)


def test_portfolio_entry_false_when_stop_not_ready() -> None:
    spec = make_ema_pullback_strategy_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(periods=30), plan)
    trace = build_signal_trace_from_spec(df, spec, plan)

    for i, (signal, stop_ok, portfolio) in enumerate(
        zip(trace.long.signal_entry, trace.long.stop_ready, trace.long.portfolio_entry, strict=True)
    ):
        assert portfolio == (signal and stop_ok), f"bar {i}"


def test_slice_signal_trace_respects_window() -> None:
    spec = make_ema_pullback_strategy_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(periods=40), plan)
    full = build_signal_trace_from_spec(df, spec, plan)
    sliced = slice_signal_trace(
        full,
        from_time_sec=full.times[10],
        to_time_sec=full.times[20],
        max_bars=5000,
    )
    assert len(sliced.times) == 11
    assert sliced.long.direction_ok == full.long.direction_ok[10:21]


def test_slice_signal_trace_empty_htf_with_consumption_trace() -> None:
    """Chart loads trace before overlay ref: htf_context empty, consumption trace full-length."""
    from research.strategies.ema_pullback.component_builders import (
        component_stack,
        direction_ema_anchor_stack,
        exit_rsi,
        risk_no_filter,
        setup_untouched_anchor,
        trade_management,
        trigger_reclaim_anchor,
    )
    from tests.ema_pullback_context_helpers import (
        blocker_htf_regime_gate,
        exit_policy_htf_consumption,
        htf_strategy_contexts,
    )

    spec = make_ema_pullback_strategy_spec(
        contexts=htf_strategy_contexts(context_ref="htf_1"),
        components=component_stack(
            direction=direction_ema_anchor_stack(),
            blockers=(blocker_htf_regime_gate(context_ref="htf_1"),),
            setup=setup_untouched_anchor(),
            trigger=trigger_reclaim_anchor(),
            risk=risk_no_filter(),
        ),
        trade_management_spec=trade_management(
            exit_policy_spec=exit_policy_htf_consumption(
                context_ref="htf_1",
                aligned=(exit_rsi(instance_id="rsi_profile"),),
            ),
        ),
    )
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(periods=40), plan)
    full = build_signal_trace_from_spec(df, spec, plan, context_overlay_ref=None)
    assert full.htf_context["state"] == []
    assert len(full.context_consumption_trace) >= 1

    sliced = slice_signal_trace(
        full,
        from_time_sec=full.times[10],
        to_time_sec=full.times[20],
        max_bars=5000,
    )
    assert len(sliced.times) == 11
    assert sliced.htf_context["state"] == []
    blocker = next(r for r in sliced.context_consumption_trace if r["role"] == "blockers")
    assert len(blocker["context_applied"]) == 11


def test_slice_signal_trace_with_htf_overlay() -> None:
    from research.strategies.ema_pullback.component_builders import exit_rsi, trade_management
    from tests.ema_pullback_context_helpers import exit_policy_htf_consumption, htf_strategy_contexts

    spec = make_ema_pullback_strategy_spec(
        contexts=htf_strategy_contexts(context_ref="htf_1"),
        trade_management_spec=trade_management(
            exit_policy_spec=exit_policy_htf_consumption(
                context_ref="htf_1",
                aligned=(exit_rsi(instance_id="rsi_profile"),),
            ),
        ),
    )
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(periods=40), plan)
    full = build_signal_trace_from_spec(df, spec, plan, context_overlay_ref="htf_1")
    assert len(full.htf_context["state"]) == len(full.times)

    sliced = slice_signal_trace(
        full,
        from_time_sec=full.times[5],
        to_time_sec=full.times[15],
        max_bars=5000,
    )
    assert len(sliced.htf_context["state"]) == len(sliced.times) == 11
    assert sliced.htf_context["state"] == full.htf_context["state"][5:16]


def test_signal_trace_uses_side_specific_stop_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    spec = make_ema_pullback_strategy_spec(enabled_sides=("long", "short"))
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(periods=12), plan)

    def fake_exits(
        df_local: pd.DataFrame,
        _spec: object,
        _plan: object,
        *,
        context_bundle: object | None = None,
    ) -> PortfolioExitOutputs:
        _ = context_bundle
        idx = df_local.index
        false_s = pd.Series(False, index=idx, dtype=bool)
        nan_s = pd.Series(float("nan"), index=idx, dtype=float)
        return PortfolioExitOutputs(
            exits=false_s,
            short_exits=false_s,
            sl_stop=nan_s,
            tp_stop=nan_s,
            stop_ready_long=pd.Series([True] * len(idx), index=idx, dtype=bool),
            stop_ready_short=pd.Series([False] * len(idx), index=idx, dtype=bool),
            context_state=pd.Series("neutral", index=idx, dtype="object"),
            profile_long=pd.Series("neutral", index=idx, dtype="object"),
            profile_short=pd.Series("neutral", index=idx, dtype="object"),
            long_exits_by_profile={"aligned": false_s, "countertrend": false_s, "neutral": false_s},
            short_exits_by_profile={"aligned": false_s, "countertrend": false_s, "neutral": false_s},
            sl_stop_by_profile={"aligned": nan_s, "countertrend": nan_s, "neutral": nan_s},
            tp_stop_by_profile={"aligned": nan_s, "countertrend": nan_s, "neutral": nan_s},
        )

    monkeypatch.setattr(
        "research.strategies.ema_pullback.execution.signal_trace.build_exit_outputs_from_spec",
        fake_exits,
    )

    trace = build_signal_trace_from_spec(df, spec, plan)
    assert all(trace.long.stop_ready)
    assert not any(trace.short.stop_ready)
