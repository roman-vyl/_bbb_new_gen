"""Feature columns from OHLCV DataFrame only (no IO, no vectorbt)."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.features.plan import FeaturePlan


def _true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    prev_close = close.shift(1)
    h_l = high - low
    h_pc = (high - prev_close).abs()
    l_pc = (low - prev_close).abs()
    return pd.concat([h_l, h_pc, l_pc], axis=1).max(axis=1)


def _atr_rolling_mean(high: pd.Series, low: pd.Series, close: pd.Series, *, period: int) -> pd.Series:
    tr = _true_range(high, low, close)
    return tr.rolling(window=period, min_periods=period).mean()


def add_feature_columns_from_plan(df: pd.DataFrame, plan: FeaturePlan) -> pd.DataFrame:
    out = df.copy()
    close = out["close"].astype(float)
    high = out["high"].astype(float)
    low = out["low"].astype(float)

    for feature in plan.features:
        if feature.kind == "ema":
            assert feature.period is not None
            out[feature.feature_id] = close.ewm(span=feature.period, adjust=False).mean()
            continue
        if feature.kind == "atr":
            assert feature.period is not None
            out[feature.feature_id] = _atr_rolling_mean(high, low, close, period=feature.period)
            continue
        if feature.kind == "atr_distance":
            if feature.base_feature_id is None or feature.multiplier is None:
                raise ValueError("atr_distance planned feature requires base_feature_id and multiplier")
            out[feature.feature_id] = out[feature.base_feature_id].astype(float) * float(feature.multiplier)
            continue
        raise ValueError(f"unsupported feature kind: {feature.kind!r}")
    return out
