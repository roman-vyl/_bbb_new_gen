"""Build per-consumer context consumption trace series for diagnostics."""

from __future__ import annotations

from typing import Any

import pandas as pd

from research.strategies.ema_pullback.context.bundle import ContextBundle
from research.strategies.ema_pullback.context.policies import (
    HTF_STATE_GATE_POLICY,
    apply_htf_state_gate,
)
from research.strategies.ema_pullback.execution.exits import PortfolioExitOutputs
from research.strategies.ema_pullback.features.plan import FeaturePlan
from research.strategies.ema_pullback.spec import EmaPullbackStrategySpec


def _bool_list(series: pd.Series) -> list[bool]:
    return series.fillna(False).astype(bool).tolist()


def build_context_consumption_trace(
    spec: EmaPullbackStrategySpec,
    df: pd.DataFrame,
    plan: FeaturePlan,
    *,
    context_bundle: ContextBundle | None,
    exit_outputs: PortfolioExitOutputs,
    context_overlay_ref: str | None = None,
) -> list[dict[str, Any]]:
    """One record per consumer that applies context; per-bar ``context_applied`` lists."""

    if context_bundle is None or not spec.contexts:
        return []

    records: list[dict[str, Any]] = []
    index = df.index

    exit_consumption = spec.trade_management.exit_policy.context_consumption
    if exit_consumption is not None:
        applied = pd.Series(True, index=index, dtype=bool)
        records.append(
            {
                "role": "exit_policy",
                "component_id": "exit_policy",
                "context_ref": exit_consumption.context_ref,
                "policy_id": exit_consumption.policy.policy_id,
                "context_applied": _bool_list(applied),
                "outcome": {
                    "profile_long": exit_outputs.profile_long.astype(str).tolist(),
                    "profile_short": exit_outputs.profile_short.astype(str).tolist(),
                },
            }
        )

    for rule in spec.components.blockers:
        consumption = rule.context_consumption
        if consumption is None:
            continue
        if consumption.policy.policy_id != HTF_STATE_GATE_POLICY:
            continue
        context_output = context_bundle.get(consumption.context_ref)
        gate = apply_htf_state_gate(
            context_output,
            policy=consumption.policy,
            index=index,
        )
        records.append(
            {
                "role": "blockers",
                "component_id": rule.component_id,
                "instance_id": rule.instance_id,
                "context_ref": consumption.context_ref,
                "policy_id": consumption.policy.policy_id,
                "context_applied": _bool_list(gate),
            }
        )

    if context_overlay_ref:
        _ = context_bundle.get(context_overlay_ref)

    return records


def consumption_attribution_for_trade(
    spec: EmaPullbackStrategySpec,
    *,
    entry_idx: int,
    direction: str,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Static consumption metadata for a trade at entry (v5 trade_records)."""

    entry_consumption: dict[str, Any] | None = None
    for rule in spec.components.blockers:
        consumption = rule.context_consumption
        if consumption is None:
            continue
        entry_consumption = {
            "role": "blockers",
            "component_id": rule.component_id,
            "instance_id": rule.instance_id,
            "context_ref": consumption.context_ref,
            "policy_id": consumption.policy.policy_id,
            "applied": True,
        }
        break

    exit_consumption = spec.trade_management.exit_policy.context_consumption
    exit_attribution: dict[str, Any] | None = None
    if exit_consumption is not None:
        exit_attribution = {
            "role": "exit_policy",
            "component_id": "exit_policy",
            "context_ref": exit_consumption.context_ref,
            "policy_id": exit_consumption.policy.policy_id,
            "applied": True,
        }

    _ = entry_idx
    _ = direction
    return entry_consumption, exit_attribution
