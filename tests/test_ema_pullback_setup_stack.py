"""Setup stack: multiple setup gates AND-composed."""

from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.execution.signals import build_signals_from_spec
from research.strategies.ema_pullback.execution.signal_trace import build_signal_trace_from_spec
from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.experiments.config_loader import load_strategy_config
from tests.test_external_config_loader import _bundle, _instance


def _ohlcv(periods: int = 40) -> pd.DataFrame:
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


def test_load_dual_setup_stack() -> None:
    instance = _instance("dual_setup")
    strategy = instance["strategy"]
    assert isinstance(strategy, dict)
    strategy["setups"] = [
        {
            "instance_id": "untouched_anchor",
            "component_id": "untouched_anchor_setup",
            "lookback": 50,
            "active_bars": 3,
        },
        {
            "instance_id": "bounce_counter",
            "component_id": "ema_bounce_counter_setup",
            "params": {
                "fast_ema": 50,
                "anchor_ema": 200,
                "slow_ema": 500,
                "max_bounces": 3,
                "raw_touch_mode": "range_cross",
                "touch_lookback_bars": 10,
                "trend_start_confirmation_bars": 1,
                "trend_break_confirmation_bars": 1,
            },
        },
    ]
    loaded = load_strategy_config(_bundle([instance]))
    spec = loaded.specs[0]
    assert len(spec.setups) == 2
    assert {r.instance_id for r in spec.setups} == {"untouched_anchor", "bounce_counter"}


def test_dual_setup_and_gate_blocks_when_one_setup_denies() -> None:
    from dataclasses import replace

    from research.strategies.ema_pullback.component_builders import (
        component_stack,
        ema_bounce_counter_setup_spec,
        setup_rule,
    )
    from research.strategies.ema_pullback.spec_instances import make_ema_pullback_strategy_spec

    spec = replace(
        make_ema_pullback_strategy_spec(enabled_sides=("long",)),
        setups=(
            setup_rule(
                instance_id="untouched_anchor",
                component_id="untouched_anchor_setup",
                params=make_ema_pullback_strategy_spec().setups[0].params,
            ),
            setup_rule(
                instance_id="bounce_counter",
                component_id="ema_bounce_counter_setup",
                params=ema_bounce_counter_setup_spec(max_bounces=1),
            ),
        ),
    )
    plan = build_feature_plan_from_strategy_spec(spec)
    assert len(plan.features) == len({f.feature_id for f in plan.features})
    df = add_feature_columns_from_plan(_ohlcv(), plan)
    signals = build_signals_from_spec(df, spec, plan)
    trace = build_signal_trace_from_spec(df, spec, plan)
    assert "setups" in trace.long.internals
    assert "setup" not in trace.long.internals
    assert "untouched_anchor" in trace.long.internals["setups"]
    assert "bounce_counter" in trace.long.internals["setups"]
    assert not any(signals.entries.fillna(False).astype(bool))
