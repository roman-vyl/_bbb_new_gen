"""Thin SQLite wrapper for Phase 1.

The main idea in simple words:
- `apply_ddl()` creates missing tables.
- `health()` only checks current database state.

This split is intentional:
- status command may create schema first;
- health check itself must never auto-fix anything.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .ddl import DDL_STATEMENTS, EXPECTED_TABLES, SCHEMA_VERSION_INSERT


class Db:
    """Small helper around sqlite3 connection.

    Contract on fingers:
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
