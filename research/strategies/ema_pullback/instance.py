"""Strategy instance: immutable config + derived config_id."""

from __future__ import annotations

from dataclasses import dataclass

from research.strategies.ema_pullback.config import StrategyConfig, strategy_config_id


@dataclass(frozen=True)
class StrategyInstance:
    config: StrategyConfig
    config_id: str

    @classmethod
    def from_config(cls, config: StrategyConfig) -> "StrategyInstance":
        return cls(config=config, config_id=strategy_config_id(config))
