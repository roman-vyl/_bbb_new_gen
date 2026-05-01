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
        "atr_14": FeatureSeries(
            series_id="atr_14",
            indicator="atr",
            timeframe="base_tf",
            source="ohlc",
            params=(14,),
        ),
        "atr_14_x1_5": FeatureSeries(
            series_id="atr_14_x1_5",
            indicator="prepared_distance",
            timeframe="base_tf",
            source="ohlc",
            params=(),
        ),
        "atr_14_x4_0": FeatureSeries(
            series_id="atr_14_x4_0",
            indicator="prepared_distance",
            timeframe="base_tf",
            source="ohlc",
            params=(),
        ),
    },
    bindings={
        "trade_stop_distance": FeatureBinding(
            role="trade_stop_distance",
            series_id="atr_14_x1_5",
        ),
        "trade_take_distance": FeatureBinding(
            role="trade_take_distance",
            series_id="atr_14_x4_0",
        ),
    },
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


def binding_to_column(profile: FeatureProfile, binding_role: str) -> str:
    """Resolve a semantic binding role to the OHLCV DataFrame column name."""

    try:
        binding = profile.bindings[binding_role]
    except KeyError as exc:
        known = ", ".join(sorted(profile.bindings)) or "(none)"
        raise KeyError(
            f"feature profile {profile.profile_id!r} has no binding {binding_role!r}; known: {known}"
        ) from exc
    try:
        series = profile.series[binding.series_id]
    except KeyError as exc:
        raise KeyError(
            f"binding {binding_role!r} points to unknown series_id {binding.series_id!r}"
        ) from exc
    return series_to_column(series)


def relation_columns(profile: FeatureProfile, relation_id: str) -> dict[str, str]:
    """Resolve relation roles to concrete DataFrame column names."""

    relation = profile.relations[relation_id]
    columns: dict[str, str] = {}
    for role, series_id in relation.roles.items():
        series = profile.series[series_id]
        columns[role] = series_to_column(series)
    return columns
