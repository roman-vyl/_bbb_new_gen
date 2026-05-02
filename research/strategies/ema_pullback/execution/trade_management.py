"""Trade management profiles for ema_pullback family."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

import numpy as np
import pandas as pd

from research.strategies.ema_pullback.features.profile import (
    binding_to_column,
    resolve_feature_profile,
)


@dataclass(frozen=True)
class TradeManagementProfile:
    profile_id: str
    portfolio_kwargs: Mapping[str, Any]
    stop_distance_binding: str | None = None
    take_distance_binding: str | None = None


NONE_TRADE_MANAGEMENT_PROFILE = "none"
FIXED_PCT_SL_TP_PROFILE = "fixed_pct_sl_tp"
FEATURE_DISTANCE_SL_TP_PROFILE = "feature_distance_sl_tp"
RULE_BASED_DISTANCE_COLUMNS_PROFILE = "rule_based_distance_columns"

TRADE_MANAGEMENT_PROFILES: dict[str, TradeManagementProfile] = {
    NONE_TRADE_MANAGEMENT_PROFILE: TradeManagementProfile(
        profile_id=NONE_TRADE_MANAGEMENT_PROFILE,
        portfolio_kwargs={},
    ),
    FIXED_PCT_SL_TP_PROFILE: TradeManagementProfile(
        profile_id=FIXED_PCT_SL_TP_PROFILE,
        portfolio_kwargs={
            "sl_stop": 0.03,
            "tp_stop": 0.06,
        },
    ),
    FEATURE_DISTANCE_SL_TP_PROFILE: TradeManagementProfile(
        profile_id=FEATURE_DISTANCE_SL_TP_PROFILE,
        portfolio_kwargs={},
        stop_distance_binding="trade_stop_distance",
        take_distance_binding="trade_take_distance",
    ),
    RULE_BASED_DISTANCE_COLUMNS_PROFILE: TradeManagementProfile(
        profile_id=RULE_BASED_DISTANCE_COLUMNS_PROFILE,
        portfolio_kwargs={},
    ),
}


def resolve_trade_management_profile(profile_id: str) -> TradeManagementProfile:
    """Resolve profile by id with a clear error for unknown profile."""

    profile_key = profile_id.strip()
    if not profile_key:
        raise ValueError("trade management profile id must be non-empty")
    try:
        return TRADE_MANAGEMENT_PROFILES[profile_key]
    except KeyError as exc:
        available = ", ".join(sorted(TRADE_MANAGEMENT_PROFILES))
        raise ValueError(
            f"unknown trade management profile: {profile_id!r}; available: {available}"
        ) from exc


def prepared_distance_sl_tp_portfolio_kwargs(
    df: pd.DataFrame,
    *,
    close: pd.Series,
    stop_distance_column: str,
    take_distance_column: str,
) -> dict[str, pd.Series]:
    """Build ``sl_stop`` / ``tp_stop`` from explicit distance columns (price units → ratios)."""

    if stop_distance_column not in df.columns or take_distance_column not in df.columns:
        missing = [c for c in (stop_distance_column, take_distance_column) if c not in df.columns]
        raise KeyError(f"enriched frame missing distance column(s): {missing}")

    c = close.astype(float)
    stop_dist = df[stop_distance_column].astype(float)
    take_dist = df[take_distance_column].astype(float)

    c_np = np.asarray(c, dtype=np.float64)
    s_np = np.asarray(stop_dist, dtype=np.float64)
    t_np = np.asarray(take_dist, dtype=np.float64)
    mask_np = (
        np.isfinite(c_np)
        & (c_np > 0)
        & np.isfinite(s_np)
        & np.isfinite(t_np)
        & (s_np >= 0)
        & (t_np >= 0)
    )
    mask = pd.Series(mask_np, index=c.index)

    sl_stop = (stop_dist / c).replace([np.inf, -np.inf], np.nan)
    tp_stop = (take_dist / c).replace([np.inf, -np.inf], np.nan)
    sl_stop = sl_stop.where(mask)
    tp_stop = tp_stop.where(mask)
    sl_stop = sl_stop.reindex(c.index)
    tp_stop = tp_stop.reindex(c.index)
    return {"sl_stop": sl_stop, "tp_stop": tp_stop}


def feature_distance_sl_tp_portfolio_kwargs(
    df: pd.DataFrame,
    *,
    close: pd.Series,
    feature_profile_id: str,
    trade_profile: TradeManagementProfile,
) -> dict[str, pd.Series]:
    """Build vectorbt ``sl_stop`` / ``tp_stop`` series from prepared distance columns.

    Expects ``trade_profile`` to reference semantic bindings (e.g. stop/take distance roles)
    on ``feature_profile_id``. Distances are absolute price units; outputs are
    ``distance / close`` for vectorbt trailing/percent-style stops.
    """

    if trade_profile.stop_distance_binding is None or trade_profile.take_distance_binding is None:
        raise ValueError("feature distance profile requires stop and take distance bindings")
    f_profile = resolve_feature_profile(feature_profile_id)
    stop_col = binding_to_column(f_profile, trade_profile.stop_distance_binding)
    take_col = binding_to_column(f_profile, trade_profile.take_distance_binding)
    if stop_col not in df.columns or take_col not in df.columns:
        missing = [c for c in (stop_col, take_col) if c not in df.columns]
        raise KeyError(f"enriched frame missing distance column(s): {missing}")

    c = close.astype(float)
    stop_dist = df[stop_col].astype(float)
    take_dist = df[take_col].astype(float)

    c_np = np.asarray(c, dtype=np.float64)
    s_np = np.asarray(stop_dist, dtype=np.float64)
    t_np = np.asarray(take_dist, dtype=np.float64)
    mask_np = (
        np.isfinite(c_np)
        & (c_np > 0)
        & np.isfinite(s_np)
        & np.isfinite(t_np)
        & (s_np >= 0)
        & (t_np >= 0)
    )
    mask = pd.Series(mask_np, index=c.index)

    sl_stop = (stop_dist / c).replace([np.inf, -np.inf], np.nan)
    tp_stop = (take_dist / c).replace([np.inf, -np.inf], np.nan)
    sl_stop = sl_stop.where(mask)
    tp_stop = tp_stop.where(mask)
    sl_stop = sl_stop.reindex(c.index)
    tp_stop = tp_stop.reindex(c.index)
    return {"sl_stop": sl_stop, "tp_stop": tp_stop}


def resolve_portfolio_kwargs_for_signals(
    trade_profile: TradeManagementProfile,
    *,
    df: pd.DataFrame,
    close: pd.Series,
    feature_profile_id: str,
    stop_distance_column: str | None = None,
    take_distance_column: str | None = None,
) -> dict[str, Any]:
    """Return keyword arguments for ``vectorbt.Portfolio.from_signals`` for this profile."""

    if trade_profile.profile_id == RULE_BASED_DISTANCE_COLUMNS_PROFILE:
        if not stop_distance_column or not take_distance_column:
            raise ValueError(
                "rule_based_distance_columns profile requires stop_distance_column and "
                "take_distance_column"
            )
        return prepared_distance_sl_tp_portfolio_kwargs(
            df,
            close=close,
            stop_distance_column=stop_distance_column,
            take_distance_column=take_distance_column,
        )
    if trade_profile.profile_id == FEATURE_DISTANCE_SL_TP_PROFILE:
        return feature_distance_sl_tp_portfolio_kwargs(
            df,
            close=close,
            feature_profile_id=feature_profile_id,
            trade_profile=trade_profile,
        )
    return dict(trade_profile.portfolio_kwargs)
