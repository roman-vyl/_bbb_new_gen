"""SQL schema for Phase 1 foundation.

Beginner-friendly contract:
- this file is the single source of truth for table creation;
- `Db.apply_ddl()` runs these statements;
- `Db.health()` expects exactly these tables to exist.
"""

from __future__ import annotations

EXPECTED_TABLES = ("schema_meta", "candles", "meta", "quarantine")

DDL_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS schema_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS candles (
      symbol        TEXT    NOT NULL,
      timeframe     TEXT    NOT NULL,
      open_time_ms  INTEGER NOT NULL,
      open          REAL    NOT NULL,
      high          REAL    NOT NULL,
      low           REAL    NOT NULL,
      close         REAL    NOT NULL,
      volume        REAL    NOT NULL,
      PRIMARY KEY (symbol, timeframe, open_time_ms)
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_candles_lookup
      ON candles(symbol, timeframe, open_time_ms);
    """,
    """
    CREATE TABLE IF NOT EXISTS meta (
      symbol         TEXT PRIMARY KEY,
      launch_time_ms INTEGER,
      fetched_at_ms  INTEGER
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS quarantine (
      id            INTEGER PRIMARY KEY,
      symbol        TEXT,
      timeframe     TEXT,
      start_ms      INTEGER,
      end_ms        INTEGER,
      reason        TEXT,
      payload       TEXT,
      created_at_ms INTEGER
    );
    """,
)

SCHEMA_VERSION_INSERT = """
INSERT OR IGNORE INTO schema_meta(key, value)
VALUES ('schema_version', '1');
"""
