"""``/api/market`` endpoints — candles and indicators."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from research_api.contracts.chart import ChartBar, ChartMarketBundle, IndicatorPoint
from research_api.services.market_params import MarketParamError
from research_api.services.market_reader import (
    MarketDataNotFoundError,
    fetch_chart_bars,
    fetch_chart_market_bundle,
    fetch_ema_points,
    resolve_exclusive_to_ms,
)

router = APIRouter(prefix="/api/market", tags=["market"])


def _http_from_market(exc: Exception) -> HTTPException:
    if isinstance(exc, MarketDataNotFoundError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, MarketParamError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


def _range_end_ms(
    *,
    timeframe: str,
    to_ms: int | None,
    to_open_time_ms: int | None,
) -> int:
    return resolve_exclusive_to_ms(
        to_ms=to_ms,
        to_open_time_ms=to_open_time_ms,
        timeframe=timeframe,
    )


@router.get(
    "/chart-bundle",
    response_model=ChartMarketBundle,
    summary="OHLC + chart overlay EMA (single DB read)",
    description=(
        "Preferred Workbench chart payload: one SQLite ``range_get`` for candles, "
        "then in-process chart overlay EMA. Avoid calling ``/candles`` and "
        "``/indicators/ema`` separately for the same window."
    ),
)
def get_chart_bundle(
    symbol: str = Query(..., min_length=2, max_length=32),
    timeframe: str = Query(..., min_length=2, max_length=8),
    from_ms: int = Query(..., alias="from", ge=0),
    to_ms: int | None = Query(None, alias="to", ge=1),
    to_open_time_ms: int | None = Query(None, ge=0),
    ema_period: int = Query(..., ge=1, le=5000),
) -> ChartMarketBundle:
    try:
        end_ms = _range_end_ms(timeframe=timeframe, to_ms=to_ms, to_open_time_ms=to_open_time_ms)
        return fetch_chart_market_bundle(
            symbol=symbol,
            timeframe=timeframe,
            from_ms=from_ms,
            to_ms=end_ms,
            ema_period=ema_period,
        )
    except Exception as exc:
        raise _http_from_market(exc) from exc


@router.get("/candles", response_model=list[ChartBar])
def get_candles(
    symbol: str = Query(..., min_length=2, max_length=32),
    timeframe: str = Query(..., min_length=2, max_length=8),
    from_ms: int = Query(..., alias="from", ge=0),
    to_ms: int | None = Query(None, alias="to", ge=1),
    to_open_time_ms: int | None = Query(None, ge=0),
) -> list[ChartBar]:
    try:
        end_ms = _range_end_ms(timeframe=timeframe, to_ms=to_ms, to_open_time_ms=to_open_time_ms)
        return fetch_chart_bars(
            symbol=symbol,
            timeframe=timeframe,
            from_ms=from_ms,
            to_ms=end_ms,
        )
    except Exception as exc:
        raise _http_from_market(exc) from exc


@router.get(
    "/indicators/ema",
    response_model=list[IndicatorPoint],
    summary="Chart overlay EMA (view layer)",
    description=(
        "EMA for Workbench chart visualization only. "
        "Not a research strategy feature column and not Data Engine indicator_values. "
        "Computed from closes in the requested window; narrowing `from` without warmup "
        "bars biases EMA(period)."
    ),
)
def get_ema(
    symbol: str = Query(..., min_length=2, max_length=32),
    timeframe: str = Query(..., min_length=2, max_length=8),
    period: int = Query(..., ge=1, le=5000),
    from_ms: int = Query(..., alias="from", ge=0),
    to_ms: int | None = Query(None, alias="to", ge=1),
    to_open_time_ms: int | None = Query(None, ge=0),
) -> list[IndicatorPoint]:
    try:
        end_ms = _range_end_ms(timeframe=timeframe, to_ms=to_ms, to_open_time_ms=to_open_time_ms)
        return fetch_ema_points(
            symbol=symbol,
            timeframe=timeframe,
            period=period,
            from_ms=from_ms,
            to_ms=end_ms,
        )
    except Exception as exc:
        raise _http_from_market(exc) from exc
