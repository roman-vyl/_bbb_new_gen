"""Stage 10: StrategySpec, FeaturePlan, spec-driven features and trade management."""

from __future__ import annotations

from dataclasses import replace

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.config import DEFAULT_CONFIG, StrategyConfig, strategy_config_id
from research.strategies.ema_pullback.execution.signals import ema_pullback_pipeline_signals_from_strategy_spec
from research.strategies.ema_pullback.execution.trade_management import (
    RULE_BASED_DISTANCE_COLUMNS_PROFILE,
    prepared_distance_sl_tp_portfolio_kwargs,
    resolve_portfolio_kwargs_for_signals,
    resolve_trade_management_profile,
)
from research.strategies.ema_pullback.features import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import (
    build_feature_plan_from_strategy_spec,
    distance_columns_for_rule_based_trade_management,
    ema_feature_id,
)
from research.strategies.ema_pullback.instance import StrategyInstance
from research.strategies.ema_pullback.spec import (
    AnchorStackSpec,
    AtrDistanceSpec,
    DistanceExitRuleSpec,
    EmaSpec,
    TradeManagementSpec,
    ema_pullback_fast20_anchor200_slow1000_spec,
    strategy_spec_identity,
)
from research.strategies.ema_pullback.components import (
    FAST_ANCHOR_SLOW_STACK_LONG_COMPONENT,
    PULLBACK_TO_ANCHOR_COMPONENT,
    RECLAIM_ANCHOR_COMPONENT,
    resolve_component,
)
from research.strategies.ema_pullback.components.direction import fast_anchor_slow_stack_long
from research.strategies.ema_pullback.components.setup import pullback_to_anchor
from research.strategies.ema_pullback.components.triggers import reclaim_anchor


def test_ema_spec_accepts_base_timeframe() -> None:
    EmaSpec(source="close", timeframe="base", period=20)


def test_ema_spec_rejects_non_base_timeframe() -> None:
    with pytest.raises(ValueError, match="base"):
        EmaSpec("close", "4h", 20)  # type: ignore[call-arg,misc]


def test_anchor_stack_spec_fields() -> None:
    stack = AnchorStackSpec(
        fast=EmaSpec(source="close", timeframe="base", period=20),
        anchor=EmaSpec(source="close", timeframe="base", period=200),
        slow=EmaSpec(source="close", timeframe="base", period=1000),
    )
    assert stack.fast.period == 20
    assert stack.anchor.period == 200
    assert stack.slow.period == 1000


def test_atr_distance_spec_fields() -> None:
    d = AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5)
    assert d.timeframe == "base"
    assert d.period == 14
    assert d.multiplier == 1.5


def test_distance_exit_rule_stop() -> None:
    r = DistanceExitRuleSpec(
        rule_type="stop_loss_by_distance",
        distance=AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5),
    )
    assert r.rule_type == "stop_loss_by_distance"


def test_distance_exit_rule_take() -> None:
    r = DistanceExitRuleSpec(
        rule_type="take_profit_by_distance",
        distance=AtrDistanceSpec(timeframe="base", period=14, multiplier=4.0),
    )
    assert r.rule_type == "take_profit_by_distance"


def test_trade_management_spec_exit_rules() -> None:
    tm = TradeManagementSpec(
        profile="rule_based",
        exit_rules=(
            DistanceExitRuleSpec(
                rule_type="stop_loss_by_distance",
                distance=AtrDistanceSpec(timeframe="base", period=14, multiplier=1.5),
            ),
            DistanceExitRuleSpec(
                rule_type="take_profit_by_distance",
                distance=AtrDistanceSpec(timeframe="base", period=14, multiplier=4.0),
            ),
        ),
    )
    assert len(tm.exit_rules) == 2


