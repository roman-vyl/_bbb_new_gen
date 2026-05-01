"""Stage 8 tests: trade management profiles and resolver."""

from __future__ import annotations

import pytest

from research.strategies.ema_pullback.trade_management import (
    FIXED_PCT_SL_TP_PROFILE,
    NONE_TRADE_MANAGEMENT_PROFILE,
    TRADE_MANAGEMENT_PROFILES,
    resolve_trade_management_profile,
)


def test_default_trade_management_profile_exists() -> None:
    assert NONE_TRADE_MANAGEMENT_PROFILE in TRADE_MANAGEMENT_PROFILES


def test_fixed_pct_sl_tp_profile_exists() -> None:
    profile = TRADE_MANAGEMENT_PROFILES[FIXED_PCT_SL_TP_PROFILE]
    assert profile.portfolio_kwargs["sl_stop"] == 0.03
    assert profile.portfolio_kwargs["tp_stop"] == 0.06


def test_resolve_trade_management_profile_works() -> None:
    profile = resolve_trade_management_profile(FIXED_PCT_SL_TP_PROFILE)
    assert profile.profile_id == FIXED_PCT_SL_TP_PROFILE


def test_resolve_trade_management_profile_fails_for_unknown() -> None:
    with pytest.raises(ValueError, match="unknown trade management profile"):
        resolve_trade_management_profile("does_not_exist")
