"""Feature calculations for Stage 10 FeaturePlan."""

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
    """Calculate only columns requested by FeaturePlan."""

    out = df.copy()
    close = out["close"].astype(float)
    high = out["high"].astype(float)
    low = out["low"].astype(float)

    for feature in plan.features:
        if feature.kind == "ema":
            source = str(feature.params["source"])
            if source != "close":
                raise ValueError(f"unsupported ema source {source!r}")
            period = int(feature.params["period"])
            out[feature.column] = close.ewm(span=period, adjust=False).mean()
            continue

        if feature.kind == "atr":
            period = int(feature.params["period"])
            out[feature.column] = _atr_rolling_mean(high, low, close, period=period)
            continue

        if feature.kind == "atr_distance":
            base_col = str(feature.params["base_column"])
            multiplier = float(feature.params["multiplier"])
            if base_col not in out.columns:
                raise KeyError(f"missing base ATR column {base_col!r} for atr_distance")
            out[feature.column] = out[base_col].astype(float) * multiplier
            continue

        raise ValueError(f"unsupported feature kind {feature.kind!r}")
    return out


def add_ema_columns(
    df: pd.DataFrame,
    *,
    ema_fast: int,
    ema_slow: int,
    extra_periods: tuple[int, ...] = (),
) -> pd.DataFrame:
    """Utility helper kept for shared smoke helpers."""

    out = df.copy()
    close = out["close"].astype(float)
    for period in sorted({ema_fast, ema_slow, *extra_periods}):
        out[f"ema_{period}"] = close.ewm(span=period, adjust=False).mean()
    return out
