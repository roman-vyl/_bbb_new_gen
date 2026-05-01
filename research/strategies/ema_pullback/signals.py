"""Composer: combine pipeline stages into ``final_entry`` / ``final_exit``.

This module is the **composition layer** — it wires explicit boolean stages.
It is not another ad-hoc pile of conditions. There is no registry and no
dynamic selection of components by name.
"""

from __future__ import annotations

import pandas as pd

from research.strategies.ema_pullback.blockers import blockers_ok_baseline
from research.strategies.ema_pullback.direction import long_allowed_baseline
from research.strategies.ema_pullback.exits import ema_bearish_cross_exit
from research.strategies.ema_pullback.setup import setup_long_baseline
from research.strategies.ema_pullback.triggers import ema_bullish_cross_entry


def compose_final_signals(
    *,
    long_allowed: pd.Series,
    blockers_ok: pd.Series,
    setup_long: pd.Series,
    trigger_long: pd.Series,
    exit_signal: pd.Series,
) -> tuple[pd.Series, pd.Series]:
    """AND composition for long entry; exit is the bearish-cross series."""

    final_entry = long_allowed & blockers_ok & setup_long & trigger_long
    final_exit = exit_signal
    return final_entry.astype(bool), final_exit.astype(bool)


def ema_pullback_pipeline_signals(
    df: pd.DataFrame,
    *,
    ema_fast: int,
    ema_slow: int,
) -> tuple[pd.Series, pd.Series]:
    """Run direction → blockers → setup → trigger/exit for the baseline family."""

    long_al = long_allowed_baseline(df)
    block_ok = blockers_ok_baseline(df)
    setup = setup_long_baseline(df)
    fast_col = f"ema_{ema_fast}"
    slow_col = f"ema_{ema_slow}"
    trig = ema_bullish_cross_entry(df, fast_col, slow_col)
    ex = ema_bearish_cross_exit(df, fast_col, slow_col)
    return compose_final_signals(
        long_allowed=long_al,
        blockers_ok=block_ok,
        setup_long=setup,
        trigger_long=trig,
        exit_signal=ex,
    )


def crossover_from_ema_columns(
    df: pd.DataFrame,
    fast_col: str,
    slow_col: str,
) -> tuple[pd.Series, pd.Series]:
    """Long on bullish cross, exit on bearish cross; first row never fires.

    Thin wrapper over trigger/exit blocks for legacy call sites (same boolean
    semantics as Stage 1 ``crossover_from_ema_columns``).
    """

    entries = ema_bullish_cross_entry(df, fast_col, slow_col)
    exits = ema_bearish_cross_exit(df, fast_col, slow_col)
    return entries, exits


def ema_crossover_signals(
    df: pd.DataFrame,
    *,
    ema_fast: int,
    ema_slow: int,
) -> tuple[pd.Series, pd.Series]:
    """Crossover using columns ``ema_{ema_fast}`` and ``ema_{ema_slow}``."""

    return ema_pullback_pipeline_signals(df, ema_fast=ema_fast, ema_slow=ema_slow)
