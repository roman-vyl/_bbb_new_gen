"""``/api/research/runs`` endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from research_api.contracts.runs import RunReport, RunSummary
from research_api.services.results_reader import (
    ResultsNotFoundError,
    UnsupportedSchemaVersionError,
    list_run_summaries,
    load_latest_run_report,
    load_run_report,
)
from research_api.services.run_id import InvalidRunIdError

router = APIRouter(prefix="/api/research", tags=["research"])


def _http_from_reader(exc: Exception) -> HTTPException:
    if isinstance(exc, InvalidRunIdError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, ResultsNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, UnsupportedSchemaVersionError):
        return HTTPException(status_code=422, detail=str(exc))
    if isinstance(exc, (json.JSONDecodeError, KeyError, TypeError, ValidationError)):
        return HTTPException(status_code=500, detail=f"Invalid run artifact: {exc}")
    return HTTPException(status_code=500, detail=str(exc))


@router.get("/runs", response_model=list[RunSummary])
def get_runs() -> list[RunSummary]:
    try:
        return list_run_summaries()
    except Exception as exc:
        raise _http_from_reader(exc) from exc


@router.get("/runs/latest", response_model=RunReport)
def get_latest_run() -> RunReport:
    try:
        return load_latest_run_report()
    except Exception as exc:
        raise _http_from_reader(exc) from exc


@router.get("/runs/{run_id}", response_model=RunReport)
def get_run(run_id: str) -> RunReport:
    try:
        return load_run_report(run_id=run_id)
    except Exception as exc:
        raise _http_from_reader(exc) from exc
