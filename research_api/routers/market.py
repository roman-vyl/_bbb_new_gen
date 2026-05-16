"""``/api/market`` endpoints — candles and indicators."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from research_api.contracts.chart import ChartBar, IndicatorPoint
from research_api.services.market_params import MarketParamError
from research_api.services.market_reader import MarketDataNotFoundError, fetch_chart_bars, fetch_ema_points

router = APIRouter(prefix="/api/market", tags=["market"])


def _http_from_market(exc: Exception) -> HTTPException:
    if isinstance(exc, MarketDataNotFoundError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, MarketParamError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


@router.get("/candles", response_model=list[ChartBar])
def get_candles(
    symbol: str = Query(..., min_length=2, max_length=32),
    timeframe: str = Query(..., min_length=2, max_length=8),
    from_ms: int = Query(..., alias="from", ge=0),
    to_ms: int = Query(..., alias="to", ge=1),
) -> list[ChartBar]:
    try:
        return fetch_chart_bars(
            symbol=symbol,
            timeframe=timeframe,
            from_ms=from_ms,
            to_ms=to_ms,
        )
    except Exception as exc:
        raise _http_from_market(exc) from exc


@router.get("/indicators/ema", response_model=list[IndicatorPoint])
def get_ema(
    symbol: str = Query(..., min_length=2, max_length=32),
    timeframe: str = Query(..., min_length=2, max_length=8),
    period: int = Query(..., ge=1, le=5000),
    from_ms: int = Query(..., alias="from", ge=0),
    to_ms: int = Query(..., alias="to", ge=1),
) -> list[IndicatorPoint]:
    try:
        return fetch_ema_points(
            symbol=symbol,
            timeframe=timeframe,
            period=period,
            from_ms=from_ms,
            to_ms=to_ms,
        )
    except Exception as exc:
        raise _http_from_market(exc) from exc
