"""Exit-management components (stateful; configured under trade_management.exit_management).

``break_even_stop`` is deprecated legacy managed-combiner compatibility only (Slice 9).
New product contract: ``mode``, ``phase_rules``, ``stop_management``, ``runtime_exits``.
"""

from __future__ import annotations

BREAK_EVEN_STOP_COMPONENT = "break_even_stop"


def break_even_stop_placeholder() -> dict[str, object]:
    """Registry placeholder — runtime is handled by the exit management combiner."""

    return {}
