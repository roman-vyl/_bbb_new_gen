"""Trade management from prepared FeaturePlan distance columns."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.features.plan import FeaturePlan
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec


def build_stops_from_trade_management(
    df: pd.DataFrame,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
) -> dict[str, pd.Series]:
    """Build vectorbt stop kwargs from already prepared distance columns."""

    _ = spec
    stop_col = plan.exit_distance_columns["stop_loss_by_distance"]
    take_col = plan.exit_distance_columns["take_profit_by_distance"]
    close = df["close"].astype(float)
    return {
        "sl_stop": (df[stop_col].astype(float) / close),
        "tp_stop": (df[take_col].astype(float) / close),
    }
