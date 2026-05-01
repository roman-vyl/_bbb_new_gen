"""CLI: DB candles -> features -> signals -> vectorbt -> metrics.

Run from repo root (after ``pip install -e ".[research]"``):

    python research/strategies/ema_atr_directional/run.py
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import replace
from pathlib import Path

# Allow running this file without PYTHONPATH tricks.
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from data_engine.config import Settings
from data_engine.contracts import TimeWindow
from data_engine.engine.time_grid import tf_ms
from data_engine.store import Db

from research.ema_smoke_helpers import candles_to_ohlcv_dataframe
from research.strategies.ema_atr_directional.config import (
    DEFAULT_CONFIG,
    EmaAtrDirectionalConfig,
)
from research.strategies.ema_atr_directional.features import add_ema_columns
from research.strategies.ema_atr_directional.signals import ema_crossover_signals


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="EMA crossover backtest (ema_atr_directional family, Stage 1 skeleton)."
    )
    p.add_argument("--symbol", default=DEFAULT_CONFIG.symbol, help="Symbol in DB")
    p.add_argument("--tf", default=DEFAULT_CONFIG.timeframe, help="Timeframe")
    p.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="Override SQLite path (default: Settings / DATA_ENGINE_DB_PATH)",
    )
    return p.parse_args()


def config_from_args(args: argparse.Namespace) -> EmaAtrDirectionalConfig:
    return replace(
        DEFAULT_CONFIG,
        symbol=args.symbol.strip().upper(),
        timeframe=args.tf.strip(),
        db_path=args.db_path,
    )


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


def run_with_config(cfg: EmaAtrDirectionalConfig) -> None:
    try:
        import vectorbt as vbt
    except ImportError as exc:  # pragma: no cover - exercised when extra missing
        raise SystemExit(
            "vectorbt (and research extras) are required. "
            'Install with: pip install -e ".[research]"'
        ) from exc

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
    enriched = add_ema_columns(
        ohlcv,
        ema_fast=cfg.ema_fast,
        ema_slow=cfg.ema_slow,
    )
    entries, exits = ema_crossover_signals(
        enriched,
        ema_fast=cfg.ema_fast,
        ema_slow=cfg.ema_slow,
    )

    close = enriched["close"].astype(float)
    if close.isna().any():
        raise SystemExit("close contains NaN — check DB / repair pipeline.")

    ema_f = enriched[f"ema_{cfg.ema_fast}"]
    ema_s = enriched[f"ema_{cfg.ema_slow}"]
    if ema_f.isna().any() or ema_s.isna().any():
        raise SystemExit("EMA columns contain NaN (unexpected for ewm on finite close).")

    freq = pd_freq_alias(tf)
    pf = vbt.Portfolio.from_signals(
        close,
        entries,
        exits,
        freq=freq,
        init_cash=cfg.init_cash,
        fees=cfg.fees,
        slippage=cfg.slippage,
    )

    sharpe = float(pf.sharpe_ratio())
    trades = pf.trades
    pf_val = trades.profit_factor()
    profit_factor = float(pf_val) if hasattr(pf_val, "item") else float(pf_val)

    max_dd = pf.max_drawdown()
    max_dd_f = float(max_dd) if hasattr(max_dd, "item") else float(max_dd)

    print(
        f"family={cfg.family} variant={cfg.variant} "
        f"symbol={symbol} tf={tf} candles={len(candles)}"
    )
    print("vectorbt_portfolio.sharpe_ratio (freq-aware):", sharpe)
    print("vectorbt_portfolio.trades.profit_factor:", profit_factor)
    print("vectorbt_portfolio.max_drawdown:", max_dd_f)
    print("status=ok")


def main() -> None:
    run_with_config(config_from_args(parse_args()))


if __name__ == "__main__":
    main()
