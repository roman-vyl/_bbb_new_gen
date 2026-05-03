"""Exit-layer: map unified exit rules to vectorbt-facing outputs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import pandas as pd

from research.strategies.ema_pullback.components.registry import resolve_component
from research.strategies.ema_pullback.features.plan import FeaturePlan
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec
from research.strategies.ema_pullback.spec import ExitRuleSpec
from research.strategies.ema_pullback.spec import RsiFeatureSpec
from research.strategies.ema_pullback.spec import TradeSide


@dataclass(frozen=True)
class PortfolioExitOutputs:
    exits: pd.Series
    short_exits: pd.Series
    sl_stop: pd.Series
    tp_stop: pd.Series

    def stop_kwargs(self) -> dict[str, pd.Series]:
        return {
            "sl_stop": self.sl_stop,
            "tp_stop": self.tp_stop,
        }


def compose_exit_signals(signals: tuple[pd.Series, ...], *, index: pd.Index) -> pd.Series:
    """Any signal exit rule can close a trade."""

    if not signals:
        return pd.Series(False, index=index, dtype=bool)
    out = signals[0].fillna(False).astype(bool)
    for signal in signals[1:]:
        out = out | signal.fillna(False).astype(bool)
    return out.astype(bool)


def _false_series(df: pd.DataFrame) -> pd.Series:
    return pd.Series(False, index=df.index, dtype=bool)


def _rsi_column(plan: FeaturePlan, rsi: RsiFeatureSpec | None) -> str | None:
    if rsi is None:
        return None
    return plan.rsi_columns[(rsi.timeframe, rsi.period)]


def _distance_column(plan: FeaturePlan, rule: ExitRuleSpec) -> str:
    return plan.exit_distance_columns[rule.exit_kind]


def _build_boolean_exits_for_side(
    *,
    df: pd.DataFrame,
    side: TradeSide,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
    anchor_col: str,
    signal_rules: tuple[tuple[Callable[..., pd.Series], ExitRuleSpec], ...],
) -> pd.Series:
    if not spec.trade_sides.includes(side):
        return _false_series(df)
    signals = tuple(
        exit_fn(
            df,
            anchor_col=anchor_col,
            side=side,
            rule=rule,
            rsi_col=_rsi_column(plan, rule.rsi),
        )
        for exit_fn, rule in signal_rules
    )
    return compose_exit_signals(signals, index=df.index)


def _build_stop_outputs(
    df: pd.DataFrame,
    plan: FeaturePlan,
    distance_rules: tuple[tuple[Callable[..., pd.Series], ExitRuleSpec], ...],
) -> dict[str, pd.Series]:
    distances: dict[str, pd.Series] = {}
    for exit_fn, rule in distance_rules:
        if rule.exit_kind in distances:
            raise ValueError(f"duplicate {rule.exit_kind} exit rule")
        distances[rule.exit_kind] = exit_fn(
            df,
            rule=rule,
            distance_col=_distance_column(plan, rule),
        )

    missing = {"stop_loss", "take_profit"} - set(distances)
    if missing:
        missing_names = ", ".join(sorted(missing))
        raise ValueError(f"missing required distance exit rules: {missing_names}")

    close = df["close"].astype(float)
    return {
        "sl_stop": distances["stop_loss"].astype(float) / close,
        "tp_stop": distances["take_profit"].astype(float) / close,
    }


def build_exit_outputs_from_spec(
    df: pd.DataFrame,
    spec: EmaPullbackStrategySpec,
    plan: FeaturePlan,
) -> PortfolioExitOutputs:
    """Build signal exits plus vectorbt stop/take series from unified exit rules."""

    resolved_rules = tuple(
        (resolve_component("exits", rule.component_id).func, rule) for rule in spec.components.exits
    )
    signal_rules = tuple((fn, rule) for fn, rule in resolved_rules if rule.exit_kind == "signal")
    distance_rules = tuple((fn, rule) for fn, rule in resolved_rules if rule.exit_kind != "signal")

    anchor_col = plan.anchor_columns["anchor"]
    stop_kwargs = _build_stop_outputs(df, plan, distance_rules)

    return PortfolioExitOutputs(
        exits=_build_boolean_exits_for_side(
            df=df,
            side="long",
            spec=spec,
            plan=plan,
            anchor_col=anchor_col,
            signal_rules=signal_rules,
        ),
        short_exits=_build_boolean_exits_for_side(
            df=df,
            side="short",
            spec=spec,
            plan=plan,
            anchor_col=anchor_col,
            signal_rules=signal_rules,
        ),
        sl_stop=stop_kwargs["sl_stop"],
        tp_stop=stop_kwargs["tp_stop"],
    )
