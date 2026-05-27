"""Strategy-level contexts and exit policy consumption."""

from __future__ import annotations

import pytest

from research.strategies.ema_pullback.component_builders import (
    context_consumption,
    context_provider,
    exit_policy,
    strategy_contexts,
)
from research.strategies.ema_pullback.context.bundle import ContextBundle
from research.strategies.ema_pullback.context.policies import EXIT_PROFILE_BY_HTF_STATE_POLICY
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.instance_loader import (
    EmaPullbackInstanceValidationError,
    load_ema_pullback_instance,
)
from research.strategies.ema_pullback.spec import ContextConsumptionSpec, ExitPolicySpec
from research.strategies.ema_pullback.spec_instances import make_ema_pullback_strategy_spec
from tests.ema_pullback_context_helpers import exit_policy_htf_consumption


def test_exit_policy_rejects_profile_exits_without_consumption() -> None:
    from research.strategies.ema_pullback.component_builders import exit_rsi

    base = make_ema_pullback_strategy_spec()
    with pytest.raises(ValueError, match="context_consumption is required"):
        ExitPolicySpec(
            always_on=base.trade_management.exit_policy.always_on,
            profiles=exit_policy_htf_consumption(
                aligned=(exit_rsi(instance_id="profile_exit"),),
            ).profiles,
            context_consumption=None,
        )


def test_always_on_only_exit_policy_without_consumption_is_valid() -> None:
    spec = make_ema_pullback_strategy_spec(
        contexts=(),
        trade_management_spec=make_ema_pullback_strategy_spec().trade_management,
    )
    assert spec.trade_management.exit_policy.context_consumption is None


def test_context_ref_keys_are_case_sensitive() -> None:
    spec = make_ema_pullback_strategy_spec(
        contexts=strategy_contexts(
            (
                ("htf", context_provider(timeframe="4h", fast_period=10, anchor_period=20, slow_period=30)),
                ("HTF", context_provider(timeframe="1d", fast_period=11, anchor_period=21, slow_period=31)),
            )
        ),
    )
    assert set(spec.contexts_by_ref()) == {"htf", "HTF"}


def test_loader_rejects_exit_policy_context() -> None:
    instance = {
        "instance_id": "legacy",
        "variant": "v",
        "market": {"symbol": "BTCUSDT", "base_timeframe": "1h"},
        "strategy": {
            "trade_sides": ["long"],
            "anchor_stack": {"source": "close", "timeframe": "base", "fast": 100, "anchor": 200, "slow": 1000},
            "direction": {"component_id": "ema_anchor_stack_trend"},
            "setup": {"component_id": "untouched_anchor_setup", "lookback": 50, "active_bars": 3},
            "trigger": {"component_id": "reclaim_anchor"},
            "blockers": [{"instance_id": "no_blockers", "component_id": "no_blockers"}],
            "risk": {"component_id": "no_risk_filter"},
            "contexts": {},
            "trade_management": {
                "exit_policy": {
                    "context": {
                        "component_id": "htf_context",
                        "timeframe": "4h",
                        "source": "close",
                        "fast_period": 100,
                        "anchor_period": 200,
                        "slow_period": 1000,
                    },
                    "always_on": {"exits": []},
                    "profiles": {
                        "aligned": {"exits": []},
                        "countertrend": {"exits": []},
                        "neutral": {"exits": []},
                    },
                }
            },
        },
    }
    with pytest.raises(EmaPullbackInstanceValidationError, match="exit_policy.context is no longer supported"):
        load_ema_pullback_instance(instance)


def test_context_bundle_builds_per_ref() -> None:
    pytest.importorskip("pandas")
    import pandas as pd

    spec = make_ema_pullback_strategy_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    idx = pd.date_range("2024-01-01", periods=3, freq="h", tz="UTC")
    close = pd.Series([100.0, 101.0, 102.0], index=idx)
    df = pd.DataFrame({"close": close, "open": close, "high": close, "low": close, "volume": 1.0}, index=idx)
    for col in plan.htf_context_columns_for("htf").values():
        df[col] = close
    bundle = ContextBundle.build(spec, df, plan)
    assert bundle.has("htf")
    assert bundle.get("htf").state_series().tolist() == ["neutral", "neutral", "neutral"]
