#!/usr/bin/env python3
"""Remove rolled-back prototype fields from run report JSON artifacts.

Strips ``trade_records[].context_ref`` (and other keys passed via --field) so
``research_api`` RunReport validation succeeds. Does not rewrite schema version
or add Phase 4 attribution fields.

Usage:
  python scripts/sanitize_prototype_run_report_fields.py research/results/runs/*.json
  python scripts/sanitize_prototype_run_report_fields.py --dry-run research/results/latest.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


DEFAULT_STRIP_KEYS = ("context_ref",)


def _strip_trade_records(variants: list[Any], keys: tuple[str, ...]) -> int:
    removed = 0
    for variant in variants:
        if not isinstance(variant, dict):
            continue
        records = variant.get("trade_records")
        if not isinstance(records, list):
            continue
        for record in records:
            if not isinstance(record, dict):
                continue
            for key in keys:
                if key in record:
                    del record[key]
                    removed += 1
    return removed


def sanitize_file(path: Path, *, keys: tuple[str, ...], dry_run: bool) -> int:
    payload = json.loads(path.read_text(encoding="utf-8"))
    variants = payload.get("variants")
    if not isinstance(variants, list):
        return 0
    removed = _strip_trade_records(variants, keys)
    if removed > 0 and not dry_run:
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return removed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path, help="Run JSON files or directories")
    parser.add_argument(
        "--field",
        action="append",
        default=list(DEFAULT_STRIP_KEYS),
        help="Trade record field to remove (repeatable)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report only; do not write")
    args = parser.parse_args(argv)
    keys = tuple(args.field)
    files: list[Path] = []
    for path in args.paths:
        if path.is_dir():
            files.extend(sorted(path.glob("*.json")))
        elif path.is_file():
            files.append(path)
    if not files:
        print("No JSON files found.", file=sys.stderr)
        return 1

    total_removed = 0
    touched = 0
    for file_path in files:
        removed = sanitize_file(file_path, keys=keys, dry_run=args.dry_run)
        if removed > 0:
            touched += 1
            total_removed += removed
            action = "would remove" if args.dry_run else "removed"
            print(f"{action} {removed} field(s) from {file_path}")

    if total_removed == 0:
        print("No prototype fields found.")
    else:
        print(f"Done: {total_removed} field(s) in {touched} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
