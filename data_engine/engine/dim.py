"""Candle-only DIM repair for Phase 3."""

from __future__ import annotations

import time

from data_engine.contracts import FetchRequest, FixReport, TimeWindow
from data_engine.contracts.gap import Gap
from data_engine.engine.gaps import find_gaps_linear
from data_engine.engine.time_grid import tf_ms


def fix_candles(
    symbol: str,
    tf: str,
    window: TimeWindow,
    db,
    fetcher,
    expected_latest_open_ms: int | None = None,
    max_fetch_candles_per_request: int = 200,
) -> FixReport:
    diagnostics: list[str] = []
    fetched_rows = 0
    written_rows = 0
    hard_error = False
    has_unexpected_rows = False

    try:
        step_ms = tf_ms(tf)
    except Exception as exc:
        return FixReport(
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
            diagnostics=[f"invalid timeframe: {exc}"],
        )

    if window.start_ms % step_ms != 0 or window.end_ms % step_ms != 0 or window.start_ms >= window.end_ms:
        return FixReport(
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
            diagnostics=["window is not aligned to timeframe grid"],
        )
    if max_fetch_candles_per_request <= 0:
        return FixReport(
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
            diagnostics=["max_fetch_candles_per_request must be positive"],
        )

    candles_before = db.range_get(symbol, tf, window)
    gaps_before = find_gaps_linear([row.open_time_ms for row in candles_before], step_ms, window)

    for gap in gaps_before:
        for fetch_window in iter_fetch_windows(gap, step_ms, max_fetch_candles_per_request):
            request = FetchRequest(symbol=symbol, timeframe=tf, window=fetch_window)
            try:
                rows = fetcher.fetch_candles(request)
            except Exception as exc:
                hard_error = True
                diagnostics.append(
                    f"fetch failed for window [{fetch_window.start_ms}, {fetch_window.end_ms}) in gap [{gap.start_ms}, {gap.end_ms}): {exc}"
                )
                _put_quarantine_safe(
                    db=db,
                    symbol=symbol,
                    tf=tf,
                    start_ms=fetch_window.start_ms,
                    end_ms=fetch_window.end_ms,
                    reason="fetch_error",
                    payload=str(exc),
                )
                continue

            filtered = [
                row
                for row in rows
                if row.symbol == symbol
                and row.timeframe == tf
                and fetch_window.start_ms <= row.open_time_ms < fetch_window.end_ms
            ]
            if len(filtered) != len(rows):
                has_unexpected_rows = True
                diagnostics.append(
                    f"filtered unexpected rows for window [{fetch_window.start_ms}, {fetch_window.end_ms})"
                )
                _put_quarantine_safe(
                    db=db,
                    symbol=symbol,
                    tf=tf,
                    start_ms=fetch_window.start_ms,
                    end_ms=fetch_window.end_ms,
                    reason="unexpected_rows",
                    payload=f"fetched={len(rows)}, accepted={len(filtered)}",
                )

            fetched_rows += len(rows)
            written_rows += db.upsert(filtered)

    candles_after = db.range_get(symbol, tf, window)
    gaps_after = find_gaps_linear([row.open_time_ms for row in candles_after], step_ms, window)
    invalid_ohlc_rows = _count_invalid_ohlc(candles_after)
    fresh = True
    if expected_latest_open_ms is not None:
        fresh = any(
            row.open_time_ms == expected_latest_open_ms and window.start_ms <= row.open_time_ms < window.end_ms
            for row in candles_after
        )
        if not fresh:
            diagnostics.append(f"missing expected latest closed candle: {expected_latest_open_ms}")

    if hard_error:
        status = "error"
    elif invalid_ohlc_rows > 0:
        status = "invalid"
    elif gaps_after or not fresh or has_unexpected_rows:
        status = "incomplete"
    else:
        status = "ok"

    if gaps_after:
        diagnostics.append(f"postflight gaps remain: {len(gaps_after)}")
        _put_quarantine_safe(
            db=db,
            symbol=symbol,
            tf=tf,
            start_ms=window.start_ms,
            end_ms=window.end_ms,
            reason="postflight_gaps",
            payload=f"gaps_after={len(gaps_after)}",
        )

    return FixReport(
        symbol=symbol,
        timeframe=tf,
        window=window,
        status=status,
        gaps_before=gaps_before,
        gaps_after=gaps_after,
        fetched_rows=fetched_rows,
        written_rows=written_rows,
        invalid_ohlc_rows=invalid_ohlc_rows,
        fresh=fresh,
        diagnostics=diagnostics,
    )


def _count_invalid_ohlc(rows: list) -> int:
    invalid = 0
    for row in rows:
        if row.open <= 0 or row.high <= 0 or row.low <= 0 or row.close <= 0:
            invalid += 1
            continue
        if row.volume < 0:
            invalid += 1
            continue
        if row.high < row.low:
            invalid += 1
            continue
        if row.high < row.open or row.high < row.close:
            invalid += 1
            continue
        if row.low > row.open or row.low > row.close:
            invalid += 1
    return invalid


def _put_quarantine_safe(
    *,
    db,
    symbol: str,
    tf: str,
    start_ms: int,
    end_ms: int,
    reason: str,
    payload: str,
) -> None:
    try:
        db.put_quarantine(
            symbol=symbol,
            timeframe=tf,
            start_ms=start_ms,
            end_ms=end_ms,
            reason=reason,
            payload=payload,
            created_at_ms=int(time.time() * 1000),
        )
    except Exception:
        return


def iter_fetch_windows(gap: Gap, step_ms: int, max_candles: int) -> list[TimeWindow]:
    if step_ms <= 0:
        raise ValueError("step_ms must be positive")
    if max_candles <= 0:
        raise ValueError("max_candles must be positive")
    if gap.start_ms % step_ms != 0 or gap.end_ms % step_ms != 0:
        raise ValueError("gap must be aligned to step_ms")
    if gap.start_ms >= gap.end_ms:
        return []

    max_window_ms = step_ms * max_candles
    windows: list[TimeWindow] = []
    cursor = gap.start_ms
    while cursor < gap.end_ms:
        end_ms = min(cursor + max_window_ms, gap.end_ms)
        windows.append(TimeWindow(cursor, end_ms))
        cursor = end_ms
    return windows
