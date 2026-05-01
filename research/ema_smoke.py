"""Phase 4 smoke: SQLite candles -> pandas EMA -> vectorbt -> metrics.

Run from repo root (after ``pip install -e ".[research]"``):

    python research/ema_smoke.py

Uses ``DATA_ENGINE_DB_PATH`` like the rest of the engine (see ``Settings``).

Warmup: EMA uses ``pd.ewm(adjust=False)``; values are finite for all rows.
Crossover signals use ``shift(1)``; the first row never fires an entry/exit.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow ``python research/ema_smoke.py`` without PYTHONPATH tricks.
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from data_engine.config import Settings
from data_engine.contracts import TimeWindow
from data_engine.engine.time_grid import tf_ms
from data_engine.store import Db

from research.ema_smoke_helpers import (
    add_ema_columns,
    candles_to_ohlcv_dataframe,
    ema_crossover_signals,
)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="EMA20/EMA50 crossover smoke backtest on DB candles (vectorbt)."
    )
    p.add_argument("--symbol", default="BTCUSDT", help="Symbol in DB (default BTCUSDT)")
    p.add_argument("--tf", default="1h", help="Timeframe (default 1h)")
    p.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="Override SQLite path (default: Settings / DATA_ENGINE_DB_PATH)",
    )
    return p.parse_args()


def main() -> None:
    try:
        import vectorbt as vbt
    except ImportError as exc:  # pragma: no cover - exercised when extra missing
        raise SystemExit(
            "vectorbt (and research extras) are required. "
            'Install with: pip install -e ".[research]"'
        ) from exc

    args = _parse_args()
    settings = Settings()
    if args.db_path is not None:
        settings = settings.model_copy(update={"db_path": args.db_path})

    db_path = settings.db_path
    existed = db_path.exists()
    db = Db(db_path)
    if not existed:
        db.apply_ddl()

    health = db.health()
    if health.get("contract") != "ok":
        raise SystemExit(f"database contract is not ok: {health!r}")

    symbol = args.symbol.strip().upper()
    tf = args.tf.strip()
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
    enriched = add_ema_columns(ohlcv, fast=20, slow=50)
    entries, exits = ema_crossover_signals(enriched, "ema_20", "ema_50")

    close = enriched["close"].astype(float)
    if close.isna().any():
        raise SystemExit("close contains NaN — check DB / repair pipeline.")

    ema_fast = enriched["ema_20"]
    ema_slow = enriched["ema_50"]
    if ema_fast.isna().any() or ema_slow.isna().any():
        raise SystemExit("EMA columns contain NaN (unexpected for ewm on finite close).")

    # vectorbt expects aligned Series; freq improves annualized Sharpe.
    freq = pd_freq_alias(tf)
    pf = vbt.Portfolio.from_signals(
        close,
        entries,
        exits,
        freq=freq,
    )

    sharpe = float(pf.sharpe_ratio())
    # profit factor: gross wins / gross losses; vectorbt exposes on trades
    trades = pf.trades
    pf_val = trades.profit_factor()
    profit_factor = float(pf_val) if hasattr(pf_val, "item") else float(pf_val)

    max_dd = pf.max_drawdown()
    max_dd_f = float(max_dd) if hasattr(max_dd, "item") else float(max_dd)

    print(f"symbol={symbol} tf={tf} candles={len(candles)}")
    print("vectorbt_portfolio.sharpe_ratio (freq-aware):", sharpe)
    print("vectorbt_portfolio.trades.profit_factor:", profit_factor)
    print("vectorbt_portfolio.max_drawdown:", max_dd_f)


def pd_freq_alias(tf: str) -> str:
    """Map engine tf string to pandas / vectorbt frequency string."""

    # pandas offset aliases: https://pandas.pydata.org/docs/user_guide/timeseries.html
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


if __name__ == "__main__":
    main()
