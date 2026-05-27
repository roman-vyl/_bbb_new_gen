#!/usr/bin/env python3
"""One-off migration: exit_policy.context -> strategy.contexts + optional context_consumption.

Not invoked by loader/runtime. Usage:
  python scripts/migrate_exit_context_to_strategy_contexts.py path/to/instances.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from research.strategies.ema_pullback.context.policies import EXIT_PROFILE_BY_HTF_STATE_POLICY


def _has_profile_exits(exit_policy: dict[str, Any]) -> bool:
    profiles = exit_policy.get("profiles")
    if not isinstance(profiles, dict):
        return False
    for key in ("aligned", "countertrend", "neutral"):
        group = profiles.get(key)
        if isinstance(group, dict) and group.get("exits"):
            return True
    return False


def migrate_instance(instance: dict[str, Any], *, context_ref: str = "htf") -> dict[str, Any]:
    strategy = instance.get("strategy")
    if not isinstance(strategy, dict):
        return instance
    tm = strategy.get("trade_management")
    if not isinstance(tm, dict):
        return instance
    exit_policy = tm.get("exit_policy")
    if not isinstance(exit_policy, dict):
        return instance
    legacy = exit_policy.pop("context", None)
    if legacy is None:
        return instance
    contexts = strategy.setdefault("contexts", {})
    if not isinstance(contexts, dict):
        contexts = {}
        strategy["contexts"] = contexts
    if context_ref not in contexts:
        contexts[context_ref] = legacy
    if _has_profile_exits(exit_policy):
        exit_policy["context_consumption"] = {
            "context_ref": context_ref,
            "policy": {"policy_id": EXIT_PROFILE_BY_HTF_STATE_POLICY, "params": {}},
        }
    return instance


def migrate_payload(payload: dict[str, Any]) -> dict[str, Any]:
    instances = payload.get("instances")
    if isinstance(instances, list):
        payload["instances"] = [migrate_instance(item) for item in instances]
    return payload


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    path = Path(argv[1])
    data = json.loads(path.read_text(encoding="utf-8"))
    migrated = migrate_payload(data)
    path.write_text(json.dumps(migrated, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"migrated {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
