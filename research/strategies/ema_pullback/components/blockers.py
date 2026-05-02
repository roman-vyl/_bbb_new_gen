"""Blocker gates: whether an entry may be considered at all (no vectorbt)."""

from __future__ import annotations

import pandas as pd


def blockers_ok_baseline(df: pd.DataFrame) -> pd.Series:
    """Stage 2: no blocking rules — extension point only (all True)."""

    return pd.Series(True, index=df.index, dtype=bool)
