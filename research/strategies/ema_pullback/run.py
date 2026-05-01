"""CLI: DB candles -> component-aware pipeline -> manual variants -> vectorbt.

EMA pullback research runner for component-aware manual variants.
It runs fixed/manual variants for one ema_pullback family over shared candles.
EMA periods are defined in ``variants.py`` (not via CLI), while component ids
come from ``StrategyConfig`` defaults/selection.

Run from repo root (after ``pip install -e ".[research]"``):

    python research/strategies/ema_pullback/run.py
"""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any, Sequence

# Allow running this file without PYTHONPATH tricks.
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from data_engine.config import Settings
from data_engine.contracts import TimeWindow
from data_engine.engine.time_grid import tf_ms
from data_engine.store import Db

from research.ema_smoke_helpers import candles_to_ohlcv_dataframe
from research.strategies.ema_pullback.config import (
    DEFAULT_CONFIG,
    StrategyConfig,
)
from research.strategies.ema_pullback.features import add_feature_columns
from research.strategies.ema_pullback.instance import StrategyInstance
from research.strategies.ema_pullback.risk import portfolio_risk_from_config
from research.strategies.ema_pullback.signals import ema_crossover_signals
from research.strategies.ema_pullback.trade_management import resolve_trade_management_profile
from research.strategies.ema_pullback.variants import build_manual_variants


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="EMA pullback research runner for component-aware manual variants."
    )
    p.add_argument("--symbol", default=DEFAULT_CONFIG.symbol, help="Symbol in DB")
    p.add_argument("--tf", default=DEFAULT_CONFIG.timeframe, help="Timeframe")
    p.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="Override SQLite path (default: Settings / DATA_ENGINE_DB_PATH)",
    )
    p.add_argument("--init-cash", type=float, default=DEFAULT_CONFIG.init_cash, help="Initial cash")
    p.add_argument("--fees", type=float, default=DEFAULT_CONFIG.fees, help="Per-trade fee")
    p.add_argument("--slippage", type=float, default=DEFAULT_CONFIG.slippage, help="Per-trade slippage")
    return p.parse_args(argv)


def config_from_args(args: argparse.Namespace) -> StrategyConfig:
    return replace(
        DEFAULT_CONFIG,
        symbol=args.symbol.strip().upper(),
        timeframe=args.tf.strip(),
        db_path=args.db_path,
        init_cash=args.init_cash,
        fees=args.fees,
        slippage=args.slippage,
    )


def ensure_finite_metric(name: str, value: float) -> float:
    """Return value if finite; otherwise exit with a clear error (no status=ok)."""

    if not math.isfinite(value):
        raise SystemExit(
            f"backtest metric {name!r} is not finite (got {value!r}); "
            "refusing to print status=ok."
        )
    return value


def pd_freq_alias(tf: str) -> str:
    """Map engine tf string to pandas / vectorbt frequency string."""

    mapping = {
        "1m": "1min",
        "3m": "3min",
        "5m": "5min",
        "15m": "15min",
        "30m": "30min",
        "1h": "1h",
        "2h": "2h",
        "4h": "4h",
        "6h": "6h",
        "12h": "12h",
        "1d": "1D",
        "1w": "1W",
    }
    try:
        return mapping[tf]
    except KeyError as exc:
        raise ValueError(f"unsupported tf for freq: {tf}") from exc


