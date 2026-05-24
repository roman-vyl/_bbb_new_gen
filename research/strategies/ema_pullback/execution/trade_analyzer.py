"""Post-trade quality diagnostics for ema_pullback closed trades."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import math
from typing import Any

import pandas as pd


QUALITY_FLAGS = (
    "high_mfe_high_capture",
    "high_mfe_low_capture",
    "signal_exit_winner",
    "signal_exit_giveback_failure",
    "stop_loss_after_low_mfe",
    "stop_loss_after_bad_context",
)


@dataclass(frozen=True)
class TradeQualityConfig:
    schema: str = "trade-exit-quality-diagnostics-v1"
    high_mfe_atr: float = 2.0
    high_mfe_pct_fallback: float = 0.02
    high_capture_ratio: float = 0.60
    low_capture_ratio: float = 0.30
    low_mfe_atr: float = 1.0
    low_mfe_pct_fallback: float = 0.005
    giveback_failure_atr: float = 1.5
    atr_source: str | None = None

    def to_payload(self) -> dict[str, Any]:
        return asdict(self)


DEFAULT_TRADE_QUALITY_CONFIG = TradeQualityConfig()


def trade_quality_config_payload(*, atr_source: str | None = None) -> dict[str, Any]:
    return TradeQualityConfig(atr_source=atr_source).to_payload()


def _finite_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(out):
        return None
    return out


def _ratio_or_none(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator <= 0.0:
        return None
    return numerator / denominator


def _entry_atr(
    diagnostic_atr_series: pd.Series | None,
    entry_idx: int,
) -> float | None:
    if diagnostic_atr_series is None or entry_idx < 0 or entry_idx >= len(diagnostic_atr_series):
        return None
    value = _finite_float(diagnostic_atr_series.iloc[entry_idx])
    if value is None or value <= 0.0:
        return None
    return value


def _is_stop_loss_exit(record: dict[str, Any]) -> bool:
    exit_kind = record.get("exit_kind")
    if exit_kind == "stop_loss":
        return True
    exit_reason = str(record.get("exit_reason") or "")
    if exit_reason.startswith("stop_loss:"):
        return True
    component_id = str(record.get("exit_component_id") or "")
    return "stop_loss" in component_id


def _bad_context_for_direction(direction: str, entry_context_state: Any) -> bool:
    if direction == "long":
        return entry_context_state in {"down", "neutral"}
    if direction == "short":
        return entry_context_state in {"up", "neutral"}
    return False


def _high_mfe(metrics: dict[str, Any], config: TradeQualityConfig) -> bool:
    mfe_atr = metrics.get("mfe_atr")
    if mfe_atr is not None:
        return float(mfe_atr) >= config.high_mfe_atr
    mfe_pct = metrics.get("mfe_pct")
    return mfe_pct is not None and float(mfe_pct) >= config.high_mfe_pct_fallback


def _low_mfe(metrics: dict[str, Any], config: TradeQualityConfig) -> bool:
    mfe_atr = metrics.get("mfe_atr")
    if mfe_atr is not None:
        return float(mfe_atr) < config.low_mfe_atr
    mfe_pct = metrics.get("mfe_pct")
    return mfe_pct is not None and float(mfe_pct) < config.low_mfe_pct_fallback


def _large_giveback(metrics: dict[str, Any], config: TradeQualityConfig) -> bool:
    giveback_atr = metrics.get("giveback_atr")
    return giveback_atr is not None and float(giveback_atr) >= config.giveback_failure_atr


def classify_quality_flags(
    record: dict[str, Any],
    metrics: dict[str, Any],
    *,
    config: TradeQualityConfig = DEFAULT_TRADE_QUALITY_CONFIG,
) -> list[str]:
    """Return additive v1 quality flags for one closed trade."""

    flags: list[str] = []
    high_mfe = _high_mfe(metrics, config)
    low_mfe = _low_mfe(metrics, config)
    capture_ratio = metrics.get("capture_ratio")
    high_capture = capture_ratio is not None and float(capture_ratio) >= config.high_capture_ratio
    low_capture = capture_ratio is not None and float(capture_ratio) < config.low_capture_ratio
    captured_price = metrics.get("captured_price")
    is_signal_exit = record.get("exit_kind") == "signal"
    is_stop_loss = _is_stop_loss_exit(record)

    if high_mfe and high_capture:
        flags.append("high_mfe_high_capture")
    if high_mfe and low_capture:
        flags.append("high_mfe_low_capture")
    if is_signal_exit and captured_price is not None and float(captured_price) > 0.0 and high_capture:
        flags.append("signal_exit_winner")
    if is_signal_exit and high_mfe and (low_capture or _large_giveback(metrics, config)):
        flags.append("signal_exit_giveback_failure")
    if is_stop_loss and low_mfe:
        flags.append("stop_loss_after_low_mfe")
    if is_stop_loss and _bad_context_for_direction(
        str(record.get("direction") or ""),
        record.get("entry_context_state"),
    ):
        flags.append("stop_loss_after_bad_context")
    return flags


def compute_trade_quality_metrics(
    *,
    direction: str,
    entry_price: float,
    exit_price: float,
    entry_idx: int,
    exit_idx: int,
    high: pd.Series,
    low: pd.Series,
    diagnostic_atr_series: pd.Series | None = None,
) -> dict[str, Any]:
    """Compute direction-aware bar-level excursion and capture metrics.

    The entry and exit bars are included. For intrabar stop/take exits, v1 does
    not reconstruct candle order, so the exit bar high/low may include movement
    after the fill.
    """

    if entry_idx < 0 or exit_idx < entry_idx or exit_idx >= len(high) or exit_idx >= len(low):
        raise ValueError("invalid entry/exit indices for trade quality diagnostics")
    if entry_price <= 0.0:
        raise ValueError("entry_price must be positive for trade quality diagnostics")

    high_span = high.iloc[entry_idx : exit_idx + 1].astype(float)
    low_span = low.iloc[entry_idx : exit_idx + 1].astype(float)
    if high_span.isna().any() or low_span.isna().any():
        raise ValueError("high/low span contains NaN for trade quality diagnostics")

    if direction == "long":
        favorable = high_span - entry_price
        adverse = low_span - entry_price
        captured_price = exit_price - entry_price
    elif direction == "short":
        favorable = entry_price - low_span
        adverse = entry_price - high_span
        captured_price = entry_price - exit_price
    else:
        raise ValueError(f"unsupported trade direction: {direction!r}")

    mfe_offset = int(favorable.to_numpy().argmax())
    mae_offset = int(adverse.to_numpy().argmin())
    mfe_price = float(favorable.iloc[mfe_offset])
    mae_price = float(adverse.iloc[mae_offset])
    if abs(mfe_price) < 1e-12:
        mfe_price = 0.0
    giveback_price = mfe_price - captured_price
    if giveback_price < 0.0:
        giveback_price = 0.0
    entry_atr = _entry_atr(diagnostic_atr_series, entry_idx)

    return {
        "mfe_price": mfe_price,
        "mfe_pct": mfe_price / entry_price,
        "mfe_atr": _ratio_or_none(mfe_price, entry_atr),
        "mae_price": mae_price,
        "mae_pct": mae_price / entry_price,
        "mae_atr": _ratio_or_none(mae_price, entry_atr),
        "bars_to_mfe": mfe_offset,
        "bars_to_mae": mae_offset,
        "captured_price": captured_price,
        "captured_pct": captured_price / entry_price,
        "captured_atr": _ratio_or_none(captured_price, entry_atr),
        "capture_ratio": captured_price / mfe_price if mfe_price > 0.0 else None,
        "giveback_price": giveback_price,
        "giveback_pct": giveback_price / entry_price,
        "giveback_atr": _ratio_or_none(giveback_price, entry_atr),
        "bars_from_mfe_to_exit": exit_idx - (entry_idx + mfe_offset),
    }


def build_trade_quality_diagnostics(
    record: dict[str, Any],
    *,
    entry_idx: int,
    exit_idx: int,
    high: pd.Series,
    low: pd.Series,
    diagnostic_atr_series: pd.Series | None = None,
    config: TradeQualityConfig = DEFAULT_TRADE_QUALITY_CONFIG,
) -> dict[str, Any]:
    metrics = compute_trade_quality_metrics(
        direction=str(record["direction"]),
        entry_price=float(record["entry_price"]),
        exit_price=float(record["exit_price"]),
        entry_idx=entry_idx,
        exit_idx=exit_idx,
        high=high,
        low=low,
        diagnostic_atr_series=diagnostic_atr_series,
    )
    metrics["quality_flags"] = classify_quality_flags(record, metrics, config=config)
    return metrics


def _avg_non_null(records: list[dict[str, Any]], key: str) -> float | None:
    values = [_finite_float(record.get(key)) for record in records]
    non_null = [value for value in values if value is not None]
    if not non_null:
        return None
    return sum(non_null) / len(non_null)


def _quality_bucket(records: list[dict[str, Any]]) -> dict[str, Any]:
    exit_reason_mix: dict[str, int] = {}
    for record in records:
        reason = str(record.get("exit_reason") or "unknown")
        exit_reason_mix[reason] = exit_reason_mix.get(reason, 0) + 1
    return {
        "trades": len(records),
        "avg_mfe_atr": _avg_non_null(records, "mfe_atr"),
        "avg_mfe_pct": _avg_non_null(records, "mfe_pct"),
        "avg_capture_ratio": _avg_non_null(records, "capture_ratio"),
        "avg_giveback_atr": _avg_non_null(records, "giveback_atr"),
        "avg_giveback_pct": _avg_non_null(records, "giveback_pct"),
        "exit_reason_mix": exit_reason_mix,
    }


def build_quality_flag_breakdown(trade_records: list[dict[str, Any]]) -> dict[str, Any]:
    closed = [record for record in trade_records if record.get("status") == "closed"]
    out: dict[str, Any] = {}
    for flag in QUALITY_FLAGS:
        bucket = [record for record in closed if flag in (record.get("quality_flags") or [])]
        if bucket:
            out[flag] = _quality_bucket(bucket)
    return out


def build_exit_component_quality_breakdown(trade_records: list[dict[str, Any]]) -> dict[str, Any]:
    closed = [
        record
        for record in trade_records
        if record.get("status") == "closed" and record.get("exit_component_id")
    ]
    components = sorted({str(record["exit_component_id"]) for record in closed})
    out: dict[str, Any] = {}
    for component in components:
        bucket = [record for record in closed if record.get("exit_component_id") == component]
        quality_flag_mix: dict[str, int] = {}
        for record in bucket:
            for flag in record.get("quality_flags") or []:
                quality_flag_mix[str(flag)] = quality_flag_mix.get(str(flag), 0) + 1
        out[component] = {
            "trades": len(bucket),
            "avg_mfe_atr": _avg_non_null(bucket, "mfe_atr"),
            "avg_mfe_pct": _avg_non_null(bucket, "mfe_pct"),
            "avg_capture_ratio": _avg_non_null(bucket, "capture_ratio"),
            "avg_giveback_atr": _avg_non_null(bucket, "giveback_atr"),
            "avg_giveback_pct": _avg_non_null(bucket, "giveback_pct"),
            "quality_flag_mix": quality_flag_mix,
            "signal_exit_winners": quality_flag_mix.get("signal_exit_winner", 0),
            "signal_exit_giveback_failures": quality_flag_mix.get("signal_exit_giveback_failure", 0),
        }
    return out
