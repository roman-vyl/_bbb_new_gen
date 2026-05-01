"""Research guardrails for staged architecture boundaries."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAMILY = ROOT / "research" / "strategies" / "ema_pullback"


def test_ema_pullback_has_no_forbidden_stage_files() -> None:
    assert not (FAMILY / "registry.py").exists()


def test_ema_pullback_python_has_no_registry_pattern() -> None:
    registry_re = re.compile(r"\w+_REGISTRY\b")
    offenders: list[str] = []
    for path in sorted(FAMILY.glob("*.py")):
        text = path.read_text(encoding="utf-8")
        matches = set(registry_re.findall(text))
        allowed = {"COMPONENT_REGISTRY"} if path.name == "components.py" else set()
        unexpected = sorted(matches - allowed)
        if unexpected:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == [], f"unexpected *_REGISTRY in family: {offenders}"


def test_no_research_common_framework_dir() -> None:
    assert not (ROOT / "research" / "common").exists()