def run_with_config(cfg: StrategyConfig) -> None:
    try:
        import vectorbt as vbt
    except ImportError as exc:  # pragma: no cover - exercised when extra missing
        raise SystemExit(
            "vectorbt (and research extras) are required. "
            'Install with: pip install -e ".[research]"'
        ) from exc

    instance = StrategyInstance.from_config(cfg)
    cfg = instance.config

    settings = Settings()
    if cfg.db_path is not None:
        settings = settings.model_copy(update={"db_path": cfg.db_path})

    db_path = settings.db_path
    existed = db_path.exists()
    db = Db(db_path)
    if not existed:
        db.apply_ddl()

    health = db.health()
    if health.get("contract") != "ok":
        raise SystemExit(f"database contract is not ok: {health!r}")

    symbol = cfg.symbol
    tf = cfg.timeframe
    step_ms = tf_ms(tf)

    t_min = db.min_open_time_ms(symbol, tf)
    t_max = db.max_open_time_ms(symbol, tf)
    if t_min is None or t_max is None:
        raise SystemExit(
            f"No candles for {symbol} {tf}. Run backfill + fix first, "
            "then re-run this script."
        )

    window = TimeWindow(t_min, t_max + step_ms)
    candles = db.range_get(symbol, tf, window)
    if len(candles) < 2:
        raise SystemExit("Not enough candles for a backtest.")

    ohlcv = candles_to_ohlcv_dataframe(candles)
    enriched = add_feature_columns(
        ohlcv,
        profile_id=cfg.feature_profile,
        ema_fast=cfg.ema_fast,
        ema_slow=cfg.ema_slow,
    )
    entries, exits = ema_crossover_signals(
        enriched,
        ema_fast=cfg.ema_fast,
        ema_slow=cfg.ema_slow,
        direction_component=cfg.direction_component,
        blockers_component=cfg.blockers_component,
        setup_component=cfg.setup_component,
        trigger_component=cfg.trigger_component,
        exits_component=cfg.exits_component,
        risk_component=cfg.risk_component,
        feature_profile=cfg.feature_profile,
    )

    close = enriched["close"].astype(float)
    if close.isna().any():
        raise SystemExit("close contains NaN — check DB / repair pipeline.")

    ema_f = enriched[f"ema_{cfg.ema_fast}"]
    ema_s = enriched[f"ema_{cfg.ema_slow}"]
    if ema_f.isna().any() or ema_s.isna().any():
        raise SystemExit("EMA columns contain NaN (unexpected for ewm on finite close).")

    freq = pd_freq_alias(tf)
    risk = portfolio_risk_from_config(cfg)
    trade_mgmt = resolve_trade_management_profile(cfg.trade_management_profile)
    pf = vbt.Portfolio.from_signals(
        close,
        entries,
        exits,
        freq=freq,
        init_cash=risk.init_cash,
        fees=risk.fees,
        slippage=risk.slippage,
        **dict(trade_mgmt.portfolio_kwargs),
    )

    sharpe = ensure_finite_metric("sharpe_ratio", float(pf.sharpe_ratio()))
    trades = pf.trades
    pf_val = trades.profit_factor()
    profit_factor = float(pf_val) if hasattr(pf_val, "item") else float(pf_val)
    profit_factor = ensure_finite_metric("profit_factor", profit_factor)

    max_dd = pf.max_drawdown()
    max_dd_f = float(max_dd) if hasattr(max_dd, "item") else float(max_dd)
    max_dd_f = ensure_finite_metric("max_drawdown", max_dd_f)

    print(
        f"family={cfg.family} variant={cfg.variant} "
        f"config_id={instance.config_id} "
        f"symbol={symbol} timeframe={tf} candles={len(candles)}"
    )
    print("vectorbt_portfolio.sharpe_ratio (freq-aware):", sharpe)
    print("vectorbt_portfolio.trades.profit_factor:", profit_factor)
    print("vectorbt_portfolio.max_drawdown:", max_dd_f)
    print("status=ok")


def _load_candles_once(cfg: StrategyConfig) -> tuple[list[Any], Any]:
    """Load candles once and return raw candles and OHLCV dataframe."""

    settings = Settings()
    if cfg.db_path is not None:
        settings = settings.model_copy(update={"db_path": cfg.db_path})

    db_path = settings.db_path
    existed = db_path.exists()
    db = Db(db_path)
    if not existed:
        db.apply_ddl()

    health = db.health()
    if health.get("contract") != "ok":
        raise SystemExit(f"database contract is not ok: {health!r}")

    symbol = cfg.symbol
    tf = cfg.timeframe
    step_ms = tf_ms(tf)

    t_min = db.min_open_time_ms(symbol, tf)
    t_max = db.max_open_time_ms(symbol, tf)
    if t_min is None or t_max is None:
        raise SystemExit(
            f"No candles for {symbol} {tf}. Run backfill + fix first, "
            "then re-run this script."
        )

    window = TimeWindow(t_min, t_max + step_ms)
    candles = db.range_get(symbol, tf, window)
    if len(candles) < 2:
        raise SystemExit("Not enough candles for a backtest.")

    return candles, candles_to_ohlcv_dataframe(candles)


