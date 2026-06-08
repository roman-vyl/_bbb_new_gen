"""Exit-management catalog placeholder (legacy registry compatibility).

v2 managed exit_management **evaluators** live under
``research.strategies.ema_pullback.execution.managed_components`` — a separate
role-family from setup / blocker / trigger / exit_policy components.

``break_even_stop`` here is deprecated legacy managed-combiner compatibility only (Slice 9).
New product contract: ``mode``, ``phase_rules``, ``stop_management``, ``runtime_exits``.
"""

from __future__ import annotations

BREAK_EVEN_STOP_COMPONENT = "break_even_stop"


def break_even_stop_placeholder() -> dict[str, object]:
    """Registry placeholder — runtime is handled by the exit management combiner."""

    return {}
