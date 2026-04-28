"""Typer CLI for Data Engine commands."""

from __future__ import annotations

from pathlib import Path
import time

import typer

from data_engine.config import Settings
from data_engine.contracts import FetchRequest, FixReport, TimeWindow
from data_engine.engine.dim import fix_candles
from data_engine.engine.time_grid import ceil_to_grid, last_closed_open_time_ms, tf_ms
from data_engine.fetcher import BYBIT_KLINE_LIMIT, BybitREST
from data_engine.fetcher.depth_resolver import resolve_launch_time_ms
from data_engine.store import Db

app = typer.Typer(help="Data Engine command line interface")


def _print_status(result: dict) -> None:
    """Print status in stable human-readable format."""

    typer.echo(f"db_path: {result['db_path']}")
    typer.echo(f"schema_version: {result['schema_version']}")
    if result.get("contract") == "ok":
        typer.echo(f"schema_meta: {result['schema_meta']}")
        typer.echo(f"candles: {result['candles']}")
        typer.echo(f"meta: {result['meta']}")
        typer.echo(f"quarantine: {result['quarantine']}")
    typer.echo(f"contract: {result['contract']}")


def _print_backfill_report(result: dict) -> None:
    for key in (
        "symbol",
        "timeframe",
        "market",
        "launch_time_ms",
        "from_ms",
        "to_ms",
        "fetched_rows",
        "written_rows",
        "expected_count",
        "actual_count",
        "status",
    ):
        typer.echo(f"{key}: {result[key]}")
    if result.get("diagnostic"):
        typer.echo(f"diagnostic: {result['diagnostic']}")


def _print_fix_report(report: FixReport) -> None:
    step_ms = tf_ms(report.timeframe)
    typer.echo(f"symbol: {report.symbol}")
    typer.echo(f"timeframe: {report.timeframe}")
    typer.echo(f"from_ms: {report.window.start_ms}")
    typer.echo(f"to_ms: {report.window.end_ms - step_ms}")
    typer.echo(f"gaps_before: {len(report.gaps_before)}")
    typer.echo(f"gaps_after: {len(report.gaps_after)}")
    typer.echo(f"fetched_rows: {report.fetched_rows}")
    typer.echo(f"written_rows: {report.written_rows}")
    typer.echo(f"invalid_ohlc_rows: {report.invalid_ohlc_rows}")
    typer.echo(f"fresh: {'true' if report.fresh else 'false'}")
    typer.echo(f"status: {report.status}")
    if report.diagnostics:
        typer.echo(f"diagnostic: {'; '.join(report.diagnostics)}")


def _make_fetcher() -> BybitREST:
    return BybitREST()


def _resolve_launch_time(db: Db, symbol: str) -> int:
    return resolve_launch_time_ms(db, symbol)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _discover_first_available_open_time_ms(
    *,
    fetcher: BybitREST,
    symbol: str,
    tf: str,
    from_ms: int,
    to_ms: int,
    step_ms: int,
) -> int | None:
    cursor = from_ms
    final_end_ms = to_ms + step_ms
    while cursor < final_end_ms:
        chunk_end_ms = min(cursor + step_ms * BYBIT_KLINE_LIMIT, final_end_ms)
        request = FetchRequest(symbol=symbol, timeframe=tf, window=TimeWindow(cursor, chunk_end_ms))
        rows = fetcher.fetch_candles(request)
        if rows:
            return min(row.open_time_ms for row in rows)
        cursor = chunk_end_ms
    return None


@app.callback()
def main() -> None:
    """Root command group.

    Plain words:
    - command by itself does nothing;
    - real work lives in subcommands like `status`.
    """

    return None


@app.command()
def status(db_path: Path | None = None) -> None:
    """Show current database status.

    Beginner contract:
    - first run creates sqlite file and tables;
    - next runs just read and show real counts;
    - if schema is broken, shows `schema_mismatch`.
    """

    settings = Settings()
    if db_path is not None:
        settings = settings.model_copy(update={"db_path": db_path})

    db_file_existed = settings.db_path.exists()
    db = Db(settings.db_path)
    if not db_file_existed:
        db.apply_ddl()
    result = db.health()
    _print_status(result)


