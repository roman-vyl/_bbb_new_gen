"""Family-local FeaturesDev profiles for ema_pullback research family."""

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
EMA_PULLBACK_20_200_500_PROFILE_ID = "ema_pullback_20_200_500"


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

EMA_PULLBACK_20_200_500_FEATURE_PROFILE = FeatureProfile(
    profile_id=EMA_PULLBACK_20_200_500_PROFILE_ID,
    series={
        "ema_close_base_tf_20": FeatureSeries(
            series_id="ema_close_base_tf_20",
            indicator="ema",
            timeframe="base_tf",
            source="close",
            params=(20,),
        ),
        "ema_close_base_tf_200": FeatureSeries(
            series_id="ema_close_base_tf_200",
            indicator="ema",
            timeframe="base_tf",
            source="close",
            params=(200,),
        ),
        "ema_close_base_tf_500": FeatureSeries(
            series_id="ema_close_base_tf_500",
            indicator="ema",
            timeframe="base_tf",
            source="close",
            params=(500,),
        ),
    },
    bindings={},
    relations={
        "intraday_trend": FeatureRelation(
            relation_id="intraday_trend",
            roles={
                "fast": "ema_close_base_tf_20",
                "slow": "ema_close_base_tf_200",
            },
        ),
        "swing_trend": FeatureRelation(
            relation_id="swing_trend",
            roles={
                "fast": "ema_close_base_tf_200",
                "slow": "ema_close_base_tf_500",
            },
        ),
        "entry_anchor": FeatureRelation(
            relation_id="entry_anchor",
            roles={
                "ema": "ema_close_base_tf_200",
            },
        ),
    },
)

FEATURE_PROFILES: dict[str, FeatureProfile] = {
    EMA_PULLBACK_DEFAULT_PROFILE_ID: EMA_PULLBACK_DEFAULT_FEATURE_PROFILE,
    EMA_PULLBACK_20_200_500_PROFILE_ID: EMA_PULLBACK_20_200_500_FEATURE_PROFILE,
}


def resolve_feature_profile(profile_id: str) -> FeatureProfile:
    """Resolve one known feature profile by id."""

    profile = FEATURE_PROFILES.get(profile_id)
    if profile is None:
        known = ", ".join(sorted(FEATURE_PROFILES.keys()))
        raise ValueError(f"unknown feature_profile {profile_id!r}; known profiles: {known}")
    return profile


def series_to_column(series: FeatureSeries) -> str:
    """Map feature series descriptor to a DataFrame column name."""

    if series.indicator == "ema" and len(series.params) == 1:
        return f"ema_{series.params[0]}"
    return series.series_id


def relation_columns(profile: FeatureProfile, relation_id: str) -> dict[str, str]:
    """Resolve relation roles to concrete DataFrame column names."""

    relation = profile.relations[relation_id]
    columns: dict[str, str] = {}
    for role, series_id in relation.roles.items():
        series = profile.series[series_id]
        columns[role] = series_to_column(series)
    return columns
