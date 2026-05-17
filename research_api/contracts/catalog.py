"""Component catalog contracts for Strategy Composer."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ParamFieldSchema(BaseModel):
    """JSON-Schema-like field descriptor for Composer forms."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["integer", "number", "string", "boolean"]
    label: str | None = None
    min: float | None = None
    max: float | None = None
    enum: list[str] | None = None
    default: Any = None


class ComponentSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    component_id: str
    role: Literal["direction", "setup", "trigger", "blockers", "exits", "risk"]
    label: str
    description: str | None = None
    params_schema: dict[str, ParamFieldSchema] = Field(default_factory=dict)
    list_slot: bool = False


class ComposerSectionSchema(BaseModel):
    """UI section metadata (direction, blockers, …)."""

    model_config = ConfigDict(extra="forbid")

    section_id: str
    label: str
    role: str | None = None
    list_slot: bool = False


class ComponentCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    family: str
    schema_version: int = 1
    sections: list[ComposerSectionSchema]
    components: list[ComponentSchema]
