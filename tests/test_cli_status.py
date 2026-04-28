from pathlib import Path
import sqlite3

from typer.testing import CliRunner

from data_engine.store import Db
from data_engine.service.cli import app


def test_status_creates_db_and_prints_expected_block(tmp_path: Path) -> None:
    db_file = tmp_path / "status.sqlite"
    runner = CliRunner()

    result = runner.invoke(app, ["status", "--db-path", str(db_file)])

    assert result.exit_code == 0
    assert db_file.exists()
    output = result.stdout
    assert f"db_path: {db_file}" in output
    assert "schema_version: 1" in output
    assert "schema_meta: 1" in output
    assert "candles: 0" in output
    assert "meta: 0" in output
    assert "quarantine: 0" in output
    assert "contract: ok" in output


def test_status_reports_schema_mismatch_for_existing_broken_db(tmp_path: Path) -> None:
    db_file = tmp_path / "broken.sqlite"
    db = Db(db_file)
    db.apply_ddl()

    with sqlite3.connect(db_file) as conn:
        conn.execute("DROP TABLE meta;")
        conn.commit()

    runner = CliRunner()
    result = runner.invoke(app, ["status", "--db-path", str(db_file)])

    assert result.exit_code == 0
    assert "contract: schema_mismatch" in result.stdout
