"""Signal building from StrategySpec + FeaturePlan."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.features.plan import FeaturePlan
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec


def build_signals_from_spec(
    df: pd.DataFrame,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
) -> tuple[pd.Series, pd.Series]:
    """Build Stage 10 long entries and exits using plan column mappings."""

    fast_col = plan.anchor_columns["fast"]
    anchor_col = plan.anchor_columns["anchor"]
    slow_col = plan.anchor_columns["slow"]

    direction = (df[fast_col] > df[anchor_col]) & (df[anchor_col] > df[slow_col])
    setup = (
        (df["low"].astype(float) <= df[anchor_col].astype(float))
        .rolling(window=spec.setup.lookback, min_periods=1)
        .max()
        .astype(bool)
    )
    close = df["close"].astype(float)
    anchor = df[anchor_col].astype(float)
    trigger = (close.shift(1) <= anchor.shift(1)) & (close > anchor)

    entries = (direction & setup & trigger).fillna(False).astype(bool)
    exits = pd.Series(False, index=df.index, dtype=bool)
    return entries, exits


def crossover_from_ema_columns(
    df: pd.DataFrame,
    fast_col: str,
    slow_col: str,
) -> tuple[pd.Series, pd.Series]:
    """Utility crossover helper used by legacy smoke helper module."""

    fast = df[fast_col]
    slow = df[slow_col]
    entries = ((fast > slow) & (fast.shift(1) <= slow.shift(1))).fillna(False).astype(bool)
    exits = ((fast < slow) & (fast.shift(1) >= slow.shift(1))).fillna(False).astype(bool)
    return entries, exits
