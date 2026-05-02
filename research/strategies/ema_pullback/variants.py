"""Manual variants factory for ema_pullback family.

Includes control variants and component-based reclaim variants.
"""

from __future__ import annotations

from dataclasses import replace

from research.strategies.ema_pullback.components import (
    FAST_ANCHOR_SLOW_STACK_LONG_COMPONENT,
    INTRADAY_AND_SWING_TREND_LONG_COMPONENT,
    PULLBACK_TO_ANCHOR_COMPONENT,
    PULLBACK_TO_ENTRY_ANCHOR_COMPONENT,
    RECLAIM_ANCHOR_COMPONENT,
    RECLAIM_ENTRY_ANCHOR_COMPONENT,
)
from research.strategies.ema_pullback.config import DEFAULT_CONFIG, StrategyConfig
from research.strategies.ema_pullback.execution.trade_management import (
    FEATURE_DISTANCE_SL_TP_PROFILE,
    FIXED_PCT_SL_TP_PROFILE,
    RULE_BASED_DISTANCE_COLUMNS_PROFILE,
)
from research.strategies.ema_pullback.features.profile import EMA_PULLBACK_20_200_500_PROFILE_ID
from research.strategies.ema_pullback.instance import StrategyInstance
from research.strategies.ema_pullback.spec import ema_pullback_fast20_anchor200_slow1000_spec


def build_manual_variants(base_config: StrategyConfig = DEFAULT_CONFIG) -> list[StrategyInstance]:
    """Build fixed/manual variants for one ema_pullback family."""

    variant_specs: tuple[dict[str, object], ...] = (
        {"variant": "ema_pullback_baseline", "ema_fast": 20, "ema_slow": 50},
        {"variant": "ema_pullback_conservative", "ema_fast": 50, "ema_slow": 200},
        {"variant": "ema_pullback_aggressive", "ema_fast": 10, "ema_slow": 30},
        {
            "variant": "ema_pullback_20_200_500_reclaim",
            "ema_fast": 20,
            "ema_slow": 200,
            "feature_profile": EMA_PULLBACK_20_200_500_PROFILE_ID,
            "direction_component": INTRADAY_AND_SWING_TREND_LONG_COMPONENT,
            "setup_component": PULLBACK_TO_ENTRY_ANCHOR_COMPONENT,
            "trigger_component": RECLAIM_ENTRY_ANCHOR_COMPONENT,
        },
        {
            "variant": "ema_pullback_20_200_500_reclaim_fixed_sl_tp",
            "ema_fast": 20,
            "ema_slow": 200,
            "feature_profile": EMA_PULLBACK_20_200_500_PROFILE_ID,
            "direction_component": INTRADAY_AND_SWING_TREND_LONG_COMPONENT,
            "setup_component": PULLBACK_TO_ENTRY_ANCHOR_COMPONENT,
            "trigger_component": RECLAIM_ENTRY_ANCHOR_COMPONENT,
            "trade_management_profile": FIXED_PCT_SL_TP_PROFILE,
        },
        {
            "variant": "ema_pullback_20_200_500_reclaim_feature_distance_sl_tp",
            "ema_fast": 20,
            "ema_slow": 200,
            "feature_profile": EMA_PULLBACK_20_200_500_PROFILE_ID,
            "direction_component": INTRADAY_AND_SWING_TREND_LONG_COMPONENT,
            "setup_component": PULLBACK_TO_ENTRY_ANCHOR_COMPONENT,
            "trigger_component": RECLAIM_ENTRY_ANCHOR_COMPONENT,
            "trade_management_profile": FEATURE_DISTANCE_SL_TP_PROFILE,
        },
        {
            "variant": "ema_pullback_fast20_anchor200_slow1000",
            "ema_fast": 20,
            "ema_slow": 1000,
            "feature_profile": "ema_pullback_default",
            "direction_component": FAST_ANCHOR_SLOW_STACK_LONG_COMPONENT,
            "setup_component": PULLBACK_TO_ANCHOR_COMPONENT,
            "trigger_component": RECLAIM_ANCHOR_COMPONENT,
            "trade_management_profile": RULE_BASED_DISTANCE_COLUMNS_PROFILE,
            "strategy_spec": ema_pullback_fast20_anchor200_slow1000_spec(
                symbol=base_config.symbol,
                base_timeframe=base_config.timeframe,
            ),
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
