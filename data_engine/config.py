"""Configuration objects used by CLI and storage.

This module keeps config tiny on purpose:
- where SQLite file lives;
- what log level user asked for.

Contract in plain words:
- build `Settings()` once in entrypoint;
- pass values to other classes explicitly;
- do not create global singleton config.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for Phase 1.

    On beginner language:
    - `db_path` is just "where to keep sqlite file".
    - `log_level` is text like INFO/DEBUG.

    Environment variables:
    - `DATA_ENGINE_DB_PATH`
    - `DATA_ENGINE_LOG_LEVEL`
    """

    model_config = SettingsConfigDict(env_prefix="DATA_ENGINE_")

    db_path: Path = Path("./market.sqlite")
    log_level: str = "INFO"

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, value: str) -> str:
        """Allow only known logging levels.

        Plain contract:
        - accepted values: CRITICAL, ERROR, WARNING, INFO, DEBUG, NOTSET;
        - any unknown word is configuration mistake and must fail early.
        """

        allowed = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "NOTSET"}
        normalized = value.strip().upper()
        if normalized not in allowed:
            raise ValueError(
                "log_level must be one of: CRITICAL, ERROR, WARNING, INFO, DEBUG, NOTSET"
            )
        return normalized
