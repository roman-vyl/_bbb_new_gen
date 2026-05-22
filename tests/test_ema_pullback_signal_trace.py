from __future__ import annotations

from dataclasses import replace

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.execution.signal_trace import (
    build_signal_trace_from_spec,
    slice_signal_trace,
)
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
