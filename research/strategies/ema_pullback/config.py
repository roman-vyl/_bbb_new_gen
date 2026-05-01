"""Frozen strategy config and deterministic config_id for ema_pullback.

Stage 3 introduces explicit strategy/run identity fields and stable hashing.
Portfolio knobs (init_cash, fees, slippage) remain sourced from this config.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping


@dataclass(frozen=True)
class StrategyConfig:
    family: str
    variant: str
    symbol: str
    timeframe: str
    db_path: Path | None
    ema_fast: int
    ema_slow: int
    init_cash: float
    fees: float
    slippage: float

    def __post_init__(self) -> None:
        if self.family != "ema_pullback":
            raise ValueError("family must be 'ema_pullback'")
        if not self.variant.strip():
            raise ValueError("variant must be non-empty")
        if not self.symbol.strip():
            raise ValueError("symbol must be non-empty")
        if not self.timeframe.strip():
            raise ValueError("timeframe must be non-empty")
        if self.ema_fast <= 0 or self.ema_slow <= 0:
            raise ValueError("ema periods must be > 0")
        if self.ema_fast >= self.ema_slow:
            raise ValueError("ema_fast must be < ema_slow")
        if self.init_cash <= 0:
            raise ValueError("init_cash must be > 0")
        if self.fees < 0:
            raise ValueError("fees must be >= 0")
        if self.slippage < 0:
            raise ValueError("slippage must be >= 0")


IDENTITY_FIELDS: tuple[str, ...] = (
    "family",
    "variant",
    "symbol",
    "timeframe",
    "ema_fast",
    "ema_slow",
    "init_cash",
    "fees",
    "slippage",
)


def _normalize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        try:
            normalized = Decimal(str(value)).normalize()
        except InvalidOperation as exc:
            raise ValueError(f"cannot normalize float value {value!r}") from exc
        as_text = format(normalized, "f")
        if "." in as_text:
            as_text = as_text.rstrip("0").rstrip(".")
        if as_text == "-0":
            as_text = "0"
        return as_text
    if isinstance(value, str):
        return value
    if isinstance(value, Path):
        return value.as_posix()
    raise TypeError(f"unsupported config identity value type: {type(value)!r}")


def identity_payload(config: StrategyConfig) -> dict[str, Any]:
    """Return normalized identity map used for deterministic config_id."""

    raw = {
        "family": config.family,
        "variant": config.variant,
        "symbol": config.symbol,
        "timeframe": config.timeframe,
        "ema_fast": config.ema_fast,
        "ema_slow": config.ema_slow,
        "init_cash": config.init_cash,
        "fees": config.fees,
        "slippage": config.slippage,
    }
    return {key: _normalize_value(value) for key, value in raw.items()}


def canonical_identity_json(identity: Mapping[str, Any]) -> str:
    normalized = {key: _normalize_value(value) for key, value in identity.items()}
    return json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def config_id_from_identity(identity: Mapping[str, Any], hash_len: int = 12) -> str:
    if hash_len <= 0:
        raise ValueError("hash_len must be > 0")
    payload = canonical_identity_json(identity)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:hash_len]


def strategy_config_id(config: StrategyConfig, hash_len: int = 12) -> str:
    return config_id_from_identity(identity_payload(config), hash_len=hash_len)


# Backward compatibility alias for Stage 1/2 names.
EmaPullbackConfig = StrategyConfig


DEFAULT_CONFIG = StrategyConfig(
    family="ema_pullback",
    variant="ema_pullback_baseline",
    symbol="BTCUSDT",
    timeframe="1h",
    db_path=None,
    ema_fast=20,
    ema_slow=50,
    init_cash=100.0,
    fees=0.0,
    slippage=0.0,
)
