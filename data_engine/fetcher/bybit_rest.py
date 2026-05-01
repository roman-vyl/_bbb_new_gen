"""Bybit REST fetcher for Phase 2 historical backfill."""

from __future__ import annotations

from typing import Any

from tenacity import Retrying, retry_if_exception, stop_after_attempt, wait_exponential

from data_engine.contracts import Candle, FetchRequest
from data_engine.contracts.timeframes import bybit_interval, timeframe_ms

BYBIT_CATEGORY = "linear"
BYBIT_KLINE_LIMIT = 200


class BybitHTTPError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def _default_client() -> Any:
    from pybit.unified_trading import HTTP

    return HTTP(testnet=False)


def _is_retryable_exception(exc: BaseException) -> bool:
    status_code = getattr(exc, "status_code", None)
    if status_code == 429:
        return True
    if isinstance(status_code, int) and 500 <= status_code <= 599:
        return True
    return isinstance(exc, (ConnectionError, TimeoutError, OSError))


def _default_retrying(wait: Any | None = None) -> Retrying:
    return Retrying(
        stop=stop_after_attempt(5),
        wait=wait if wait is not None else wait_exponential(min=1, max=16),
        retry=retry_if_exception(_is_retryable_exception),
        reraise=True,
    )


def _ensure_ok(response: dict[str, Any]) -> None:
    ret_code = response.get("retCode", 0)
    if ret_code not in (0, "0"):
        raise BybitHTTPError(
            f"Bybit API error retCode={ret_code}",
            status_code=int(ret_code) if str(ret_code).isdigit() else None,
        )


class BybitREST:
    def __init__(
        self,
        client: Any | None = None,
        *,
        retrying: Retrying | None = None,
        wait: Any | None = None,
    ) -> None:
        self._client = client if client is not None else _default_client()
        self._retrying = retrying if retrying is not None else _default_retrying(wait=wait)

    def fetch_candles(self, request: FetchRequest) -> list[Candle]:
        max_window_ms = timeframe_ms(request.timeframe) * BYBIT_KLINE_LIMIT
        if request.window.end_ms - request.window.start_ms > max_window_ms:
            raise ValueError("fetch request window exceeds Bybit kline limit")

        interval = bybit_interval(request.timeframe)
        def _request_kline() -> dict[str, Any]:
            response = self._client.get_kline(
                category=BYBIT_CATEGORY,
                symbol=request.symbol,
                interval=interval,
                start=request.window.start_ms,
                end=request.window.end_ms - 1,
                limit=BYBIT_KLINE_LIMIT,
            )
            _ensure_ok(response)
            return response

        response = self._retrying(_request_kline)
        rows = response.get("result", {}).get("list", [])
        candles = [
            Candle(
                symbol=request.symbol,
                timeframe=request.timeframe,
                open_time_ms=int(row[0]),
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
                volume=float(row[5]),
            )
            for row in rows
            if request.window.start_ms <= int(row[0]) < request.window.end_ms
        ]
        return sorted(candles, key=lambda candle: candle.open_time_ms)


def fetch_launch_time_ms(symbol: str, client: Any | None = None, retrying: Retrying | None = None) -> int:
    http_client = client if client is not None else _default_client()
    call_retrying = retrying if retrying is not None else _default_retrying()
    def _request_instruments_info() -> dict[str, Any]:
        response = http_client.get_instruments_info(
            category=BYBIT_CATEGORY,
            symbol=symbol,
        )
        _ensure_ok(response)
        return response

    response = call_retrying(_request_instruments_info)
    rows = response.get("result", {}).get("list", [])
    if not rows:
        raise BybitHTTPError(f"Bybit returned no instrument info for {symbol}")
    return int(rows[0]["launchTime"])
