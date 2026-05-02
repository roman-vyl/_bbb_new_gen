"""Portfolio/risk parameters for vectorbt (no live risk engine)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import pandas as pd

if TYPE_CHECKING:
    from research.strategies.ema_pullback.config import StrategyConfig

# Placeholder for future sizing hooks (fixed fraction, volatility targeting, …).
# Stage 1–2: vectorbt default sizing from boolean signals is unchanged.


@dataclass(frozen=True)
class PortfolioRiskParams:
    init_cash: float
    fees: float
    slippage: float


def no_risk_filter(df: pd.DataFrame) -> pd.Series:
    """No risk filter: pass all rows."""

    return pd.Series(True, index=df.index, dtype=bool)


def portfolio_risk_from_config(cfg: "StrategyConfig") -> PortfolioRiskParams:
    """Map frozen family config to ``Portfolio.from_signals`` risk kwargs."""

    return PortfolioRiskParams(
        init_cash=cfg.init_cash,
        fees=cfg.fees,
        slippage=cfg.slippage,
    )
