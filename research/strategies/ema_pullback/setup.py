"""Setup context: readiness before the entry trigger (no vectorbt)."""

from __future__ import annotations

import pandas as pd


def setup_long_baseline(df: pd.DataFrame) -> pd.Series:
    """Stage 2: no separate setup layer — extension point only (all True)."""

    return pd.Series(True, index=df.index, dtype=bool)
