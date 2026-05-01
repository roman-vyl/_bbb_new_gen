"""Family-local FeaturesDev profile for ema_pullback Stage 5."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FeatureSeries:
    """Physical feature series descriptor."""

    series_id: str
    indicator: str
    timeframe: str
    source: str
    params: tuple[int, ...] = ()


@dataclass(frozen=True)
class FeatureBinding:
    """Semantic role bound to one physical feature series."""

    role: str
    series_id: str


@dataclass(frozen=True)
class FeatureRelation:
    """Semantic relation name mapped to role->series bindings."""

    relation_id: str
    roles: dict[str, str]


@dataclass(frozen=True)
class FeatureProfile:
    """Complete family-local feature semantics for one experiment profile."""

    profile_id: str
    series: dict[str, FeatureSeries]
    bindings: dict[str, FeatureBinding]
    relations: dict[str, FeatureRelation]


EMA_PULLBACK_DEFAULT_PROFILE_ID = "ema_pullback_default"


EMA_PULLBACK_DEFAULT_FEATURE_PROFILE = FeatureProfile(
    profile_id=EMA_PULLBACK_DEFAULT_PROFILE_ID,
    series={
        # Compatibility aliases kept explicit in Stage 5.
        "ema_fast": FeatureSeries(
            series_id="ema_fast",
            indicator="ema",
            timeframe="family_tf",
            source="close",
            params=(),
        ),
        "ema_slow": FeatureSeries(
            series_id="ema_slow",
            indicator="ema",
            timeframe="family_tf",
            source="close",
            params=(),
        ),
    },
    bindings={},
    relations={
        "entry_trend": FeatureRelation(
            relation_id="entry_trend",
            roles={
                "fast": "ema_fast",
                "slow": "ema_slow",
            },
        )
    },
)
