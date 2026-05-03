"""Feature columns from OHLCV DataFrame only (no IO, no vectorbt)."""

from __future__ import annotations

import pandas as pd

from data_engine.contracts import pandas_freq_alias
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


def _rsi_rolling_mean(close: pd.Series, *, period: int) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def _resample_ohlcv(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    freq = pandas_freq_alias(timeframe)
    resampled = df.resample(freq, label="left", closed="left").agg(
        {
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }
    )
    return resampled.dropna(subset=["open", "high", "low", "close"])


def _align_completed_feature_to_base(
    feature: pd.Series,
    *,
    timeframe: str,
    base_index: pd.Index,
) -> pd.Series:
    freq = pandas_freq_alias(timeframe)
    completed = feature.copy()
    completed.index = completed.index + pd.tseries.frequencies.to_offset(freq)
    return completed.reindex(base_index, method="ffill")


def add_feature_columns_from_plan(df: pd.DataFrame, plan: FeaturePlan) -> pd.DataFrame:
    out = df.copy()
    frames: dict[str, pd.DataFrame] = {"base": out}

    for feature in plan.features:
        feature_frame = frames.get(feature.timeframe)
        if feature_frame is None:
            feature_frame = _resample_ohlcv(out, feature.timeframe)
            frames[feature.timeframe] = feature_frame
        close = feature_frame["close"].astype(float)
        high = feature_frame["high"].astype(float)
        low = feature_frame["low"].astype(float)
        if feature.kind == "ema":
            assert feature.period is not None
            values = close.ewm(span=feature.period, adjust=False).mean()
            if feature.timeframe != "base":
                values = _align_completed_feature_to_base(
                    values,
                    timeframe=feature.timeframe,
                    base_index=out.index,
                )
            out[feature.feature_id] = values
            continue
        if feature.kind == "atr":
            assert feature.period is not None
            values = _atr_rolling_mean(high, low, close, period=feature.period)
            if feature.timeframe != "base":
                values = _align_completed_feature_to_base(
                    values,
                    timeframe=feature.timeframe,
                    base_index=out.index,
                )
            out[feature.feature_id] = values
            continue
        if feature.kind == "atr_distance":
            if feature.base_feature_id is None or feature.multiplier is None:
                raise ValueError("atr_distance planned feature requires base_feature_id and multiplier")
            out[feature.feature_id] = out[feature.base_feature_id].astype(float) * float(feature.multiplier)
            continue
        if feature.kind == "rsi":
            assert feature.period is not None
            values = _rsi_rolling_mean(close, period=feature.period)
            if feature.timeframe != "base":
                values = _align_completed_feature_to_base(
                    values,
                    timeframe=feature.timeframe,
                    base_index=out.index,
                )
            out[feature.feature_id] = values
            continue
        raise ValueError(f"unsupported feature kind: {feature.kind!r}")
    return out
