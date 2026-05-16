"""Read-only market data adapter over Data Engine ``Db.range_get``."""

from __future__ import annotations

from pathlib import Path

from data_engine.config import Settings
from data_engine.contracts import Candle, TimeWindow, timeframe_ms, validate_timeframe
from data_engine.store.db import Db

from research_api.contracts.chart import ChartBar, ChartMarketBundle, IndicatorPoint
from research_api.services.indicators import compute_chart_overlay_ema
from research_api.services.market_params import MarketParamError, normalize_symbol, parse_time_range_ms


class MarketDataNotFoundError(FileNotFoundError):
    """SQLite database file is missing."""


def candle_to_chart_bar(candle: Candle) -> ChartBar:
    return ChartBar(
        time=int(candle.open_time_ms // 1000),
        open=float(candle.open),
        high=float(candle.high),
        low=float(candle.low),
        close=float(candle.close),
        volume=float(candle.volume),
    )


def _open_db(db_path: Path | None = None) -> Db:
    path = db_path if db_path is not None else Settings().db_path
    if not path.is_file():
        raise MarketDataNotFoundError(f"market database not found: {path}")
    return Db(path)


def fetch_chart_bars(
    *,
    symbol: str,
    timeframe: str,
    from_ms: int,
    to_ms: int,
    db_path: Path | None = None,
) -> list[ChartBar]:
    """Load candles for ``[from_ms, to_ms)`` using Data Engine storage."""

    sym = normalize_symbol(symbol)
    tf = validate_timeframe(timeframe.strip())
    start_ms, end_ms = parse_time_range_ms(from_ms=from_ms, to_ms=to_ms)

    db = _open_db(db_path)
    window = TimeWindow(start_ms, end_ms)
    candles = db.range_get(sym, tf, window)
    return [candle_to_chart_bar(c) for c in candles]


def fetch_chart_market_bundle(
    *,
    symbol: str,
    timeframe: str,
    from_ms: int,
    to_ms: int,
    ema_period: int,
    db_path: Path | None = None,
) -> ChartMarketBundle:
    """One ``range_get`` pass: OHLC bars + chart overlay EMA for the same window."""

    if ema_period < 1:
        raise ValueError("ema_period must be >= 1")
    bars = fetch_chart_bars(
        symbol=symbol,
        timeframe=timeframe,
        from_ms=from_ms,
        to_ms=to_ms,
        db_path=db_path,
    )
    ema = compute_chart_overlay_ema(bars, period=ema_period)
    return ChartMarketBundle(candles=bars, ema=ema)


def fetch_chart_overlay_ema(
    *,
    symbol: str,
    timeframe: str,
    period: int,
    from_ms: int,
    to_ms: int,
    db_path: Path | None = None,
) -> list[IndicatorPoint]:
    """Load OHLC window from Data Engine, then compute chart overlay EMA in-process.

    Prefer ``fetch_chart_market_bundle`` when both candles and EMA are needed (single DB read).
    See ``compute_chart_overlay_ema`` for semantics and warmup limitations.
    """

    return fetch_chart_market_bundle(
        symbol=symbol,
        timeframe=timeframe,
        from_ms=from_ms,
        to_ms=to_ms,
        ema_period=period,
        db_path=db_path,
    ).ema


# Back-compat alias for internal/tests naming.
fetch_ema_points = fetch_chart_overlay_ema


def exclusive_end_for_report_to(
    *,
    to_open_time_ms: int,
    timeframe: str,
) -> int:
    """Extend report ``data_range.to_open_time_ms`` for half-open ``range_get``."""

    return int(to_open_time_ms) + timeframe_ms(validate_timeframe(timeframe))


def resolve_exclusive_to_ms(
    *,
    to_ms: int | None,
    to_open_time_ms: int | None,
    timeframe: str,
) -> int:
    """Resolve half-open window end: explicit ``to`` or report ``to_open_time_ms`` + bar."""

    if to_ms is not None and to_open_time_ms is not None:
        raise MarketParamError("provide either to or to_open_time_ms, not both")
    if to_ms is not None:
        return int(to_ms)
    if to_open_time_ms is not None:
        return exclusive_end_for_report_to(to_open_time_ms=to_open_time_ms, timeframe=timeframe)
    raise MarketParamError("either to or to_open_time_ms is required")
