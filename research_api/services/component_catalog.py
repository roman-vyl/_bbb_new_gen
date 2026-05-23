"""Component catalog for Workbench Composer (ema_pullback MVP stub)."""

from __future__ import annotations

from research_api.contracts.catalog import (
    ComponentCatalog,
    ComponentSchema,
    ComposerSectionSchema,
    ParamFieldSchema,
)

_TF_ENUM = ["base", "5m", "15m", "1h", "4h"]


def _tf_param(key: str, *, default: str = "base") -> ParamFieldSchema:
    return ParamFieldSchema(type="string", label=key, enum=_TF_ENUM, default=default)


def _int_param(label: str, *, default: int, min_val: int = 1) -> ParamFieldSchema:
    return ParamFieldSchema(type="integer", label=label, min=float(min_val), default=default)


def _num_param(label: str, *, default: float) -> ParamFieldSchema:
    return ParamFieldSchema(type="number", label=label, default=default)


def get_component_catalog(*, family: str = "ema_pullback") -> ComponentCatalog:
    if family != "ema_pullback":
        raise ValueError(f"unsupported family {family!r}; supported: ema_pullback")

    sections = [
        ComposerSectionSchema(section_id="envelope", label="Experiment"),
        ComposerSectionSchema(section_id="instances", label="Instances"),
        ComposerSectionSchema(section_id="market", label="Market"),
        ComposerSectionSchema(section_id="anchor_stack", label="Anchor stack"),
        ComposerSectionSchema(section_id="trade_sides", label="Trade sides"),
        ComposerSectionSchema(section_id="direction", label="Direction", role="direction"),
        ComposerSectionSchema(section_id="setup", label="Setup", role="setup"),
        ComposerSectionSchema(section_id="trigger", label="Trigger", role="trigger"),
        ComposerSectionSchema(
            section_id="blockers",
            label="Blockers",
            role="blockers",
            list_slot=True,
        ),
        ComposerSectionSchema(section_id="risk", label="Risk", role="risk"),
        ComposerSectionSchema(
            section_id="trade_management",
            label="Trade management",
        ),
        ComposerSectionSchema(
            section_id="exit_policy_context",
            label="Exit policy context",
        ),
        ComposerSectionSchema(
            section_id="exit_policy_always_on",
            label="Exit policy always-on exits",
            role="exits",
            list_slot=True,
        ),
        ComposerSectionSchema(
            section_id="exit_policy_profiles",
            label="Exit policy profiles",
        ),
        ComposerSectionSchema(
            section_id="exit_policy_profile_aligned",
            label="Profile aligned exits",
            role="exits",
            list_slot=True,
        ),
        ComposerSectionSchema(
            section_id="exit_policy_profile_countertrend",
            label="Profile countertrend exits",
            role="exits",
            list_slot=True,
        ),
        ComposerSectionSchema(
            section_id="exit_policy_profile_neutral",
            label="Profile neutral exits",
            role="exits",
            list_slot=True,
        ),
    ]

    components = [
        ComponentSchema(
            component_id="ema_anchor_stack_trend",
            role="direction",
            label="EMA anchor stack trend",
            description="Long when fast > anchor > slow; short mirrors.",
        ),
        ComponentSchema(
            component_id="untouched_anchor_setup",
            role="setup",
            label="Untouched anchor setup",
            description=(
                "Armed regime: anchor untouched for lookback bars, "
                "then active through first touch and active_bars window."
            ),
            params_schema={
                "lookback": _int_param("Untouched lookback bars", default=50),
                "active_bars": _int_param("Active bars after first touch", default=3),
            },
        ),
        ComponentSchema(
            component_id="reclaim_anchor",
            role="trigger",
            label="Reclaim anchor",
            description=(
                "Wick probed anchor within prior lookback bars; entry on close reclaim."
            ),
            params_schema={
                "lookback": _int_param("Wick probe lookback bars", default=1),
            },
        ),
        ComponentSchema(
            component_id="strong_reclaim_anchor",
            role="trigger",
            label="Strong reclaim anchor",
            description=(
                "Close lost anchor within prior lookback bars; entry on close reclaim."
            ),
            params_schema={
                "lookback": _int_param("Close probe lookback bars", default=1),
            },
        ),
        ComponentSchema(
            component_id="touch_anchor",
            role="trigger",
            label="Touch anchor",
        ),
        ComponentSchema(
            component_id="no_blockers",
            role="blockers",
            label="No blockers",
            list_slot=True,
        ),
        ComponentSchema(
            component_id="counter_candle_blocker",
            role="blockers",
            label="Counter candle blocker",
            list_slot=True,
        ),
        ComponentSchema(
            component_id="rsi_lookback_extreme_blocker",
            role="blockers",
            label="RSI lookback extreme blocker",
            list_slot=True,
            params_schema={
                "rsi.timeframe": _tf_param("RSI timeframe", default="5m"),
                "rsi.period": _int_param("RSI period", default=14),
                "lookback": _int_param("Lookback", default=20),
                "long_block_above": _num_param("Long block above RSI", default=80.0),
                "short_block_below": _num_param("Short block below RSI", default=20.0),
            },
        ),
        ComponentSchema(
            component_id="no_risk_filter",
            role="risk",
            label="No risk filter",
        ),
        ComponentSchema(
            component_id="htf_context",
            role="exits",
            label="HTF context",
            description="Diagnostic-only context for selecting aligned/countertrend/neutral exit profile.",
            params_schema={
                "context.timeframe": _tf_param("HTF timeframe", default="4h"),
                "context.source": ParamFieldSchema(
                    type="string",
                    label="Source",
                    enum=["close"],
                    default="close",
                ),
                "context.fast_period": _int_param("Fast EMA period", default=20),
                "context.anchor_period": _int_param("Anchor EMA period", default=50),
                "context.slow_period": _int_param("Slow EMA period", default=200),
            },
        ),
        ComponentSchema(
            component_id="no_signal_exit",
            role="exits",
            label="No signal exit",
            list_slot=True,
        ),
        ComponentSchema(
            component_id="rsi_signal_exit",
            role="exits",
            label="RSI signal exit",
            list_slot=True,
            params_schema={
                "rsi.timeframe": _tf_param("RSI timeframe", default="5m"),
                "rsi.period": _int_param("RSI period", default=14),
                "long_exit_above": _num_param("Long exit above", default=70.0),
                "short_exit_below": _num_param("Short exit below", default=30.0),
            },
        ),
        ComponentSchema(
            component_id="atr_stop_loss",
            role="exits",
            label="ATR stop loss",
            list_slot=True,
            params_schema={
                "distance.timeframe": _tf_param("ATR timeframe", default="5m"),
                "distance.period": _int_param("ATR period", default=14),
                "distance.multiplier": _num_param("ATR multiplier", default=2.0),
            },
        ),
        ComponentSchema(
            component_id="atr_take_profit",
            role="exits",
            label="ATR take profit",
            list_slot=True,
            params_schema={
                "distance.timeframe": _tf_param("ATR timeframe", default="base"),
                "distance.period": _int_param("ATR period", default=14),
                "distance.multiplier": _num_param("ATR multiplier", default=4.0),
            },
        ),
        ComponentSchema(
            component_id="constant_usd_stop_loss",
            role="exits",
            label="Constant USD stop loss",
            list_slot=True,
            params_schema={
                "usd_distance": _num_param("USD distance", default=100.0),
            },
        ),
        ComponentSchema(
            component_id="constant_usd_take_profit",
            role="exits",
            label="Constant USD take profit",
            list_slot=True,
            params_schema={
                "usd_distance": _num_param("USD distance", default=200.0),
            },
        ),
    ]

    return ComponentCatalog(
        family=family,
        schema_version=1,
        sections=sections,
        components=components,
    )