def test_ema_pullback_strategy_spec_factory() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    assert spec.variant == "ema_pullback_fast20_anchor200_slow1000"
    assert spec.anchor_stack.fast.period == 20
    assert spec.anchor_stack.anchor.period == 200
    assert spec.anchor_stack.slow.period == 1000


def test_build_feature_plan_ema_periods() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    ids = {f.id for f in plan.features}
    assert "ema_close_base_20" in ids
    assert "ema_close_base_200" in ids
    assert "ema_close_base_1000" in ids


def test_build_feature_plan_atr_base_once() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    atr_base = [f for f in plan.features if f.id == "atr_close_base_14"]
    assert len(atr_base) == 1


def test_build_feature_plan_scaled_distances() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    ids = {f.id: f for f in plan.features}
    assert "atr_close_base_14_x1_5" in ids
    assert ids["atr_close_base_14_x1_5"].multiplier == 1.5
    assert "atr_close_base_14_x4_0" in ids
    assert ids["atr_close_base_14_x4_0"].multiplier == 4.0


def test_build_feature_plan_dedupes() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    assert len(plan.features) == len({f.id for f in plan.features})


def test_add_feature_columns_from_plan_ema_and_atr_distance() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    idx = pd.date_range("2024-01-01", periods=50, freq="h", tz="UTC")
    base = 100.0 + pd.Series(range(len(idx)), dtype=float, index=idx).cumsum() * 0.01
    df = pd.DataFrame(
        {
            "open": base,
            "high": base + 0.5,
            "low": base - 0.5,
            "close": base,
            "volume": 1.0,
        },
        index=idx,
    )
    out = add_feature_columns_from_plan(df, plan)
    assert "ema_close_base_20" in out.columns
    assert "atr_close_base_14_x1_5" in out.columns
    x15 = out["atr_close_base_14_x1_5"].dropna()
    base_atr = out["atr_close_base_14"].dropna()
    assert len(x15) > 0
    ratio = (x15 / base_atr.reindex(x15.index)).astype(float)
    assert bool((ratio - 1.5).abs().lt(1e-9).all())


def test_fast_anchor_slow_direction() -> None:
    idx = pd.date_range("2024-01-01", periods=3, freq="h", tz="UTC")
    df = pd.DataFrame(
        {
            "fast": [1.0, 2.0, 3.0],
            "mid": [0.5, 1.5, 2.5],
            "slow": [0.0, 1.0, 2.0],
        },
        index=idx,
    )
    s = fast_anchor_slow_stack_long(df, fast_col="fast", anchor_col="mid", slow_col="slow")
    assert bool(s.iloc[-1])


def test_pullback_to_anchor_setup() -> None:
    idx = pd.date_range("2024-01-01", periods=5, freq="h", tz="UTC")
    df = pd.DataFrame(
        {
            "low": [10.0, 9.0, 10.5, 10.0, 10.0],
            "anchor": [10.0, 10.0, 10.0, 10.0, 10.0],
        },
        index=idx,
    )
    s = pullback_to_anchor(df, anchor_col="anchor", lookback=3)
    assert s.dtype == bool


def test_reclaim_anchor_trigger() -> None:
    idx = pd.date_range("2024-01-01", periods=3, freq="h", tz="UTC")
    df = pd.DataFrame(
        {
            "close": [9.0, 9.5, 11.0],
            "anchor": [10.0, 10.0, 10.0],
        },
        index=idx,
    )
    s = reclaim_anchor(df, anchor_col="anchor")
    assert bool(s.iloc[-1])


def test_trade_management_uses_explicit_distance_columns_not_indicator_math() -> None:
    idx = pd.date_range("2024-01-01", periods=4, freq="h", tz="UTC")
    close = pd.Series([100.0, 101.0, 102.0, 103.0], index=idx)
    stop_c = "col_stop_units"
    take_c = "col_take_units"
    df = pd.DataFrame({stop_c: [1.0, 2.0, 3.0, 4.0], take_c: [2.0, 4.0, 6.0, 8.0]}, index=idx)
    kwargs = prepared_distance_sl_tp_portfolio_kwargs(
        df, close=close, stop_distance_column=stop_c, take_distance_column=take_c
    )
    assert float(kwargs["sl_stop"].iloc[0]) == pytest.approx(0.01)


