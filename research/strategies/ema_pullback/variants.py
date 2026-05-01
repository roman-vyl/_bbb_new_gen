"""Manual variants factory for ema_pullback Stage 4."""

from __future__ import annotations

from dataclasses import replace

from research.strategies.ema_pullback.config import DEFAULT_CONFIG, StrategyConfig
from research.strategies.ema_pullback.instance import StrategyInstance


def build_manual_variants(base_config: StrategyConfig = DEFAULT_CONFIG) -> list[StrategyInstance]:
    """Build the fixed Stage 4 manual variants for one ema_pullback family."""

    variant_specs: tuple[tuple[str, int, int], ...] = (
        ("ema_pullback_baseline", 20, 50),
        ("ema_pullback_conservative", 50, 200),
        ("ema_pullback_aggressive", 10, 30),
    )
    return [
        StrategyInstance.from_config(
            replace(
                base_config,
                family="ema_pullback",
                variant=variant_name,
                ema_fast=ema_fast,
                ema_slow=ema_slow,
            )
        )
        for variant_name, ema_fast, ema_slow in variant_specs
    ]
