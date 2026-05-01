"""Stage 5 tests: family-local FeaturesDev profile contract."""

from __future__ import annotations

from research.strategies.ema_pullback.feature_profile import (
    EMA_PULLBACK_DEFAULT_FEATURE_PROFILE,
    EMA_PULLBACK_DEFAULT_PROFILE_ID,
)


def test_default_feature_profile_exists() -> None:
    profile = EMA_PULLBACK_DEFAULT_FEATURE_PROFILE
    assert profile.profile_id == EMA_PULLBACK_DEFAULT_PROFILE_ID


def test_default_feature_profile_has_entry_trend_relation() -> None:
    profile = EMA_PULLBACK_DEFAULT_FEATURE_PROFILE
    assert "entry_trend" in profile.relations


def test_entry_trend_relation_has_fast_and_slow_roles() -> None:
    relation = EMA_PULLBACK_DEFAULT_FEATURE_PROFILE.relations["entry_trend"]
    assert relation.roles["fast"] == "ema_fast"
    assert relation.roles["slow"] == "ema_slow"
