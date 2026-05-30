"""Setup components for ema_pullback StrategySpec pipeline."""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.spec import TradeSide


def untouched_anchor_setup_trace(
    df: pd.DataFrame,
    anchor_col: str,
    lookback: int,
    active_bars: int,
    side: TradeSide = "long",
) -> dict[str, pd.Series]:
    """Per-bar internals for untouched_anchor_setup (same formulas as final setup)."""

    if lookback <= 0:
        raise ValueError("lookback must be > 0")
    if active_bars <= 0:
        raise ValueError("active_bars must be > 0")

    anchor = df[anchor_col].astype(float)

    if side == "long":
        touch = df["low"].astype(float) <= anchor
        side_ok = df["close"].astype(float) > anchor
    elif side == "short":
        touch = df["high"].astype(float) >= anchor
        side_ok = df["close"].astype(float) < anchor
    else:
        raise ValueError("side must be 'long' or 'short'")

    prior_touch = touch.shift(1, fill_value=False).astype(bool)
    untouched_prior = (
        ~prior_touch.rolling(lookback, min_periods=lookback).max().astype(bool)
        & pd.Series([i >= lookback for i in range(len(df))], index=df.index, dtype=bool)
    )
    armed_pre = side_ok & untouched_prior & ~touch
    first_touch = touch & untouched_prior
    touch_active = first_touch.rolling(active_bars, min_periods=1).max().astype(bool)
    setup = (armed_pre | touch_active).astype(bool)

    return {
        "touch": touch.astype(bool),
        "side_ok": side_ok.astype(bool),
        "prior_touch": prior_touch,
        "untouched_prior": untouched_prior.astype(bool),
        "armed_pre": armed_pre.astype(bool),
        "first_touch": first_touch.astype(bool),
        "touch_active": touch_active.astype(bool),
        "setup": setup,
    }


def untouched_anchor_setup(
    df: pd.DataFrame,
    anchor_col: str,
    lookback: int,
    active_bars: int,
    side: TradeSide = "long",
) -> pd.Series:
    """True during armed regime: anchor untouched for lookback bars, then through touch window."""

    return untouched_anchor_setup_trace(df, anchor_col, lookback, active_bars, side=side)["setup"]


def _bool_series(index: pd.Index, values: list[bool]) -> pd.Series:
    return pd.Series(values, index=index, dtype=bool)


def _int_series(index: pd.Index, values: list[int]) -> pd.Series:
    return pd.Series(values, index=index, dtype="int64")


def _str_series(index: pd.Index, values: list[str]) -> pd.Series:
    return pd.Series(values, index=index, dtype=object)