@app.command()
def backfill(
    symbol: str = typer.Option(..., help="Bybit symbol, for example BTCUSDT"),
    tf: str = typer.Option(..., help="Internal timeframe, for example 1h"),
    db_path: Path | None = None,
) -> None:
    """Load historical candles via Bybit REST into the existing Phase 1 schema."""

    symbol = symbol.strip().upper()
    if not symbol:
        raise typer.BadParameter("symbol must not be empty")

    step_ms = tf_ms(tf)
    settings = Settings()
    if db_path is not None:
        settings = settings.model_copy(update={"db_path": db_path})

    db_file_existed = settings.db_path.exists()
    db = Db(settings.db_path)
    if not db_file_existed:
        db.apply_ddl()

    health = db.health()
    if health.get("contract") != "ok":
        _print_backfill_report(
            {
                "symbol": symbol,
                "timeframe": tf,
                "market": "bybit.linear",
                "launch_time_ms": "unknown",
                "from_ms": "unknown",
                "to_ms": "unknown",
                "fetched_rows": 0,
                "written_rows": 0,
                "expected_count": 0,
                "actual_count": 0,
                "status": "error",
                "diagnostic": f"database contract is {health.get('contract')}",
            }
        )
        raise typer.Exit(code=1)

    try:
        result = _run_backfill(db=db, symbol=symbol, tf=tf, step_ms=step_ms)
    except Exception as exc:
        _print_backfill_report(
            {
                "symbol": symbol,
                "timeframe": tf,
                "market": "bybit.linear",
                "launch_time_ms": "unknown",
                "from_ms": "unknown",
                "to_ms": "unknown",
                "fetched_rows": 0,
                "written_rows": 0,
                "expected_count": 0,
                "actual_count": 0,
                "status": "error",
                "diagnostic": str(exc),
            }
        )
        raise typer.Exit(code=1) from exc

    _print_backfill_report(result)
    if result.get("status") == "error":
        raise typer.Exit(code=1)


@app.command()
def fix(
    symbol: str = typer.Option(..., help="Bybit symbol, for example BTCUSDT"),
    tf: str = typer.Option(..., help="Internal timeframe, for example 1h"),
    db_path: Path | None = None,
) -> None:
    symbol = symbol.strip().upper()
    if not symbol:
        raise typer.BadParameter("symbol must not be empty")

    step_ms = tf_ms(tf)
    settings = Settings()
    if db_path is not None:
        settings = settings.model_copy(update={"db_path": db_path})

    db_file_existed = settings.db_path.exists()
    db = Db(settings.db_path)
    if not db_file_existed:
        db.apply_ddl()

    health = db.health()
    if health.get("contract") != "ok":
        typer.echo(f"symbol: {symbol}")
        typer.echo(f"timeframe: {tf}")
        typer.echo("from_ms: unknown")
        typer.echo("to_ms: unknown")
        typer.echo("gaps_before: 0")
        typer.echo("gaps_after: 0")
        typer.echo("fetched_rows: 0")
        typer.echo("written_rows: 0")
        typer.echo("invalid_ohlc_rows: 0")
        typer.echo("fresh: false")
        typer.echo("status: error")
        typer.echo(f"diagnostic: database contract is {health.get('contract')}")
        raise typer.Exit(code=1)

    fetcher = _make_fetcher()
    launch_time_ms = _resolve_launch_time(db, symbol)
    candidate_from_ms = ceil_to_grid(launch_time_ms, tf)
    to_ms = last_closed_open_time_ms(_now_ms(), tf)
    effective_from_ms = db.min_open_time_ms(symbol, tf)
    if effective_from_ms is None:
        discovered = _discover_first_available_open_time_ms(
            fetcher=fetcher,
            symbol=symbol,
            tf=tf,
            from_ms=candidate_from_ms,
            to_ms=to_ms,
            step_ms=step_ms,
        )
        effective_from_ms = discovered if discovered is not None else candidate_from_ms

    window = TimeWindow(effective_from_ms, to_ms + step_ms)
    expected_latest_open_ms = last_closed_open_time_ms(_now_ms(), tf)
    try:
        report = fix_candles(
            symbol=symbol,
            tf=tf,
            window=window,
            db=db,
            fetcher=fetcher,
            expected_latest_open_ms=expected_latest_open_ms,
            max_fetch_candles_per_request=BYBIT_KLINE_LIMIT,
        )
    except Exception as exc:
        report = FixReport(
            symbol=symbol,
            timeframe=tf,
            window=window,
            status="error",
            gaps_before=[],
            gaps_after=[],
            fetched_rows=0,
            written_rows=0,
            invalid_ohlc_rows=0,
            fresh=False,
            diagnostics=[str(exc)],
        )
    _print_fix_report(report)
    if report.status != "ok":
        raise typer.Exit(code=1)