def test_resolve_portfolio_kwargs_rule_based_profile() -> None:
    idx = pd.date_range("2024-01-01", periods=3, freq="h", tz="UTC")
    close = pd.Series([100.0, 100.0, 100.0], index=idx)
    df = pd.DataFrame({"s_dist": [1.0, 1.0, 1.0], "t_dist": [2.0, 2.0, 2.0]}, index=idx)
    tm = resolve_trade_management_profile(RULE_BASED_DISTANCE_COLUMNS_PROFILE)
    kwargs = resolve_portfolio_kwargs_for_signals(
        tm,
        df=df,
        close=close,
        feature_profile_id="ema_pullback_default",
        stop_distance_column="s_dist",
        take_distance_column="t_dist",
    )
    assert "sl_stop" in kwargs


def test_strategy_config_with_spec_identity_changes_hash() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    cfg = replace(
        DEFAULT_CONFIG,
        variant=spec.variant,
        ema_fast=20,
        ema_slow=1000,
        strategy_spec=spec,
    )
    base = strategy_config_id(DEFAULT_CONFIG)
    assert strategy_config_id(cfg) != base


def test_stage10_variant_instance_roundtrip() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec(
        symbol=DEFAULT_CONFIG.symbol,
        base_timeframe=DEFAULT_CONFIG.timeframe,
    )
    cfg = replace(
        DEFAULT_CONFIG,
        variant=spec.variant,
        ema_fast=20,
        ema_slow=1000,
        direction_component=FAST_ANCHOR_SLOW_STACK_LONG_COMPONENT,
        setup_component=PULLBACK_TO_ANCHOR_COMPONENT,
        trigger_component=RECLAIM_ANCHOR_COMPONENT,
        trade_management_profile=RULE_BASED_DISTANCE_COLUMNS_PROFILE,
        strategy_spec=spec,
    )
    inst = StrategyInstance.from_config(cfg)
    assert inst.config.strategy_spec is not None
    assert strategy_spec_identity(inst.config.strategy_spec)["variant"] == spec.variant


def test_pipeline_signals_from_spec_smoke() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    idx = pd.date_range("2024-01-01", periods=120, freq="h", tz="UTC")
    c = 100.0 + pd.Series(range(len(idx)), dtype=float, index=idx).cumsum() * 0.02
    df = add_feature_columns_from_plan(
        pd.DataFrame(
            {"open": c, "high": c + 0.2, "low": c - 0.2, "close": c, "volume": 1.0},
            index=idx,
        ),
        plan,
    )
    e, x = ema_pullback_pipeline_signals_from_strategy_spec(
        df,
        strategy_spec=spec,
        direction_component=FAST_ANCHOR_SLOW_STACK_LONG_COMPONENT,
        setup_component=PULLBACK_TO_ANCHOR_COMPONENT,
        trigger_component=RECLAIM_ANCHOR_COMPONENT,
    )
    assert e.dtype == bool and x.dtype == bool


def test_distance_columns_from_spec() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    s, t = distance_columns_for_rule_based_trade_management(spec)
    assert s == "atr_close_base_14_x1_5"
    assert t == "atr_close_base_14_x4_0"


def test_new_stage10_components_resolve() -> None:
    assert resolve_component("direction", FAST_ANCHOR_SLOW_STACK_LONG_COMPONENT).func is fast_anchor_slow_stack_long
    assert resolve_component("setup", PULLBACK_TO_ANCHOR_COMPONENT).func is pullback_to_anchor
    assert resolve_component("trigger", RECLAIM_ANCHOR_COMPONENT).func is reclaim_anchor
