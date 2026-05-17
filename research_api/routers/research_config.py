"""``/api/research/component-catalog`` and config draft endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from research_api.contracts.catalog import ComponentCatalog
from research_api.contracts.config import (
    SaveConfigRequest,
    SaveConfigResult,
    SerializeResult,
    StrategyConfigDraft,
    ValidationResult,
)
from research_api.services.component_catalog import get_component_catalog
from research_api.services.config_service import save_draft, serialize_draft, validate_draft

router = APIRouter(prefix="/api/research", tags=["research-config"])


@router.get("/component-catalog", response_model=ComponentCatalog)
def component_catalog(family: str = Query(default="ema_pullback")) -> ComponentCatalog:
    try:
        return get_component_catalog(family=family)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/config/validate", response_model=ValidationResult)
def validate_config(draft: StrategyConfigDraft) -> ValidationResult:
    return validate_draft(draft)


@router.post("/config/serialize", response_model=SerializeResult)
def serialize_config(
    draft: StrategyConfigDraft,
    format: str = Query(default="json", alias="format"),
) -> SerializeResult:
    fmt = format.lower()
    if fmt not in {"json", "yaml"}:
        raise HTTPException(status_code=400, detail="format must be json or yaml")
    return serialize_draft(draft, fmt=fmt)


@router.post("/config/save", response_model=SaveConfigResult)
def save_config(body: SaveConfigRequest) -> SaveConfigResult:
    return save_draft(body.draft)