def ema_bounce_counter_setup_trace(
    df: pd.DataFrame,
    fast_col: str,
    anchor_col: str,
    slow_col: str,
    *,
    max_bounces: int = 3,
    raw_touch_mode: str = "range_cross",
    touch_lookback_bars: int = 10,
    trend_start_confirmation_bars: int = 1,
    trend_break_confirmation_bars: int = 1,
    side: TradeSide = "long",
) -> dict[str, pd.Series]:
    """Market-state bounce counter for anchor EMA interactions inside trend episodes."""

    if max_bounces <= 0:
        raise ValueError("max_bounces must be > 0")
    if raw_touch_mode != "range_cross":
        raise ValueError("raw_touch_mode must be 'range_cross'")
    if touch_lookback_bars <= 0:
        raise ValueError("touch_lookback_bars must be > 0")
    if trend_start_confirmation_bars <= 0:
        raise ValueError("trend_start_confirmation_bars must be > 0")
    if trend_break_confirmation_bars <= 0:
        raise ValueError("trend_break_confirmation_bars must be > 0")
    if side not in {"long", "short"}:
        raise ValueError("side must be 'long' or 'short'")

    fast = df[fast_col].astype(float)
    anchor = df[anchor_col].astype(float)
    slow = df[slow_col].astype(float)
    close = df["close"].astype(float)
    low = df["low"].astype(float)
    high = df["high"].astype(float)

    if side == "long":
        raw_trend = fast > anchor
        raw_trend = raw_trend & (anchor > slow)
        armed_series = close > anchor
    else:
        raw_trend = fast < anchor
        raw_trend = raw_trend & (anchor < slow)
        armed_series = close < anchor
    raw_touch_series = (low <= anchor) & (anchor <= high)

    trend_active_values: list[bool] = []
    trend_episode_id_values: list[int] = []
    armed_values: list[bool] = []
    raw_touch_values: list[bool] = []
    pending_values: list[bool] = []
    in_lookback_values: list[bool] = []
    lookback_left_values: list[int] = []
    completed_values: list[int] = []
    effective_values: list[int] = []
    setup_allowed_values: list[bool] = []
    price_side_values: list[str] = []
    trend_start_values: list[bool] = []
    trend_break_values: list[bool] = []
    pending_start_values: list[bool] = []
    pending_end_values: list[bool] = []

    trend_active = False
    trend_episode_id = 0
    raw_trend_run = 0
    raw_break_run = 0
    completed_count = 0
    pending = False
    pending_end_idx = -1

    for i in range(len(df)):
        raw_trend_active = bool(raw_trend.iloc[i])
        armed = bool(armed_series.iloc[i])
        raw_touch = bool(raw_touch_series.iloc[i])
        price_side = (
            "above" if float(close.iloc[i]) > float(anchor.iloc[i])
            else "below" if float(close.iloc[i]) < float(anchor.iloc[i])
            else "at"
        )

        if pending and i > pending_end_idx:
            completed_count += 1
            pending = False
            pending_end_idx = -1

        trend_start_event = False
        trend_break_event = False
        if trend_active:
            if raw_trend_active:
                raw_break_run = 0
            else:
                raw_break_run += 1
                if raw_break_run >= trend_break_confirmation_bars:
                    trend_active = False
                    trend_break_event = True
                    completed_count = 0
                    pending = False
                    pending_end_idx = -1
                    raw_trend_run = 0
                    raw_break_run = 0
        else:
            if raw_trend_active:
                raw_trend_run += 1
                if raw_trend_run >= trend_start_confirmation_bars:
                    trend_active = True
                    trend_start_event = True
                    trend_episode_id += 1
                    completed_count = 0
                    pending = False
                    pending_end_idx = -1
                    raw_break_run = 0
            else:
                raw_trend_run = 0

        pending_start = False
        if (
            trend_active
            and armed
            and raw_touch
            and not pending
            and completed_count < max_bounces
        ):
            pending = True
            pending_start = True
            pending_end_idx = i + touch_lookback_bars - 1

        pending_end = bool(pending and i == pending_end_idx)
        in_lookback = bool(pending and i <= pending_end_idx)
        touch_lookback_left = max(pending_end_idx - i + 1, 0) if in_lookback else 0
        effective_bounce_number = completed_count + 1 if pending else completed_count
        setup_allowed = bool(
            trend_active
            and (
                completed_count < max_bounces
                or (pending and completed_count + 1 <= max_bounces)
            )
        )

        trend_active_values.append(bool(trend_active))
        trend_episode_id_values.append(trend_episode_id if trend_active else 0)
        armed_values.append(armed)
        raw_touch_values.append(raw_touch)
        pending_values.append(bool(pending))
        in_lookback_values.append(in_lookback)
        lookback_left_values.append(touch_lookback_left)
        completed_values.append(completed_count)
        effective_values.append(effective_bounce_number)
        setup_allowed_values.append(setup_allowed)
        price_side_values.append(price_side)
        trend_start_values.append(trend_start_event)
        trend_break_values.append(trend_break_event)
        pending_start_values.append(pending_start)
        pending_end_values.append(pending_end)

    index = df.index
    setup_allowed = _bool_series(index, setup_allowed_values)
    return {
        "trend_active": _bool_series(index, trend_active_values),
        "trend_episode_id": _int_series(index, trend_episode_id_values),
        "armed": _bool_series(index, armed_values),
        "raw_touch": _bool_series(index, raw_touch_values),
        "pending_bounce": _bool_series(index, pending_values),
        "in_touch_lookback": _bool_series(index, in_lookback_values),
        "touch_lookback_left": _int_series(index, lookback_left_values),
        "completed_bounce_count": _int_series(index, completed_values),
        "effective_bounce_number": _int_series(index, effective_values),
        "setup_allowed": setup_allowed,
        "setup": setup_allowed,
        "price_side_of_anchor": _str_series(index, price_side_values),
        "trend_start_event": _bool_series(index, trend_start_values),
        "trend_break_event": _bool_series(index, trend_break_values),
        "pending_bounce_start": _bool_series(index, pending_start_values),
        "pending_bounce_end": _bool_series(index, pending_end_values),
    }


def ema_bounce_counter_setup(
    df: pd.DataFrame,
    fast_col: str,
    anchor_col: str,
    slow_col: str,
    *,
    max_bounces: int = 3,
    raw_touch_mode: str = "range_cross",
    touch_lookback_bars: int = 10,
    trend_start_confirmation_bars: int = 1,
    trend_break_confirmation_bars: int = 1,
    side: TradeSide = "long",
) -> pd.Series:
    """Return setup_allowed for the EMA bounce counter setup."""

    return ema_bounce_counter_setup_trace(
        df,
        fast_col,
        anchor_col,
        slow_col,
        max_bounces=max_bounces,
        raw_touch_mode=raw_touch_mode,
        touch_lookback_bars=touch_lookback_bars,
        trend_start_confirmation_bars=trend_start_confirmation_bars,
        trend_break_confirmation_bars=trend_break_confirmation_bars,
        side=side,
    )["setup_allowed"]
