"""Stage 5 tests: family-local FeaturesDev profile contract."""

from __future__ import annotations

from research.strategies.ema_pullback.feature_profile import (
    EMA_PULLBACK_20_200_500_FEATURE_PROFILE,
    EMA_PULLBACK_20_200_500_PROFILE_ID,
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


def test_stage7_feature_profile_exists() -> None:
    profile = EMA_PULLBACK_20_200_500_FEATURE_PROFILE
    assert profile.profile_id == EMA_PULLBACK_20_200_500_PROFILE_ID


def test_stage7_feature_profile_has_required_relations() -> None:
    profile = EMA_PULLBACK_20_200_500_FEATURE_PROFILE
    assert "intraday_trend" in profile.relations
    assert "swing_trend" in profile.relations
    assert "entry_anchor" in profile.relations


def test_stage7_relations_have_expected_roles() -> None:
    profile = EMA_PULLBACK_20_200_500_FEATURE_PROFILE
    assert profile.relations["intraday_trend"].roles == {
        "fast": "ema_close_base_tf_20",
        "slow": "ema_close_base_tf_200",
    }
    assert profile.relations["swing_trend"].roles == {
        "fast": "ema_close_base_tf_200",
        "slow": "ema_close_base_tf_500",
    }
    assert profile.relations["entry_anchor"].roles == {
        "ema": "ema_close_base_tf_200",
    }
