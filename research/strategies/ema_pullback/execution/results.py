"""Research run JSON artifacts: payload builder, trade normalization, writer.

Stage 9: structured machine-readable output under ``research/results/``.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

import pandas as pd

from data_engine.contracts import timeframe_ms

from research.strategies.ema_pullback.execution.exit_attribution import (
    ExitAttributionContext,
    classify_exit_attribution,
)
from research.strategies.ema_pullback.execution.trade_analyzer import (
    build_exit_component_quality_breakdown,
    build_quality_flag_breakdown,
    build_trade_quality_diagnostics,
    trade_quality_config_payload,
)

_PROFILE_KEYS = ("aligned", "countertrend", "neutral")
_CONTEXT_LABELS = frozenset({"up", "down", "neutral"})


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def default_results_dir() -> Path:
    return _repo_root() / "research" / "results"


def build_run_id(
    utc: datetime,
    family: str,
    symbol: str,
    timeframe: str,
    *,
    suffix: str | None = None,
) -> str:
    """``<utc_timestamp>_<family>_<symbol>_<timeframe>[__<suffix>]`` (compact UTC, filesystem-safe)."""

    if utc.tzinfo is None:
        utc = utc.replace(tzinfo=timezone.utc)
    else:
        utc = utc.astimezone(timezone.utc)
    ts = utc.strftime("%Y-%m-%dT%H%M%SZ")
    sym = symbol.strip().upper()
    tf = timeframe.strip()
    base = f"{ts}_{family}_{sym}_{tf}"
    if suffix is None:
        return base
    return f"{base}__{sanitize_run_id_suffix(suffix)}"


def sanitize_run_id_suffix(suffix: str) -> str:
    """Normalize a programmatic run-id suffix to filesystem-safe characters."""

    import re

    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "_", suffix.strip())
    if not cleaned:
        raise ValueError("run_id_suffix must contain at least one safe character")
    return cleaned


def _format_created_at(utc: datetime) -> str:
    if utc.tzinfo is None:
        utc = utc.replace(tzinfo=timezone.utc)
    else:
        utc = utc.astimezone(timezone.utc)
    return utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def _scalar_json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (str, int)):
        return value
    if hasattr(value, "item") and callable(value.item):
        try:
            value = value.item()
        except Exception:  # pragma: no cover - defensive
            pass
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return value
    if pd.isna(value):
        return None
    if isinstance(value, (pd.Timestamp, datetime)):
        ts = pd.Timestamp(value)
        if ts.tzinfo is None:
            ts = ts.tz_localize("UTC")
        else:
            ts = ts.tz_convert("UTC")
        return int(ts.value // 1_000_000)
    try:
        import numpy as np

        if isinstance(value, np.generic):
            return _scalar_json_safe(value.item())
    except ImportError:
        pass
    if isinstance(value, Path):
        return value.as_posix()
    raise TypeError(f"unsupported scalar for JSON: {type(value)!r}")


def json_safe(value: Any) -> Any:
    """Recursively convert to JSON-friendly Python types (null for NaN/inf)."""

    if value is None:
        return None
    if isinstance(value, Mapping):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    try:
        return _scalar_json_safe(value)
    except TypeError:
        return str(value)


def _series_index_aligned(series: pd.Series, index: pd.Index) -> bool:
    return series.index.equals(index)


def _attribution_context_aligned(ctx: ExitAttributionContext, index: pd.Index) -> bool:
    if not ctx.index.equals(index):
        return False
    for group in (
        ctx.long_signal_by_rule,
        ctx.short_signal_by_rule,
        ctx.distance_ratio_by_rule,
    ):
        for series in group:
            if series is not None and not _series_index_aligned(series, index):
                return False
    return _series_index_aligned(ctx.sl_stop_agg, index) and _series_index_aligned(ctx.tp_stop_agg, index)


def _can_use_exit_attribution(
    close: pd.Series,
    *,
    high: pd.Series | None,
    low: pd.Series | None,
    open_s: pd.Series | None,
    attribution: ExitAttributionContext | None,
) -> bool:
    if attribution is None or high is None or low is None or open_s is None:
        return False
    index = close.index
    if not (
        _series_index_aligned(high, index)
        and _series_index_aligned(low, index)
        and _series_index_aligned(open_s, index)
        and _attribution_context_aligned(attribution, index)
    ):
        return False
    return True


def _context_state_label(raw: Any) -> str:
    if isinstance(raw, str) and raw in _CONTEXT_LABELS:
        return raw
    return "unknown"


def _profile_label(raw: Any) -> str | None:
    if isinstance(raw, str) and raw in _PROFILE_KEYS:
        return raw
    return None


def _trade_fees_paid(row: dict[str, Any]) -> float:
    entry_fees = row.get("entry_fees")
    exit_fees = row.get("exit_fees")
    if entry_fees is not None or exit_fees is not None:
        return float(entry_fees or 0.0) + float(exit_fees or 0.0)
    fees = row.get("fees")
    if fees is not None:
        return float(fees)
    return 0.0


def _gross_return_pct(
    gross_pnl: float | None,
    entry_price: float | None,
    size: float | None,
) -> float | None:
    if gross_pnl is None or entry_price is None or size is None:
        return None
    notional = float(entry_price) * abs(float(size))
    if notional == 0.0:
        return None
    value = gross_pnl / notional
    return _scalar_json_safe(value)  # type: ignore[return-value]


def _closed_trades(trade_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [record for record in trade_records if record.get("status") == "closed"]


def _profit_factor_from_pnls(pnl_values: list[float]) -> float | None:
    gross_profit = sum(value for value in pnl_values if value > 0.0)
    gross_loss = abs(sum(value for value in pnl_values if value < 0.0))
    if gross_loss == 0.0:
        return None
    return _scalar_json_safe(gross_profit / gross_loss)  # type: ignore[return-value]


def _avg_hold_bars(records: list[dict[str, Any]]) -> float | None:
    holds = [record["hold_bars"] for record in records if record.get("hold_bars") is not None]
    if not holds:
        return None
    return _scalar_json_safe(sum(holds) / len(holds))  # type: ignore[return-value]


def _bucket_metrics(records: list[dict[str, Any]]) -> dict[str, Any]:
    trades = len(records)
    pnl_values = [float(record.get("pnl") or 0.0) for record in records]
    gross_pnl_values = [float(record.get("gross_pnl") or 0.0) for record in records]
    fees_values = [float(record.get("fees_paid") or 0.0) for record in records]
    returns = [float(record["return_pct"]) for record in records if record.get("return_pct") is not None]
    wins = sum(1 for value in pnl_values if value > 0.0)
    return {
        "trades": trades,
        "pnl": _scalar_json_safe(sum(pnl_values)),
        "gross_pnl": _scalar_json_safe(sum(gross_pnl_values)),
        "fees_paid": _scalar_json_safe(sum(fees_values)),
        "profit_factor": _profit_factor_from_pnls(pnl_values),
        "win_rate": _scalar_json_safe(wins / trades) if trades else None,
        "avg_return_pct": _scalar_json_safe(sum(returns) / len(returns)) if returns else None,
        "avg_hold_bars": _avg_hold_bars(records),
    }


def _profile_bucket_metrics(records: list[dict[str, Any]]) -> dict[str, Any]:
    metrics = _bucket_metrics(records)
    mix: dict[str, int] = {}
    for record in records:
        reason = str(record.get("exit_reason") or "unknown")
        mix[reason] = mix.get(reason, 0) + 1
    metrics["exit_reason_mix"] = mix
    return metrics


def build_profile_breakdown(trade_records: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate closed trades by ``entry_profile``."""

    closed = _closed_trades(trade_records)
    return {
        profile: _profile_bucket_metrics(
            [record for record in closed if record.get("entry_profile") == profile]
        )
        for profile in _PROFILE_KEYS
    }


