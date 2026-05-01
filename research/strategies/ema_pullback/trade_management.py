"""Trade management profiles for ema_pullback family."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class TradeManagementProfile:
    profile_id: str
    portfolio_kwargs: Mapping[str, Any]


NONE_TRADE_MANAGEMENT_PROFILE = "none"
FIXED_PCT_SL_TP_PROFILE = "fixed_pct_sl_tp"

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