def _run_instance_on_ohlcv(instance: StrategyInstance, ohlcv: Any) -> dict[str, float | str]:
    """Run one strategy instance over shared OHLCV and return key metrics."""

    try:
        import vectorbt as vbt
    except ImportError as exc:  # pragma: no cover - exercised when extra missing
        raise SystemExit(
            "vectorbt (and research extras) are required. "
            'Install with: pip install -e ".[research]"'
        ) from exc

    cfg = instance.config
    enriched = add_feature_columns(
        ohlcv,
        profile_id=cfg.feature_profile,
        ema_fast=cfg.ema_fast,
        ema_slow=cfg.ema_slow,
    )
    entries, exits = ema_crossover_signals(
        enriched,
        ema_fast=cfg.ema_fast,
        ema_slow=cfg.ema_slow,
        direction_component=cfg.direction_component,
        blockers_component=cfg.blockers_component,
        setup_component=cfg.setup_component,
        trigger_component=cfg.trigger_component,
        exits_component=cfg.exits_component,
        risk_component=cfg.risk_component,
        feature_profile=cfg.feature_profile,
    )

    close = enriched["close"].astype(float)
    if close.isna().any():
        raise SystemExit("close contains NaN — check DB / repair pipeline.")

    ema_f = enriched[f"ema_{cfg.ema_fast}"]
    ema_s = enriched[f"ema_{cfg.ema_slow}"]
    if ema_f.isna().any() or ema_s.isna().any():
        raise SystemExit("EMA columns contain NaN (unexpected for ewm on finite close).")

    freq = pd_freq_alias(cfg.timeframe)
    risk = portfolio_risk_from_config(cfg)
    trade_mgmt = resolve_trade_management_profile(cfg.trade_management_profile)
    pf = vbt.Portfolio.from_signals(
        close,
        entries,
        exits,
        freq=freq,
        init_cash=risk.init_cash,
        fees=risk.fees,
        slippage=risk.slippage,
        **dict(trade_mgmt.portfolio_kwargs),
    )

    sharpe = ensure_finite_metric("sharpe_ratio", float(pf.sharpe_ratio()))
    trades = pf.trades
    pf_val = trades.profit_factor()
    profit_factor = float(pf_val) if hasattr(pf_val, "item") else float(pf_val)
    profit_factor = ensure_finite_metric("profit_factor", profit_factor)

    max_dd = pf.max_drawdown()
    max_dd_f = float(max_dd) if hasattr(max_dd, "item") else float(max_dd)
    max_dd_f = ensure_finite_metric("max_drawdown", max_dd_f)

    return {
        "variant": cfg.variant,
        "config_id": instance.config_id,
        "ema_fast": cfg.ema_fast,
        "ema_slow": cfg.ema_slow,
        "trades": int(trades.count()),
        "sharpe": sharpe,
        "profit_factor": profit_factor,
        "max_drawdown": max_dd_f,
    }


def _print_comparison_table(rows: list[dict[str, float | str]]) -> None:
    headers = (
        "variant",
        "config_id",
        "ema_fast",
        "ema_slow",
        "trades",
        "sharpe",
        "profit_factor",
        "max_drawdown",
    )
    rendered: list[dict[str, str]] = []
    for row in rows:
        rendered.append(
            {
                "variant": str(row["variant"]),
                "config_id": str(row["config_id"]),
                "ema_fast": str(row["ema_fast"]),
                "ema_slow": str(row["ema_slow"]),
                "trades": str(row["trades"]),
                "sharpe": f"{float(row['sharpe']):.6f}",
                "profit_factor": f"{float(row['profit_factor']):.6f}",
                "max_drawdown": f"{float(row['max_drawdown']):.6f}",
            }
        )

    widths = {h: len(h) for h in headers}
    for row in rendered:
        for h in headers:
            widths[h] = max(widths[h], len(row[h]))

    separator = "-+-".join("-" * widths[h] for h in headers)
    print(" | ".join(h.ljust(widths[h]) for h in headers))
    print(separator)
    for row in rendered:
        print(" | ".join(row[h].ljust(widths[h]) for h in headers))


def run_manual_variants(base_config: StrategyConfig) -> None:
    variants = build_manual_variants(base_config)
    candles, ohlcv = _load_candles_once(base_config)
    metrics = [_run_instance_on_ohlcv(instance, ohlcv) for instance in variants]

    print(
        f"family={base_config.family} symbol={base_config.symbol} "
        f"timeframe={base_config.timeframe} candles={len(candles)} variants={len(variants)}"
    )
    _print_comparison_table(metrics)
    print("status=ok")


def main() -> None:
    run_manual_variants(config_from_args(parse_args()))


if __name__ == "__main__":
    main()
