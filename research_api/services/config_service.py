"""Draft config validate / serialize / save — delegates to research config_loader."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from research.experiments.config_loader import ConfigValidationError, load_strategy_config
from research.strategies.ema_pullback.instance_loader import EmaPullbackInstanceValidationError

from research_api.contracts.config import (
    SaveConfigResult,
    SerializeResult,
    StrategyConfigDraft,
    ValidationErrorItem,
    ValidationResult,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_CONFIGS_ROOT = _REPO_ROOT / "research" / "experiments" / "configs"
_PATH_RE = re.compile(
    r"^(?P<prefix>(?:instances\[\d+\]|blockers\[\d+\]|exits\[\d+\]|strategy|market|execution|experiment_id|family|schema_version)[^\s]*)?"
)


def draft_to_canonical_payload(draft: StrategyConfigDraft) -> dict[str, Any]:
    execution: dict[str, Any] = {}
    if draft.execution.init_cash is not None:
        execution["init_cash"] = draft.execution.init_cash
    if draft.execution.fees is not None:
        execution["fees"] = draft.execution.fees
    if draft.execution.slippage is not None:
        execution["slippage"] = draft.execution.slippage

    return {
        "schema_version": draft.config_version,
        "experiment_id": draft.experiment_id.strip(),
        "family": draft.family.strip(),
        "execution": execution,
        "instances": draft.instances,
    }


def _parse_validation_message(message: str) -> ValidationErrorItem:
    match = _PATH_RE.match(message)
    if match and match.group("prefix"):
        prefix = match.group("prefix")
        rest = message[len(prefix) :].lstrip(" .:—-")
        return ValidationErrorItem(path=prefix, message=rest or message)
    return ValidationErrorItem(path="", message=message)


def validate_draft(draft: StrategyConfigDraft) -> ValidationResult:
    try:
        load_strategy_config(draft_to_canonical_payload(draft), source_file="<draft>")
        return ValidationResult(ok=True)
    except (ConfigValidationError, EmaPullbackInstanceValidationError) as exc:
        return ValidationResult(ok=False, errors=[_parse_validation_message(str(exc))])


def _serialize_format(fmt: str) -> str:
    return "yaml" if fmt.lower() == "yaml" else "json"


def serialize_draft(draft: StrategyConfigDraft, *, fmt: str = "json") -> SerializeResult:
    out_fmt = _serialize_format(fmt)
    validation = validate_draft(draft)
    if not validation.ok:
        return SerializeResult(ok=False, format=out_fmt, content="", errors=validation.errors)

    payload = draft_to_canonical_payload(draft)
    if out_fmt == "yaml":
        try:
            import yaml  # type: ignore[import-untyped]
        except ImportError:
            return SerializeResult(
                ok=False,
                format="yaml",
                content="",
                errors=[
                    ValidationErrorItem(
                        path="",
                        message="YAML preview requires PyYAML (pip install -e \".[research]\")",
                    )
                ],
            )
        content = yaml.safe_dump(payload, sort_keys=False, allow_unicode=True)
        return SerializeResult(ok=True, format="yaml", content=content)

    content = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    return SerializeResult(ok=True, format="json", content=content)


def _safe_experiment_filename(experiment_id: str) -> str:
    cleaned = re.sub(r"[^\w.-]+", "_", experiment_id.strip())
    if not cleaned:
        raise ConfigValidationError("experiment_id must be a non-empty string")
    return cleaned


def save_draft(draft: StrategyConfigDraft) -> SaveConfigResult:
    validation = validate_draft(draft)
    if not validation.ok:
        return SaveConfigResult(ok=False, errors=validation.errors)

    family = draft.family.strip()
    filename = f"{_safe_experiment_filename(draft.experiment_id)}.json"
    target_dir = _CONFIGS_ROOT / family
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / filename

    payload = draft_to_canonical_payload(draft)
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    rel = f"research/experiments/configs/{family}/{filename}"
    return SaveConfigResult(ok=True, path=rel)
