from __future__ import annotations

from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec_instances import ema_pullback_fast20_anchor200_slow1000_spec


def test_feature_plan_expected_feature_ids() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    ids = {item.feature_id for item in plan.features}
    assert ids == {
        "ema_close_base_20",
        "ema_close_base_200",
        "ema_close_base_1000",
        "atr_close_base_14",
        "atr_close_base_14_x1_5",
        "atr_close_base_14_x4_0",
    }


def test_feature_plan_no_duplicate_base_atr() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    atr_ids = [item.feature_id for item in plan.features if item.feature_id == "atr_close_base_14"]
    assert len(atr_ids) == 1


def test_feature_plan_role_mapping_fast_anchor_slow() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    assert plan.anchor_columns == {
        "fast": "ema_close_base_20",
        "anchor": "ema_close_base_200",
        "slow": "ema_close_base_1000",
    }


def test_feature_plan_exit_mapping_stop_take() -> None:
    spec = ema_pullback_fast20_anchor200_slow1000_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    assert plan.exit_distance_columns == {
        "stop_loss_by_distance": "atr_close_base_14_x1_5",
        "take_profit_by_distance": "atr_close_base_14_x4_0",
    }