def build_profile_side_breakdown(trade_records: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate closed trades by direction and ``entry_profile`` (side × context)."""

    closed = _closed_trades(trade_records)
    out: dict[str, Any] = {}
    for side in ("long", "short"):
        side_closed = [record for record in closed if record.get("direction") == side]
        section: dict[str, Any] = {
            profile: _profile_bucket_metrics(
                [record for record in side_closed if record.get("entry_profile") == profile]
            )
            for profile in _PROFILE_KEYS
        }
        section["total"] = _profile_bucket_metrics(side_closed)
        out[side] = section
    total_section: dict[str, Any] = {
        profile: _profile_bucket_metrics(
            [record for record in closed if record.get("entry_profile") == profile]
        )
        for profile in _PROFILE_KEYS
    }
    total_section["total"] = _profile_bucket_metrics(closed)
    out["total"] = total_section
    return out


def build_exit_reason_breakdown(trade_records: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate closed trades by full ``exit_reason`` string."""

    closed = _closed_trades(trade_records)
    reasons = sorted({str(record.get("exit_reason") or "unknown") for record in closed})
    return {reason: _bucket_metrics([r for r in closed if str(r.get("exit_reason") or "unknown") == reason]) for reason in reasons}


def build_trade_quality_breakdowns(trade_records: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "quality_flag_breakdown": build_quality_flag_breakdown(trade_records),
        "exit_component_quality_breakdown": build_exit_component_quality_breakdown(trade_records),
    }


def build_fee_diagnostics(
    trade_records: list[dict[str, Any]],
    *,
    fees_rate: float,
) -> dict[str, Any]:
    closed = _closed_trades(trade_records)
    total_fees = sum(float(record.get("fees_paid") or 0.0) for record in closed)
    gross_pnl = sum(float(record.get("gross_pnl") or 0.0) for record in closed)
    net_pnl = sum(float(record.get("pnl") or 0.0) for record in closed)
    gross_profit = sum(float(record.get("gross_pnl") or 0.0) for record in closed if float(record.get("gross_pnl") or 0.0) > 0.0)
    out: dict[str, Any] = {
        "total_fees_paid": _scalar_json_safe(total_fees),
        "gross_pnl": _scalar_json_safe(gross_pnl),
        "net_pnl": _scalar_json_safe(net_pnl),
        "fees_rate": _scalar_json_safe(fees_rate),
    }
    if gross_profit > 0.0:
        out["fees_as_pct_of_gross_profit"] = _scalar_json_safe(total_fees / gross_profit)
    else:
        out["fees_as_pct_of_gross_profit"] = None
    return out


def _index_to_open_time_ms(index: pd.Index, idx: Any) -> int | None:
    if idx is None or (isinstance(idx, float) and math.isnan(idx)):
        return None
    try:
        ii = int(idx)
    except (TypeError, ValueError):
        return None
    if ii < 0 or ii >= len(index):
        return None
    ts = index[ii]
    if not isinstance(ts, pd.Timestamp):
        ts = pd.Timestamp(ts)
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    else:
        ts = ts.tz_convert("UTC")
    return int(ts.value // 1_000_000)


def extract_trade_records(
    pf: Any,
    close: pd.Series,
    *,
    high: pd.Series | None = None,
    low: pd.Series | None = None,
    open_s: pd.Series | None = None,
    attribution: ExitAttributionContext | None = None,
    profile_long: pd.Series | None = None,
    profile_short: pd.Series | None = None,
    context_state: pd.Series | None = None,
    diagnostic_atr_series: pd.Series | None = None,
    base_timeframe: str | None = None,
    exit_component_map: dict[str, str] | None = None,
    strategy_spec: Any | None = None,
    context_bundle: Any | None = None,
) -> list[dict[str, Any]]:
    """Normalize vectorbt portfolio trades into Stage 9 trade_records (library-agnostic fields)."""

    index = close.index
    records_df = pf.trades.records
    if records_df is None or len(records_df) == 0:
        return []

    use_attr = _can_use_exit_attribution(
        close, high=high, low=low, open_s=open_s, attribution=attribution
    )
    base_timeframe_minutes: int | None = None
    if base_timeframe is not None:
        base_timeframe_minutes = timeframe_ms(base_timeframe.strip()) // 60_000

    out: list[dict[str, Any]] = []
    # TradeDirectionT(Long=0, Short=1), TradeStatusT(Open=0, Closed=1)
    for i, row in enumerate(records_df.to_dict("records")):
        direction_code = int(row.get("direction", 0))
        status_code = int(row.get("status", 0))
        direction = "long" if direction_code == 0 else "short"
        status = "open" if status_code == 0 else "closed"

        entry_ms = _index_to_open_time_ms(index, row.get("entry_idx"))
        exit_ms = _index_to_open_time_ms(index, row.get("exit_idx"))

        entry_p = _scalar_json_safe(row.get("entry_price"))
        exit_p = _scalar_json_safe(row.get("exit_price"))
        size_v = _scalar_json_safe(row.get("size"))
        pnl_v = _scalar_json_safe(row.get("pnl"))
        ret_v = _scalar_json_safe(row.get("return"))

        if status == "open":
            exit_ms = None
            exit_p = None

        exit_attr = None
        if status == "open":
            exit_reason = "open"
        elif use_attr:
            assert attribution is not None and high is not None and low is not None and open_s is not None
            exit_attr = classify_exit_attribution(
                row=row,
                close=close,
                high=high,
                low=low,
                open_=open_s,
                ctx=attribution,
                component_map=exit_component_map,
            )
            exit_reason = exit_attr.exit_reason
        else:
            exit_reason = "unknown"

        record: dict[str, Any] = {
            "trade_id": i + 1,
            "direction": direction,
            "status": status,
            "entry_time_ms": entry_ms,
            "exit_time_ms": exit_ms,
            "entry_price": entry_p,
            "exit_price": exit_p,
            "size": size_v,
            "pnl": pnl_v,
            "return_pct": ret_v,
            "exit_reason": exit_reason,
        }

        if status == "closed":
            fees_paid = _scalar_json_safe(_trade_fees_paid(row))
            pnl_f = float(pnl_v) if pnl_v is not None else 0.0
            fees_f = float(fees_paid) if fees_paid is not None else 0.0
            gross_pnl = _scalar_json_safe(pnl_f + fees_f)
            record["gross_pnl"] = gross_pnl
            record["fees_paid"] = fees_paid
            record["gross_return_pct"] = _gross_return_pct(
                float(gross_pnl) if gross_pnl is not None else None,
                float(entry_p) if entry_p is not None else None,
                float(size_v) if size_v is not None else None,
            )

            if exit_attr is not None:
                record["exit_group"] = exit_attr.exit_group
                record["exit_profile"] = exit_attr.exit_profile
                record["exit_component_id"] = exit_attr.exit_component_id
                record["exit_instance_id"] = exit_attr.exit_instance_id
                record["exit_kind"] = exit_attr.exit_kind
            else:
                record["exit_group"] = None
                record["exit_profile"] = None
                record["exit_component_id"] = None
                record["exit_instance_id"] = None
                record["exit_kind"] = None

            try:
                entry_idx = int(row.get("entry_idx"))
                exit_idx = int(row.get("exit_idx"))
            except (TypeError, ValueError):
                entry_idx = -1
                exit_idx = -1
            if entry_idx >= 0 and exit_idx >= 0:
                hold_bars = exit_idx - entry_idx + 1
                record["hold_bars"] = hold_bars
                if base_timeframe_minutes is not None:
                    record["hold_minutes"] = hold_bars * base_timeframe_minutes

            entry_profile: str | None = None
            if direction == "long" and profile_long is not None and 0 <= entry_idx < len(profile_long):
                entry_profile = _profile_label(profile_long.iloc[entry_idx])
            elif direction == "short" and profile_short is not None and 0 <= entry_idx < len(profile_short):
                entry_profile = _profile_label(profile_short.iloc[entry_idx])
            if entry_profile is not None:
                record["entry_profile"] = entry_profile
                record["active_exit_profile"] = entry_profile

            if context_state is not None and 0 <= entry_idx < len(context_state):
                record["entry_context_state"] = _context_state_label(context_state.iloc[entry_idx])

            if strategy_spec is not None:
                from research.strategies.ema_pullback.context.consumption_trace import (
                    consumption_attribution_for_trade,
                )

                entry_cc, exit_cc = consumption_attribution_for_trade(
                    strategy_spec,
                    entry_idx=entry_idx,
                    direction=direction,
                    context_bundle=context_bundle,
                    index=index,
                )
                if entry_cc is not None:
                    record["entry_context_consumption"] = entry_cc
                if exit_cc is not None:
                    record["exit_context_consumption"] = exit_cc

            if (
                high is not None
                and low is not None
                and entry_p is not None
                and exit_p is not None
                and entry_idx >= 0
                and exit_idx >= entry_idx
            ):
                record.update(
                    build_trade_quality_diagnostics(
                        record,
                        entry_idx=entry_idx,
                        exit_idx=exit_idx,
                        high=high,
                        low=low,
                        diagnostic_atr_series=diagnostic_atr_series,
                    )
                )

        out.append(record)
    return out


def build_research_run_payload(
    *,
    run_id: str,
    created_at: datetime,
    family: str,
    symbol: str,
    timeframe: str,
    candles_count: int,
    data_range_from_ms: int,
    data_range_to_ms: int,
    variants: list[dict[str, Any]],
    batch_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble top-level artifact dict (field order stable for readability)."""

    payload = {
        "run_id": run_id,
        "created_at": _format_created_at(created_at),
        "report_schema_version": 5,
        "family": family,
        "symbol": symbol.strip().upper(),
        "timeframe": timeframe.strip(),
        "candles": int(candles_count),
        "data_range": {
            "from_open_time_ms": int(data_range_from_ms),
            "to_open_time_ms": int(data_range_to_ms),
        },
        "variants_count": len(variants),
        "trade_quality_config": trade_quality_config_payload(),
        "variants": variants,
    }
    if batch_metadata is not None:
        payload["batch_metadata"] = batch_metadata
    return payload


def write_research_results(
    payload: dict[str, Any],
    *,
    results_dir: Path | None = None,
) -> tuple[Path, Path]:
    """Write ``latest.json`` and ``runs/<run_id>.json``; return both paths."""

    base = results_dir if results_dir is not None else default_results_dir()
    runs = base / "runs"
    runs.mkdir(parents=True, exist_ok=True)

    run_id = str(payload["run_id"])
    safe = json_safe(payload)
    text = json.dumps(safe, indent=2, ensure_ascii=False)

    run_path = runs / f"{run_id}.json"
    latest_path = base / "latest.json"
    run_path.write_text(text, encoding="utf-8")
    latest_path.write_text(text, encoding="utf-8")
    return latest_path, run_path
