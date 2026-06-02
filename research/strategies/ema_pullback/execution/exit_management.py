"""Exit management combiner: stateful stop moves (break_even_stop v1)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
import pandas as pd

from research.strategies.ema_pullback.execution.exit_attribution import (
    ExitAttributionResult,
    ExitAttributionContext,
    _agg_sl_tp_at_entry,
    _attribution_for_instance,
    _levels_from_ratios,
    _null_attribution,
    _pick_distance_instance,
    _stop_hit_long,
    _stop_hit_short,
)
from research.strategies.ema_pullback.execution.exits import PortfolioExitOutputs, PROFILE_ORDER
from research.strategies.ema_pullback.spec import (
    BREAK_EVEN_STOP_COMPONENT,
    EmaPullbackStrategySpec,
    ExitManagementRuleSpec,
    ExitManagementSpec,
    TradeManagementSpec,
)

ManagementSource = Literal["profile", "always_on"]


@dataclass(frozen=True)
class ResolvedManagementRule:
    rule: ExitManagementRuleSpec
    source: ManagementSource


@dataclass
class BreakEvenTradeDiagnostics:
    enabled: bool
    instance_id: str
    trigger_r: float
    trigger_price: float | None
    triggered: bool
    trigger_time_ms: int | None
    stop_moved_to: float | None
    initial_stop_price: float
    initial_risk: float
    active_stop_management_source: ManagementSource


@dataclass
class BarManagementTrace:
    effective_stop_price: float | None
    pending_stop_price: float | None
    break_even_active: bool
    break_even_triggered_on_bar: bool
    break_even_trigger_price: float | None
    break_even_stop_moved_to: float | None
    break_even_initial_risk: float | None
    break_even_instance_id: str | None
    active_stop_management_source: ManagementSource | None
    position_direction: Literal["long", "short"] | None = None


@dataclass
class _OpenPosition:
    direction: Literal["long", "short"]
    entry_idx: int
    entry_price: float
    locked_profile: str
    resolved: ResolvedManagementRule | None
    initial_stop_price: float
    initial_risk: float
    effective_stop: float
    pending_stop: float | None = None
    triggered: bool = False
    trigger_idx: int | None = None
    trigger_price: float | None = None
    stop_moved_to: float | None = None
    sl_ratio: float | None = None
    tp_ratio: float | None = None


def has_exit_management_rules(spec: EmaPullbackStrategySpec) -> bool:
    em = spec.trade_management.exit_management
    return any(
        len(group.rules) > 0
        for group in (
            em.always_on,
            em.profiles.aligned,
            em.profiles.countertrend,
            em.profiles.neutral,
        )
    )


def resolve_management_rule(
    exit_management: ExitManagementSpec,
    locked_profile: str,
) -> ResolvedManagementRule | None:
    profile_rules = {
        "aligned": exit_management.profiles.aligned.rules,
        "countertrend": exit_management.profiles.countertrend.rules,
        "neutral": exit_management.profiles.neutral.rules,
    }.get(locked_profile, ())
    for rule in profile_rules:
        if rule.component_id == BREAK_EVEN_STOP_COMPONENT:
            return ResolvedManagementRule(rule=rule, source="profile")
    for rule in exit_management.always_on.rules:
        if rule.component_id == BREAK_EVEN_STOP_COMPONENT:
            return ResolvedManagementRule(rule=rule, source="always_on")
    return None


def _moved_stop_price(
    *,
    direction: Literal["long", "short"],
    entry_price: float,
    initial_risk: float,
    offset_r: float,
) -> float:
    if direction == "long":
        return entry_price + offset_r * initial_risk
    return entry_price - offset_r * initial_risk


def _trigger_reached(
    *,
    direction: Literal["long", "short"],
    entry_price: float,
    initial_risk: float,
    trigger_r: float,
    high: float,
    low: float,
) -> tuple[bool, float | None]:
    if initial_risk <= 0 or not math.isfinite(initial_risk):
        return False, None
    if direction == "long":
        level = entry_price + trigger_r * initial_risk
        if high >= level:
            return True, level
        return False, None
    level = entry_price - trigger_r * initial_risk
    if low <= level:
        return True, level
    return False, None


def _tighten_stop(
    current: float,
    candidate: float,
    *,
    direction: Literal["long", "short"],
) -> float:
    if direction == "long":
        return max(current, candidate)
    return min(current, candidate)


def _initial_stop_at_entry(
    *,
    direction: Literal["long", "short"],
    entry_idx: int,
    locked_profile: str,
    close: pd.Series,
    exit_outputs: PortfolioExitOutputs,
) -> tuple[float, float | None, float | None]:
    ctx = exit_outputs.attribution
    if ctx is None:
        raise ValueError("exit_management requires exit attribution context for initial stop")
    sl_r, tp_r = _agg_sl_tp_at_entry(ctx, entry_idx, profile=locked_profile)
    anchor = float(close.iloc[entry_idx])
    sl_level, _tp_level = _levels_from_ratios(direction, anchor, sl_r, tp_r)
    if sl_level is None or not math.isfinite(sl_level):
        raise ValueError(
            "break_even_stop requires finite initial stop from exit_policy at entry; "
            f"profile={locked_profile!r} entry_idx={entry_idx}"
        )
    risk = abs(anchor - sl_level)
    if risk <= 0 or not math.isfinite(risk):
        raise ValueError("initial_risk must be positive for break_even_stop")
    return sl_level, sl_r, tp_r


def _exit_at_break_even_stop(pos: _OpenPosition, effective_stop: float) -> bool:
    if not pos.triggered or pos.stop_moved_to is None or pos.resolved is None:
        return False
    if math.isclose(effective_stop, pos.stop_moved_to, rel_tol=0.0, abs_tol=1e-8):
        return True
    return not math.isclose(effective_stop, pos.initial_stop_price, rel_tol=0.0, abs_tol=1e-8)


def _classify_managed_bar_exit(
    pos: _OpenPosition,
    *,
    bar_idx: int,
    open_: float,
    high: float,
    low: float,
    stop_anchor: float,
    long_exit: bool,
    short_exit: bool,
    ctx: ExitAttributionContext | None,
    component_map: dict[str, str] | None,
) -> ExitAttributionResult | None:
    """Classify why the position closes on this bar (signal, TP, SL, or break-even stop)."""

    direction = pos.direction
    profile = pos.locked_profile

    if direction == "long" and long_exit:
        if ctx is not None:
            for i, series in enumerate(ctx.long_signal_by_rule):
                if series is None or not bool(series.iloc[bar_idx]):
                    continue
                inst = ctx.instance_ids[i]
                group = ctx.rule_groups[i] if i < len(ctx.rule_groups) else "always_on"
                if group not in {"always_on", profile}:
                    continue
                return _attribution_for_instance(
                    ctx, inst, prefix="signal", component_map=component_map
                )
        return _null_attribution("unknown")
    if direction == "short" and short_exit:
        if ctx is not None:
            for i, series in enumerate(ctx.short_signal_by_rule):
                if series is None or not bool(series.iloc[bar_idx]):
                    continue
                inst = ctx.instance_ids[i]
                group = ctx.rule_groups[i] if i < len(ctx.rule_groups) else "always_on"
                if group not in {"always_on", profile}:
                    continue
                return _attribution_for_instance(
                    ctx, inst, prefix="signal", component_map=component_map
                )
        return _null_attribution("unknown")

    sl_level, tp_level = _levels_from_ratios(
        direction,
        stop_anchor,
        pos.sl_ratio,
        pos.tp_ratio,
    )
    eff = pos.effective_stop

    if direction == "long":
        sl_hit = _stop_hit_long(open_, high, low, eff, is_loss=True)
        tp_hit = (
            tp_level is not None
            and pos.tp_ratio is not None
            and _stop_hit_long(open_, high, low, tp_level, is_loss=False)
        )
    else:
        sl_hit = _stop_hit_short(open_, high, low, eff, is_loss=True)
        tp_hit = (
            tp_level is not None
            and pos.tp_ratio is not None
            and _stop_hit_short(open_, high, low, tp_level, is_loss=False)
        )

    if sl_hit:
        if _exit_at_break_even_stop(pos, eff) and pos.resolved is not None:
            inst = pos.resolved.rule.instance_id
            component_id = (component_map or {}).get(inst, BREAK_EVEN_STOP_COMPONENT)
            if pos.resolved.source == "always_on":
                return ExitAttributionResult(
                    f"break_even:{inst}",
                    "always_on",
                    None,
                    component_id,
                    inst,
                    "break_even",
                )
            return ExitAttributionResult(
                f"break_even:{inst}",
                "profile",
                profile,
                component_id,
                inst,
                "break_even",
            )
        if ctx is not None and pos.sl_ratio is not None:
            inst = _pick_distance_instance(
                ctx,
                pos.entry_idx,
                exit_kind="stop_loss",
                agg_value=float(pos.sl_ratio),
                profile=profile,
            )
            if inst:
                return _attribution_for_instance(
                    ctx, inst, prefix="stop_loss", component_map=component_map
                )
        return _null_attribution("unknown")

    if tp_hit and ctx is not None and pos.tp_ratio is not None:
        inst = _pick_distance_instance(
            ctx,
            pos.entry_idx,
            exit_kind="take_profit",
            agg_value=float(pos.tp_ratio),
            profile=profile,
        )
        if inst:
            return _attribution_for_instance(
                ctx, inst, prefix="take_profit", component_map=component_map
            )
        return _null_attribution("unknown")

    return None


def _check_bar_exits(
    pos: _OpenPosition,
    *,
    bar_idx: int,
    open_: float,
    high: float,
    low: float,
    close: float,
    stop_anchor: float,
    long_exit: bool,
    short_exit: bool,
    ctx: ExitAttributionContext | None = None,
    component_map: dict[str, str] | None = None,
) -> ExitAttributionResult | None:
    return _classify_managed_bar_exit(
        pos,
        bar_idx=bar_idx,
        open_=open_,
        high=high,
        low=low,
        stop_anchor=stop_anchor,
        long_exit=long_exit,
        short_exit=short_exit,
        ctx=ctx,
        component_map=component_map,
    )


def _bar_trace(pos: _OpenPosition | None) -> BarManagementTrace | None:
    if pos is None or pos.resolved is None:
        return None
    r = pos.resolved
    return BarManagementTrace(
        effective_stop_price=pos.effective_stop,
        pending_stop_price=pos.pending_stop,
        break_even_active=True,
        break_even_triggered_on_bar=False,
        break_even_trigger_price=pos.trigger_price,
        break_even_stop_moved_to=pos.stop_moved_to,
        break_even_initial_risk=pos.initial_risk,
        break_even_instance_id=r.rule.instance_id,
        active_stop_management_source=r.source,
        position_direction=pos.direction,
    )


def management_traces_to_internals(
    traces: list[BarManagementTrace | None],
    *,
    side: Literal["long", "short"],
) -> dict[str, list[Any]]:
    """Per-bar exit-management arrays for Signal Trace ``internals.exit_management``."""

    def _pick(
        field: str,
        *,
        default: Any = None,
    ) -> list[Any]:
        out: list[Any] = []
        for trace in traces:
            if trace is None or trace.position_direction != side:
                out.append(default)
                continue
            out.append(getattr(trace, field))
        return out

    return {
        "effective_stop_price": _pick("effective_stop_price"),
        "pending_stop_price": _pick("pending_stop_price"),
        "break_even_active": _pick("break_even_active", default=False),
        "break_even_triggered_on_bar": _pick("break_even_triggered_on_bar", default=False),
        "break_even_trigger_price": _pick("break_even_trigger_price"),
        "break_even_stop_moved_to": _pick("break_even_stop_moved_to"),
        "break_even_initial_risk": _pick("break_even_initial_risk"),
        "break_even_instance_id": _pick("break_even_instance_id"),
        "active_stop_management_source": _pick("active_stop_management_source"),
    }


def build_break_even_diagnostics(pos: _OpenPosition) -> BreakEvenTradeDiagnostics | None:
    if pos.resolved is None:
        return None
    r = pos.resolved.rule
    return BreakEvenTradeDiagnostics(
        enabled=True,
        instance_id=r.instance_id,
        trigger_r=r.trigger_r,
        trigger_price=pos.trigger_price,
        triggered=pos.triggered,
        trigger_time_ms=None,
        stop_moved_to=pos.stop_moved_to if pos.triggered else None,
        initial_stop_price=pos.initial_stop_price,
        initial_risk=pos.initial_risk,
        active_stop_management_source=pos.resolved.source,
    )


def run_managed_bar_loop(
    *,
    spec: EmaPullbackStrategySpec,
    close: pd.Series,
    open_: pd.Series,
    high: pd.Series,
    low: pd.Series,
    entries: pd.Series,
    short_entries: pd.Series,
    exit_outputs: PortfolioExitOutputs,
    index_ms: np.ndarray | None = None,
    component_map: dict[str, str] | None = None,
) -> tuple[list[dict[str, Any]], list[BarManagementTrace | None]]:
    """Bar-by-bar simulation when exit_management rules are present."""

    n = len(close)
    open_pos: _OpenPosition | None = None
    closed: list[dict[str, Any]] = []
    traces: list[BarManagementTrace | None] = [None] * n

    def profile_at(i: int, side: Literal["long", "short"]) -> str:
        s = (
            exit_outputs.profile_long.iloc[i]
            if side == "long"
            else exit_outputs.profile_short.iloc[i]
        )
        p = str(s)
        return p if p in PROFILE_ORDER else "neutral"

    for i in range(n):
        o = float(open_.iloc[i])
        h = float(high.iloc[i])
        l = float(low.iloc[i])
        c = float(close.iloc[i])

        if open_pos is not None and open_pos.pending_stop is not None:
            open_pos.effective_stop = _tighten_stop(
                open_pos.effective_stop,
                open_pos.pending_stop,
                direction=open_pos.direction,
            )
            open_pos.pending_stop = None

        if open_pos is not None:
            prof = open_pos.locked_profile
            long_x = bool(exit_outputs.long_exits_by_profile[prof].iloc[i])
            short_x = bool(exit_outputs.short_exits_by_profile[prof].iloc[i])
            anchor = float(close.iloc[open_pos.entry_idx])
            exit_attr = _check_bar_exits(
                open_pos,
                bar_idx=i,
                open_=o,
                high=h,
                low=l,
                close=c,
                stop_anchor=anchor,
                long_exit=long_x,
                short_exit=short_x,
                ctx=exit_outputs.attribution,
                component_map=component_map,
            )
            if exit_attr is not None:
                closed.append(
                    {
                        "position": open_pos,
                        "exit_idx": i,
                        "exit_price": c,
                        "exit_attribution": exit_attr,
                    }
                )
                open_pos = None
            elif open_pos.resolved is not None and not open_pos.triggered:
                hit, trig_px = _trigger_reached(
                    direction=open_pos.direction,
                    entry_price=open_pos.entry_price,
                    initial_risk=open_pos.initial_risk,
                    trigger_r=open_pos.resolved.rule.trigger_r,
                    high=h,
                    low=l,
                )
                if hit:
                    moved = _moved_stop_price(
                        direction=open_pos.direction,
                        entry_price=open_pos.entry_price,
                        initial_risk=open_pos.initial_risk,
                        offset_r=open_pos.resolved.rule.offset_r,
                    )
                    open_pos.triggered = True
                    open_pos.trigger_idx = i
                    open_pos.trigger_price = trig_px
                    open_pos.stop_moved_to = moved
                    open_pos.pending_stop = moved

        if open_pos is None:
            if bool(entries.iloc[i]) and spec.trade_sides.includes("long"):
                prof = profile_at(i, "long")
                resolved = resolve_management_rule(spec.trade_management.exit_management, prof)
                sl_px, sl_r, tp_r = _initial_stop_at_entry(
                    direction="long",
                    entry_idx=i,
                    locked_profile=prof,
                    close=close,
                    exit_outputs=exit_outputs,
                )
                open_pos = _OpenPosition(
                    direction="long",
                    entry_idx=i,
                    entry_price=c,
                    locked_profile=prof,
                    resolved=resolved,
                    initial_stop_price=sl_px,
                    initial_risk=abs(c - sl_px),
                    effective_stop=sl_px,
                    sl_ratio=sl_r,
                    tp_ratio=tp_r,
                )
            elif bool(short_entries.iloc[i]) and spec.trade_sides.includes("short"):
                prof = profile_at(i, "short")
                resolved = resolve_management_rule(spec.trade_management.exit_management, prof)
                sl_px, sl_r, tp_r = _initial_stop_at_entry(
                    direction="short",
                    entry_idx=i,
                    locked_profile=prof,
                    close=close,
                    exit_outputs=exit_outputs,
                )
                open_pos = _OpenPosition(
                    direction="short",
                    entry_idx=i,
                    entry_price=c,
                    locked_profile=prof,
                    resolved=resolved,
                    initial_stop_price=sl_px,
                    initial_risk=abs(sl_px - c),
                    effective_stop=sl_px,
                    sl_ratio=sl_r,
                    tp_ratio=tp_r,
                )

        if open_pos is not None:
            tr = _bar_trace(open_pos)
            if tr is not None and open_pos.trigger_idx == i:
                tr = BarManagementTrace(
                    effective_stop_price=open_pos.effective_stop,
                    pending_stop_price=open_pos.pending_stop,
                    break_even_active=True,
                    break_even_triggered_on_bar=True,
                    break_even_trigger_price=open_pos.trigger_price,
                    break_even_stop_moved_to=open_pos.stop_moved_to,
                    break_even_initial_risk=open_pos.initial_risk,
                    break_even_instance_id=open_pos.resolved.rule.instance_id
                    if open_pos.resolved
                    else None,
                    active_stop_management_source=open_pos.resolved.source
                    if open_pos.resolved
                    else None,
                    position_direction=open_pos.direction,
                )
            traces[i] = tr

    if open_pos is not None:
        closed.append(
            {
                "position": open_pos,
                "exit_idx": n - 1,
                "exit_price": float(close.iloc[n - 1]),
                "open": True,
            }
        )

    return closed, traces
