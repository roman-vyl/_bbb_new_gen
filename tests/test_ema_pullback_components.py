"""Stage 5 tests: component registry and component-aware config identity."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from research.strategies.ema_pullback.components import (
    COMPONENT_REGISTRY,
    DEFAULT_BLOCKERS_COMPONENT,
    DEFAULT_DIRECTION_COMPONENT,
    DEFAULT_EXITS_COMPONENT,
    DEFAULT_RISK_COMPONENT,
    DEFAULT_SETUP_COMPONENT,
    DEFAULT_TRIGGER_COMPONENT,
    REQUIRED_COMPONENT_ROLES,
    resolve_component,
)
from research.strategies.ema_pullback.config import DEFAULT_CONFIG, strategy_config_id
from research.strategies.ema_pullback.variants import build_manual_variants


def test_registry_contains_required_roles() -> None:
    assert set(REQUIRED_COMPONENT_ROLES).issubset(COMPONENT_REGISTRY.keys())


def test_each_required_role_has_baseline_component() -> None:
    expected_defaults = {
        "direction": DEFAULT_DIRECTION_COMPONENT,
        "blockers": DEFAULT_BLOCKERS_COMPONENT,
        "setup": DEFAULT_SETUP_COMPONENT,
        "trigger": DEFAULT_TRIGGER_COMPONENT,
        "exits": DEFAULT_EXITS_COMPONENT,
        "risk": DEFAULT_RISK_COMPONENT,
    }
    for role, component_id in expected_defaults.items():
        assert component_id in COMPONENT_REGISTRY[role]


def test_resolve_component_returns_definition_for_known_id() -> None:
    definition = resolve_component("trigger", DEFAULT_TRIGGER_COMPONENT)
    assert definition.role == "trigger"
    assert definition.component_id == DEFAULT_TRIGGER_COMPONENT
    assert callable(definition.func)


def test_resolve_component_fails_for_unknown_role() -> None:
    with pytest.raises(ValueError, match="unknown component role"):
        resolve_component("unknown_role", "anything")


def test_resolve_component_fails_for_unknown_component_id() -> None:
    with pytest.raises(ValueError, match="unknown component_id"):
        resolve_component("trigger", "does_not_exist")


def test_manual_variants_reference_existing_components() -> None:
    for instance in build_manual_variants():
        cfg = instance.config
        resolve_component("direction", cfg.direction_component)
        resolve_component("blockers", cfg.blockers_component)
        resolve_component("setup", cfg.setup_component)
        resolve_component("trigger", cfg.trigger_component)
        resolve_component("exits", cfg.exits_component)
        resolve_component("risk", cfg.risk_component)


def test_changing_component_id_changes_config_id() -> None:
    baseline_id = strategy_config_id(DEFAULT_CONFIG)
    changed = replace(DEFAULT_CONFIG, trigger_component="custom_trigger")
    changed_id = strategy_config_id(changed)
    assert changed_id != baseline_id


def test_db_path_does_not_change_config_id_with_components() -> None:
    a = replace(DEFAULT_CONFIG, db_path=Path("alpha.sqlite"))
    b = replace(DEFAULT_CONFIG, db_path=Path("beta.sqlite"))
    assert strategy_config_id(a) == strategy_config_id(b)
