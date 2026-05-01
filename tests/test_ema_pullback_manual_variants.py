"""Stage 4 tests: manual variants factory contract."""

from __future__ import annotations

from research.strategies.ema_pullback.components import (
    INTRADAY_AND_SWING_TREND_LONG_COMPONENT,
    PULLBACK_TO_ENTRY_ANCHOR_COMPONENT,
    RECLAIM_ENTRY_ANCHOR_COMPONENT,
)
from research.strategies.ema_pullback.feature_profile import EMA_PULLBACK_20_200_500_PROFILE_ID
from research.strategies.ema_pullback.variants import build_manual_variants


def test_manual_variants_match_expected_matrix() -> None:
    variants = build_manual_variants()
    matrix = [(item.config.variant, item.config.ema_fast, item.config.ema_slow) for item in variants]
    assert matrix == [
        ("ema_pullback_baseline", 20, 50),
        ("ema_pullback_conservative", 50, 200),
        ("ema_pullback_aggressive", 10, 30),
        ("ema_pullback_20_200_500_reclaim", 20, 200),
    ]


def test_build_manual_variants_returns_at_least_three() -> None:
    variants = build_manual_variants()
    assert len(variants) >= 4


def test_manual_variants_have_unique_variant_names() -> None:
    variants = build_manual_variants()
    names = [instance.config.variant for instance in variants]
    assert len(set(names)) == len(names)


def test_manual_variants_have_unique_config_ids() -> None:
    variants = build_manual_variants()
    config_ids = [instance.config_id for instance in variants]
    assert len(set(config_ids)) == len(config_ids)


def test_manual_variants_config_ids_are_deterministic() -> None:
    first = build_manual_variants()
    second = build_manual_variants()
    assert [item.config_id for item in first] == [item.config_id for item in second]


def test_manual_variants_all_have_ema_pullback_family() -> None:
    variants = build_manual_variants()
    assert all(instance.config.family == "ema_pullback" for instance in variants)


def test_manual_variants_all_have_fast_less_than_slow() -> None:
    variants = build_manual_variants()
    assert all(instance.config.ema_fast < instance.config.ema_slow for instance in variants)


def test_stage7_variant_uses_expected_profile_and_components() -> None:
    variants = build_manual_variants()
    stage7 = next(v for v in variants if v.config.variant == "ema_pullback_20_200_500_reclaim")
    assert stage7.config.feature_profile == EMA_PULLBACK_20_200_500_PROFILE_ID
    assert stage7.config.direction_component == INTRADAY_AND_SWING_TREND_LONG_COMPONENT
    assert stage7.config.setup_component == PULLBACK_TO_ENTRY_ANCHOR_COMPONENT
    assert stage7.config.trigger_component == RECLAIM_ENTRY_ANCHOR_COMPONENT
