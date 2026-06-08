"""Bar-open managed exit candidates from inherited ActiveManagementSnapshot."""

from __future__ import annotations

from typing import Literal

from research.strategies.ema_pullback.execution.exit_attribution import (
    _stop_hit_long,
    _stop_hit_short,
    fill_price_for_distance_exit,
)
from research.strategies.ema_pullback.execution.trade_runtime import (
    ActiveManagementSnapshot,
    ExitCandidate,
)
from research.strategies.ema_pullback.spec import RuntimeExitRuleSpec


def _runtime_component_id(
    rules: tuple[RuntimeExitRuleSpec, ...],
    rule_id: str,
) -> str | None:
    for rule in rules:
        if rule.rule_id == rule_id:
            return rule.component_id
    return None


def collect_managed_bar_open_candidates(
    inherited: ActiveManagementSnapshot,
    *,
    bar_idx: int,
    direction: Literal["long", "short"],
    open_: float,
    high: float,
    low: float,
    close: float,
    runtime_exits: tuple[RuntimeExitRuleSpec, ...] = (),
) -> list[ExitCandidate]:
    out: list[ExitCandidate] = []

    stop = inherited.active_stop_price
    if stop is not None:
        if direction == "long":
            hit = _stop_hit_long(open_, high, low, stop, is_loss=True)
        else:
            hit = _stop_hit_short(open_, high, low, stop, is_loss=True)
        if hit:
            price = fill_price_for_distance_exit(
                direction,
                open_=open_,
                high=high,
                low=low,
                level=stop,
                is_loss=True,
            )
            out.append(
                ExitCandidate(
                    layer="exit_management",
                    rule_id=inherited.active_stop_rule_id,
                    component_id=inherited.active_stop_component_id,
                    price=price,
                    bar=bar_idx,
                    reason=f"active_stop:{inherited.active_stop_component_id}",
                    candidate_type="managed_stop",
                )
            )

    for rule_id in inherited.active_runtime_exit_rules:
        component_id = _runtime_component_id(runtime_exits, rule_id)
        out.append(
            ExitCandidate(
                layer="exit_management",
                rule_id=rule_id,
                component_id=component_id,
                price=close,
                bar=bar_idx,
                reason="runtime_exit:close",
                candidate_type="runtime_exit",
            )
        )

    return out
