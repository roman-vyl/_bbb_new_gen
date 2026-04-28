"""CLI for Phase 1.

Only one command exists now: `status`.
It is intentionally tiny and does three steps:
1) load settings,
2) create schema only for a new database,
3) print readable health report.
"""

from __future__ import annotations

from pathlib import Path

import typer

from data_engine.config import Settings
from data_engine.store import Db

app = typer.Typer(help="Data Engine command line interface")


def _print_status(result: dict) -> None:
    """Print status in stable human-readable format."""

    typer.echo(f"db_path: {result['db_path']}")
    typer.echo(f"schema_version: {result['schema_version']}")
    if result.get("contract") == "ok":
        typer.echo(f"schema_meta: {result['schema_meta']}")
        typer.echo(f"candles: {result['candles']}")
        typer.echo(f"meta: {result['meta']}")
        typer.echo(f"quarantine: {result['quarantine']}")
    typer.echo(f"contract: {result['contract']}")


@app.callback()
def main() -> None:
    """Root command group.

    Plain words:
    - command by itself does nothing;
    - real work lives in subcommands like `status`.
    """

    return None


@app.command()
def status(db_path: Path | None = None) -> None:
    """Show current database status.

    Beginner contract:
    - first run creates sqlite file and tables;
    - next runs just read and show real counts;
    - if schema is broken, shows `schema_mismatch`.
    """

    settings = Settings()
    if db_path is not None:
        settings = settings.model_copy(update={"db_path": db_path})

    db_file_existed = settings.db_path.exists()
    db = Db(settings.db_path)
    if not db_file_existed:
        db.apply_ddl()
    result = db.health()
    _print_status(result)
