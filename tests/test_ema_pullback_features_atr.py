from __future__ import annotations

import pytest

pytest.importorskip("pandas")

import pandas as pd

from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec_instances import default_ema_pullback_strategy_spec


def _ohlcv(n: int = 30) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=n, freq="h", tz="UTC")
    close = pd.Series([100.0 + float(i) * 0.5 for i in range(n)], index=idx)
    return pd.DataFrame(
        {
            "open": close,
            "high": close + 0.2,
            "low": close - 0.2,
            "close": close,
            "volume": 1.0,
        },
        index=idx,
    )


def test_feature_plan_ids_follow_strategy_spec() -> None:
    spec = default_ema_pullback_strategy_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    ema_feats = [f for f in plan.features if f.kind == "ema"]
    assert {f.period for f in ema_feats} == {
        spec.anchor_stack.fast.period,
        spec.anchor_stack.anchor.period,
        spec.anchor_stack.slow.period,
    }
    for f in ema_feats:
        assert f.feature_id == f"ema_close_base_{f.period}"

    atr_feats = [f for f in plan.features if f.kind == "atr"]
    assert len(atr_feats) == 1
    atr_periods = {r.distance.period for r in spec.trade_management.exit_rules}
    assert atr_feats[0].period in atr_periods
    assert atr_feats[0].feature_id == f"atr_close_base_{atr_feats[0].period}"

    dist_feats = [f for f in plan.features if f.kind == "atr_distance"]
    assert len(dist_feats) == len(spec.trade_management.exit_rules)
    by_mult = {f.multiplier: f.feature_id for f in dist_feats}
    for rule in spec.trade_management.exit_rules:
        assert rule.distance.multiplier in by_mult
        assert by_mult[rule.distance.multiplier] == plan.exit_distance_columns[rule.rule_type]


def test_add_feature_columns_from_plan_creates_expected_columns() -> None:
    spec = default_ema_pullback_strategy_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(40), plan)
    for f in plan.features:
        assert f.feature_id in df.columns


def test_atr_distance_columns_follow_plan_multipliers() -> None:
    spec = default_ema_pullback_strategy_spec()
    plan = build_feature_plan_from_strategy_spec(spec)
    df = add_feature_columns_from_plan(_ohlcv(40), plan)
    atr_col = next(f.feature_id for f in plan.features if f.kind == "atr")
    atr = df[atr_col].astype(float)
    valid = atr.notna()
    for f in plan.features:
        if f.kind != "atr_distance" or f.multiplier is None or f.base_feature_id is None:
            continue
        col = df[f.feature_id].astype(float)
        m = float(f.multiplier)
        pd.testing.assert_series_equal(col.where(valid), (m * atr).where(valid), check_names=False)
