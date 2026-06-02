"""Exit-management components (stateful; configured under trade_management.exit_management)."""

from __future__ import annotations

BREAK_EVEN_STOP_COMPONENT = "break_even_stop"


def break_even_stop_placeholder() -> dict[str, object]:
    """Registry placeholder — runtime is handled by the exit management combiner."""

    return {}
