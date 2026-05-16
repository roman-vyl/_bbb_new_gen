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

from research.strategies.ema_pullback.execution.exit_attribution import (
    ExitAttributionContext,
    classify_exit_reason,
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def default_results_dir() -> Path:
    return _repo_root() / "research" / "results"


def build_run_id(utc: datetime, family: str, symbol: str, timeframe: str) -> str:
    """``<utc_timestamp>_<family>_<symbol>_<timeframe>`` (compact UTC, filesystem-safe)."""

    if utc.tzinfo is None:
        utc = utc.replace(tzinfo=timezone.utc)
    else:
        utc = utc.astimezone(timezone.utc)
    ts = utc.strftime("%Y-%m-%dT%H%M%SZ")
    sym = symbol.strip().upper()
    tf = timeframe.strip()
    return f"{ts}_{family}_{sym}_{tf}"


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
) -> list[dict[str, Any]]:
    """Normalize vectorbt portfolio trades into Stage 9 trade_records (library-agnostic fields)."""

    index = close.index
    records_df = pf.trades.records
    if records_df is None or len(records_df) == 0:
        return []

    use_attr = _can_use_exit_attribution(
        close, high=high, low=low, open_s=open_s, attribution=attribution
    )

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

        if status == "open":
            exit_reason = "open"
        elif use_attr:
            assert attribution is not None and high is not None and low is not None and open_s is not None
            exit_reason = classify_exit_reason(
                row=row,
                close=close,
                high=high,
                low=low,
                open_=open_s,
                ctx=attribution,
            )
        else:
            exit_reason = "unknown"

        out.append(
            {
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
        )
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
        "report_schema_version": 3,
        "family": family,
        "symbol": symbol.strip().upper(),
        "timeframe": timeframe.strip(),
        "candles": int(candles_count),
        "data_range": {
            "from_open_time_ms": int(data_range_from_ms),
            "to_open_time_ms": int(data_range_to_ms),
        },
        "variants_count": len(variants),
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
