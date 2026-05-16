"""Exit reason attribution for vectorbt trades (Step 16)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

import pandas as pd


@dataclass(frozen=True)
class ExitAttributionContext:
    """Per-rule series aligned with ``spec.components.exits`` order."""

    index: pd.Index
    instance_ids: tuple[str, ...]
    exit_kinds: tuple[str, ...]
    long_signal_by_rule: tuple[pd.Series | None, ...]
    short_signal_by_rule: tuple[pd.Series | None, ...]
    distance_ratio_by_rule: tuple[pd.Series | None, ...]
    sl_stop_agg: pd.Series
    tp_stop_agg: pd.Series


def _finite(x: Any) -> bool:
    if x is None:
        return False
    try:
        v = float(x)
    except (TypeError, ValueError):
        return False
    return math.isfinite(v)


def _agg_sl_tp_at_entry(
    ctx: ExitAttributionContext,
    entry_idx: int,
) -> tuple[float | None, float | None]:
    sl_a = ctx.sl_stop_agg.iloc[entry_idx]
    tp_a = ctx.tp_stop_agg.iloc[entry_idx]
    sl_v = float(sl_a) if _finite(sl_a) else None
    tp_v = float(tp_a) if _finite(tp_a) else None
    return sl_v, tp_v


def _pick_distance_instance(
    ctx: ExitAttributionContext,
    entry_idx: int,
    *,
    exit_kind: Literal["stop_loss", "take_profit"],
    agg_value: float,
) -> str | None:
    """Which distance rule produced the aggregate min at ``entry_idx`` (first in spec on tie)."""

    eps = 1e-9 * max(1.0, abs(agg_value))
    best: tuple[int, str] | None = None
    for i, kind in enumerate(ctx.exit_kinds):
        if kind != exit_kind:
            continue
        series = ctx.distance_ratio_by_rule[i]
        if series is None:
            continue
        v = series.iloc[entry_idx]
        if not _finite(v):
            continue
        fv = float(v)
        if abs(fv - agg_value) <= eps:
            cand = (i, ctx.instance_ids[i])
            if best is None or i < best[0]:
                best = cand
    return None if best is None else best[1]


def _stop_hit_long(
    o: float,
    h: float,
    l: float,
    level: float,
    *,
    is_loss: bool,
) -> bool:
    """Mirror vectorbt ``get_stop_price_nb`` hit semantics (long: SL below, TP above)."""

    if is_loss:
        stop_price = level
        if o <= stop_price:
            return True
        return l <= stop_price <= h
    stop_price = level
    if stop_price <= o:
        return True
    return l <= stop_price <= h


def _stop_hit_short(
    o: float,
    h: float,
    l: float,
    level: float,
    *,
    is_loss: bool,
) -> bool:
    """Short: SL above anchor; TP below."""

    if is_loss:
        stop_price = level
        if stop_price <= o:
            return True
        return l <= stop_price <= h
    stop_price = level
    if o <= stop_price:
        return True
    return l <= stop_price <= h


def _levels_from_ratios(
    direction: str,
    stop_anchor: float,
    sl_r: float | None,
    tp_r: float | None,
) -> tuple[float | None, float | None]:
    """Absolute SL/TP levels from vectorbt default ``stop_entry_price`` = close (long/short formulas)."""

    if direction == "long":
        sl_level = stop_anchor * (1.0 - sl_r) if sl_r is not None else None
        tp_level = stop_anchor * (1.0 + tp_r) if tp_r is not None else None
        return sl_level, tp_level
    sl_level = stop_anchor * (1.0 + sl_r) if sl_r is not None else None
    tp_level = stop_anchor * (1.0 - tp_r) if tp_r is not None else None
    return sl_level, tp_level


def classify_exit_reason(
    *,
    row: dict[str, Any],
    close: pd.Series,
    high: pd.Series,
    low: pd.Series,
    open_: pd.Series,
    ctx: ExitAttributionContext,
) -> str:
    """Return ``exit_reason`` string for one ``pf.trades.records`` row."""

    status_code = int(row.get("status", 0))
    if status_code == 0:
        return "open"

    direction_code = int(row.get("direction", 0))
    direction = "long" if direction_code == 0 else "short"

    exit_idx_raw = row.get("exit_idx")
    entry_idx_raw = row.get("entry_idx")
    if exit_idx_raw is None or entry_idx_raw is None:
        return "unknown"
    try:
        exit_idx = int(exit_idx_raw)
        entry_idx = int(entry_idx_raw)
    except (TypeError, ValueError):
        return "unknown"

    if exit_idx < 0 or entry_idx < 0 or exit_idx >= len(close) or entry_idx >= len(close):
        return "unknown"

    stop_anchor = float(close.iloc[entry_idx])
    if not math.isfinite(stop_anchor):
        return "unknown"

    o_x = float(open_.iloc[exit_idx])
    h_x = float(high.iloc[exit_idx])
    l_x = float(low.iloc[exit_idx])
    if not all(map(math.isfinite, (o_x, h_x, l_x))):
        return "unknown"

    sl_agg, tp_agg = _agg_sl_tp_at_entry(ctx, entry_idx)
    sl_level, tp_level = _levels_from_ratios(direction, stop_anchor, sl_agg, tp_agg)

    if direction == "long":
        if sl_level is not None and sl_agg is not None and _stop_hit_long(
            o_x, h_x, l_x, sl_level, is_loss=True
        ):
            inst = _pick_distance_instance(ctx, entry_idx, exit_kind="stop_loss", agg_value=sl_agg)
            return f"stop_loss:{inst}" if inst else "unknown"
        if tp_level is not None and tp_agg is not None and _stop_hit_long(
            o_x, h_x, l_x, tp_level, is_loss=False
        ):
            inst = _pick_distance_instance(ctx, entry_idx, exit_kind="take_profit", agg_value=tp_agg)
            return f"take_profit:{inst}" if inst else "unknown"
    else:
        if sl_level is not None and sl_agg is not None and _stop_hit_short(
            o_x, h_x, l_x, sl_level, is_loss=True
        ):
            inst = _pick_distance_instance(ctx, entry_idx, exit_kind="stop_loss", agg_value=sl_agg)
            return f"stop_loss:{inst}" if inst else "unknown"
        if tp_level is not None and tp_agg is not None and _stop_hit_short(
            o_x, h_x, l_x, tp_level, is_loss=False
        ):
            inst = _pick_distance_instance(ctx, entry_idx, exit_kind="take_profit", agg_value=tp_agg)
            return f"take_profit:{inst}" if inst else "unknown"

    masks = ctx.long_signal_by_rule if direction == "long" else ctx.short_signal_by_rule
    for i, series in enumerate(masks):
        if series is None:
            continue
        if bool(series.iloc[exit_idx]):
            return f"signal:{ctx.instance_ids[i]}"

    return "unknown"
