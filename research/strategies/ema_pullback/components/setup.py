"""Setup context: readiness before the entry trigger (no vectorbt)."""

from __future__ import annotations

import pandas as pd


def setup_long_baseline(df: pd.DataFrame, **_: object) -> pd.Series:
    """Stage 2: no separate setup layer — extension point only (all True)."""

    return pd.Series(True, index=df.index, dtype=bool)


def pullback_to_entry_anchor(
    df: pd.DataFrame,
    *,
    entry_anchor_col: str,
    window: int = 3,
    **_: object,
) -> pd.Series:
    """Recent pullback detector: low touched/undercut entry anchor in rolling window."""

    touched = df["low"] <= df[entry_anchor_col]
    return touched.rolling(window=window, min_periods=1).max().astype(bool)


def pullback_to_anchor(df: pd.DataFrame, anchor_col: str, lookback: int) -> pd.Series:
    """True when low touched anchor within last ``lookback`` candles."""

    if lookback <= 0:
        raise ValueError("lookback must be > 0")
    touched = df["low"] <= df[anchor_col]
    return touched.rolling(window=lookback, min_periods=1).max().astype(bool)
