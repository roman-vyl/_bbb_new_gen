"""Portfolio/risk parameters for vectorbt (no live risk engine)."""

from __future__ import annotations

from dataclasses import dataclass

from research.strategies.ema_pullback.config import StrategyConfig

# Placeholder for future sizing hooks (fixed fraction, volatility targeting, …).
# Stage 1–2: vectorbt default sizing from boolean signals is unchanged.


@dataclass(frozen=True)
class PortfolioRiskParams:
    init_cash: float
    fees: float
    slippage: float


def portfolio_risk_from_config(cfg: StrategyConfig) -> PortfolioRiskParams:
    """Map frozen family config to ``Portfolio.from_signals`` risk kwargs."""

    return PortfolioRiskParams(
        init_cash=cfg.init_cash,
        fees=cfg.fees,
        slippage=cfg.slippage,
    )
