"""Prepared OHLCV series and family-local feature profile bindings."""

from research.strategies.ema_pullback.features.calculations import (
    add_ema_columns,
    add_feature_columns,
    add_feature_columns_from_plan,
)
from research.strategies.ema_pullback.features.plan import (
    FeaturePlan,
    PlannedFeature,
    build_feature_plan_from_strategy_spec,
    distance_columns_for_rule_based_trade_management,
    ema_feature_id,
)

__all__ = [
    "FeaturePlan",
    "PlannedFeature",
    "add_ema_columns",
    "add_feature_columns",
    "add_feature_columns_from_plan",
    "build_feature_plan_from_strategy_spec",
    "distance_columns_for_rule_based_trade_management",
    "ema_feature_id",
]
