"""Thin SQLite wrapper for Data Engine storage operations."""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path
from typing import Any

from data_engine.contracts import Candle, TimeWindow

from .ddl import DDL_STATEMENTS, EXPECTED_TABLES, SCHEMA_VERSION_INSERT


class Db:
    """Small helper around sqlite3 connection.

    Behavior contract:
    - constructor opens connection and sets SQLite pragmas;
    - constructor does NOT create tables;
    - caller explicitly decides when to run `apply_ddl()`.
    """

    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.execute("PRAGMA journal_mode=WAL;")
        self.conn.execute("PRAGMA busy_timeout=30000;")
        self.conn.execute("PRAGMA synchronous=NORMAL;")

    def apply_ddl(self) -> None:
        """Create expected schema if it is missing.

        Safe to run many times:
        - all CREATE statements use IF NOT EXISTS;
        - schema version row uses INSERT OR IGNORE.
        """

        with self.conn:
            for statement in DDL_STATEMENTS:
                self.conn.execute(statement)
            self.conn.execute(SCHEMA_VERSION_INSERT)

    def health(self) -> dict[str, Any]:
        """Read-only contract check and row counts.

        Returns:
        - `contract="ok"` when all expected tables exist and schema version is 1;
        - `contract="schema_mismatch"` when table/key/version is wrong.

        Important:
        - this method never creates tables and never modifies schema.
        """

        if not self._all_expected_tables_exist():
            return {
                "db_path": str(self.db_path),
                "schema_version": 1,
                "contract": "schema_mismatch",
            }

        schema_version_value = self._schema_version_value()
        if schema_version_value != "1":
            return {
                "db_path": str(self.db_path),
                "schema_version": schema_version_value,
                "contract": "schema_mismatch",
            }

        counts: dict[str, Any] = {}
        for table in EXPECTED_TABLES:
            counts[table] = self.conn.execute(f"SELECT COUNT(*) FROM {table};").fetchone()[0]

        return {
            "db_path": str(self.db_path),
            "schema_version": int(schema_version_value),
            "schema_meta": counts["schema_meta"],
            "candles": counts["candles"],
            "meta": counts["meta"],
            "quarantine": counts["quarantine"],
            "contract": "ok",
        }

    def upsert(self, rows: list[Candle]) -> int:
        """Insert or update candles by the Phase 1 primary key."""

        if not rows:
            return 0

        with self.conn:
            self.conn.executemany(
                """
                INSERT INTO candles(
                    symbol, timeframe, open_time_ms, open, high, low, close, volume
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol, timeframe, open_time_ms) DO UPDATE SET
                    open = excluded.open,
                    high = excluded.high,
                    low = excluded.low,
                    close = excluded.close,
                    volume = excluded.volume;
                """,
                [
                    (
                        row.symbol,
                        row.timeframe,
                        row.open_time_ms,
                        row.open,
                        row.high,
                        row.low,
                        row.close,
                        row.volume,
                    )
                    for row in rows
                ],
            )
        return len(rows)

    def range_get(self, symbol: str, tf: str, window: TimeWindow) -> list[Candle]:
        rows = self.conn.execute(
            """
            SELECT symbol, timeframe, open_time_ms, open, high, low, close, volume
            FROM candles
            WHERE symbol = ?
              AND timeframe = ?
              AND open_time_ms >= ?
              AND open_time_ms < ?
            ORDER BY open_time_ms ASC;
            """,
            (symbol, tf, window.start_ms, window.end_ms),
        ).fetchall()
        return [
            Candle(
                symbol=row[0],
                timeframe=row[1],
                open_time_ms=row[2],
                open=row[3],
                high=row[4],
                low=row[5],
                close=row[6],
                volume=row[7],
            )
            for row in rows
        ]

    def count_candles(self, symbol: str, tf: str, window: TimeWindow) -> int:
        return int(
            self.conn.execute(
                """
                SELECT COUNT(*)
                FROM candles
                WHERE symbol = ?
                  AND timeframe = ?
                  AND open_time_ms >= ?
                  AND open_time_ms < ?;
                """,
                (symbol, tf, window.start_ms, window.end_ms),
            ).fetchone()[0]
        )

    def max_open_time_ms(self, symbol: str, tf: str) -> int | None:
        row = self.conn.execute(
            """
            SELECT MAX(open_time_ms)
            FROM candles
            WHERE symbol = ?
              AND timeframe = ?;
            """,
            (symbol, tf),
        ).fetchone()
        return None if row is None or row[0] is None else int(row[0])

    def min_open_time_ms(self, symbol: str, tf: str) -> int | None:
        row = self.conn.execute(
            """
            SELECT MIN(open_time_ms)
            FROM candles
            WHERE symbol = ?
              AND timeframe = ?;
            """,
            (symbol, tf),
        ).fetchone()
        return None if row is None or row[0] is None else int(row[0])

    def set_launch_time_ms(self, symbol: str, ts_ms: int) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO meta(symbol, launch_time_ms, fetched_at_ms)
                VALUES (?, ?, NULL)
                ON CONFLICT(symbol) DO UPDATE SET
                    launch_time_ms = excluded.launch_time_ms;
                """,
                (symbol, ts_ms),
            )

    def get_launch_time_ms(self, symbol: str) -> int | None:
        row = self.conn.execute(
            """
            SELECT launch_time_ms
            FROM meta
            WHERE symbol = ?
            LIMIT 1;
            """,
            (symbol,),
        ).fetchone()
        if row is None or row[0] is None:
            return None
        return int(row[0])

    def put_quarantine(
        self,
        *,
        symbol: str,
        timeframe: str,
        start_ms: int,
        end_ms: int,
        reason: str,
        payload: str,
        created_at_ms: int | None = None,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO quarantine(
                    symbol, timeframe, start_ms, end_ms, reason, payload, created_at_ms
                )
                VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    symbol,
                    timeframe,
                    start_ms,
                    end_ms,
                    reason,
                    payload,
                    int(time.time() * 1000) if created_at_ms is None else created_at_ms,
                ),
            )

    def _all_expected_tables_exist(self) -> bool:
        existing_tables = {
            row[0]
            for row in self.conn.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table';
                """
            ).fetchall()
        }
        return all(table in existing_tables for table in EXPECTED_TABLES)

    def _schema_version_value(self) -> str | None:
        row = self.conn.execute(
            """
            SELECT value
            FROM schema_meta
            WHERE key = 'schema_version'
            LIMIT 1;
            """
        ).fetchone()
        if row is None:
            return None
        return row[0]