def _run_backfill(db: Db, symbol: str, tf: str, step_ms: int) -> dict:
    launch_time_ms = _resolve_launch_time(db, symbol)
    candidate_from_ms = ceil_to_grid(launch_time_ms, tf)
    to_ms = last_closed_open_time_ms(_now_ms(), tf)
    max_open_time_ms = db.max_open_time_ms(symbol, tf)
    start_ms = max_open_time_ms + step_ms if max_open_time_ms is not None else candidate_from_ms
    effective_from_ms = db.min_open_time_ms(symbol, tf)
    has_any_candles = effective_from_ms is not None

    fetched_rows = 0
    written_rows = 0
    status = "ok"
    diagnostic = ""

    if to_ms >= start_ms:
        fetcher = _make_fetcher()
        cursor_ms = start_ms
        final_end_ms = to_ms + step_ms
        while cursor_ms < final_end_ms:
            chunk_end_ms = min(cursor_ms + step_ms * BYBIT_KLINE_LIMIT, final_end_ms)
            if chunk_end_ms <= cursor_ms:
                raise ValueError("backfill cursor did not advance")

            request = FetchRequest(symbol=symbol, timeframe=tf, window=TimeWindow(cursor_ms, chunk_end_ms))
            candles = fetcher.fetch_candles(request)
            if not candles:
                if has_any_candles:
                    status = "error"
                    diagnostic = f"empty fetch chunk [{cursor_ms}, {chunk_end_ms})"
                    break
                cursor_ms = chunk_end_ms
                continue

            has_any_candles = True
            if effective_from_ms is None:
                effective_from_ms = candles[0].open_time_ms
            fetched_rows += len(candles)
            written_rows += db.upsert(candles)
            cursor_ms = chunk_end_ms

    if not has_any_candles and to_ms >= candidate_from_ms:
        status = "error"
        diagnostic = "no candles found in expected range"

    expected_count = 0
    actual_count = 0
    if status != "error" and effective_from_ms is not None and to_ms >= effective_from_ms:
        check_window = TimeWindow(effective_from_ms, to_ms + step_ms)
        duration_ms = check_window.end_ms - check_window.start_ms
        if duration_ms % step_ms != 0:
            raise ValueError("completion window is not aligned to timeframe")
        expected_count = duration_ms // step_ms
        actual_count = db.count_candles(symbol, tf, check_window)

    if status != "error" and has_any_candles:
        status = "ok" if actual_count == expected_count else "incomplete"

    return {
        "symbol": symbol,
        "timeframe": tf,
        "market": "bybit.linear",
        "launch_time_ms": launch_time_ms,
        "from_ms": effective_from_ms if effective_from_ms is not None else start_ms,
        "to_ms": to_ms,
        "fetched_rows": fetched_rows,
        "written_rows": written_rows,
        "expected_count": expected_count,
        "actual_count": actual_count,
        "status": status,
        "diagnostic": diagnostic,
    }
