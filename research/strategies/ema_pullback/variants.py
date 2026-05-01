"""Manual variants factory for ema_pullback family.

Stage 5 keeps fixed/manual variants and preserves Stage 4 variant names.
Component defaults are sourced from ``StrategyConfig``.
"""

from __future__ import annotations

from dataclasses import replace

from research.strategies.ema_pullback.components import (
    INTRADAY_AND_SWING_TREND_LONG_COMPONENT,
    PULLBACK_TO_ENTRY_ANCHOR_COMPONENT,
    RECLAIM_ENTRY_ANCHOR_COMPONENT,
)
from research.strategies.ema_pullback.config import DEFAULT_CONFIG, StrategyConfig
from research.strategies.ema_pullback.feature_profile import EMA_PULLBACK_1H_20_200_500_PROFILE_ID
from research.strategies.ema_pullback.instance import StrategyInstance


def build_manual_variants(base_config: StrategyConfig = DEFAULT_CONFIG) -> list[StrategyInstance]:
    """Build fixed/manual variants for one ema_pullback family."""

    variant_specs: tuple[dict[str, object], ...] = (
        {"variant": "ema_pullback_baseline", "ema_fast": 20, "ema_slow": 50},
        {"variant": "ema_pullback_conservative", "ema_fast": 50, "ema_slow": 200},
        {"variant": "ema_pullback_aggressive", "ema_fast": 10, "ema_slow": 30},
        {
            "variant": "ema_pullback_1h_20_200_500_reclaim",
            "ema_fast": 20,
            "ema_slow": 200,
            "feature_profile": EMA_PULLBACK_1H_20_200_500_PROFILE_ID,
            "direction_component": INTRADAY_AND_SWING_TREND_LONG_COMPONENT,
            "setup_component": PULLBACK_TO_ENTRY_ANCHOR_COMPONENT,
            "trigger_component": RECLAIM_ENTRY_ANCHOR_COMPONENT,
        },
    )
    return [
        StrategyInstance.from_config(
            replace(
                base_config,
                family="ema_pullback",
                **spec,
            )
        )
        for spec in variant_specs
    ]
