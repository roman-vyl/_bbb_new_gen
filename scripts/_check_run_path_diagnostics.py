"""One-off checker for path_diagnostics / reference_levels on a run JSON."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


def main(path: Path) -> int:
    r = json.loads(path.read_text(encoding="utf-8"))

    print("report_schema_version:", r.get("report_schema_version"))
    print("path_diagnostics_config:", r.get("path_diagnostics_config"))
    print("variants_count:", r.get("variants_count"))
    print()

    all_closed: list[dict] = []

    for v in r["variants"]:
        variant = v.get("variant", "?")
        trades = [t for t in v["trade_records"] if t.get("status") == "closed"]
        open_trades = [t for t in v["trade_records"] if t.get("status") == "open"]
        with_path = [t for t in trades if "path_diagnostics" in t]
        with_ref = [
            t for t in trades if t.get("reference_levels", {}).get("reference_levels_available")
        ]
        no_prof = [
            t for t in trades if not (t.get("entry_profile") or t.get("active_exit_profile"))
        ]
        no_ctx = [t for t in trades if not t.get("entry_context_state")]
        ref_unavail = [
            t
            for t in trades
            if "reference_levels" in t and not t["reference_levels"].get("reference_levels_available")
        ]
        open_with_nested = [
            t
            for t in open_trades
            if "path_diagnostics" in t or "reference_levels" in t
        ]

        print(f"=== {variant} ===")
        print(f"  closed={len(trades)} open={len(open_trades)}")
        print(
            f"  with_path={len(with_path)} with_ref_available={len(with_ref)} "
            f"ref_unavailable={len(ref_unavail)}"
        )
        print(f"  no_entry_profile={len(no_prof)} no_entry_context_state={len(no_ctx)}")
        print(f"  open_with_nested={len(open_with_nested)}")

        prof_ctr = Counter(
            t.get("entry_profile") or t.get("active_exit_profile") or "MISSING" for t in with_ref
        )
        print(f"  ref_available profiles: {dict(prof_ctr)}")

        if trades:
            t0 = next((t for t in trades if "path_diagnostics" in t), trades[0])
            path = t0.get("path_diagnostics", {})
            mism: list[tuple] = []
            if path:
                pairs = [
                    ("mfe_pct", path.get("mfe", {}).get("pct")),
                    ("mae_pct", path.get("mae", {}).get("pct")),
                    ("capture_ratio", path.get("capture", {}).get("capture_ratio")),
                    ("giveback_pct", path.get("capture", {}).get("giveback_pct")),
                    ("bars_to_mfe", path.get("mfe", {}).get("bars_from_entry")),
                    ("bars_to_mae", path.get("mae", {}).get("bars_from_entry")),
                ]
                for flat_k, nested_v in pairs:
                    fv = t0.get(flat_k)
                    if fv != nested_v and not (fv is None and nested_v is None):
                        if (
                            isinstance(fv, float)
                            and isinstance(nested_v, float)
                            and abs(fv - nested_v) < 1e-12
                        ):
                            continue
                        mism.append((flat_k, fv, nested_v))
            ref = t0.get("reference_levels", {})
            mfe = path.get("mfe", {})
            mae = path.get("mae", {})
            print(
                f"  sample trade_id={t0.get('trade_id')} "
                f"entry_profile={t0.get('entry_profile')} ctx={t0.get('entry_context_state')}"
            )
            print(
                f"  sample ref_available={ref.get('reference_levels_available')} "
                f"sl={ref.get('initial_stop_price')} tp={ref.get('initial_take_profit_price')} "
                f"first_hit={ref.get('first_level_hit')}"
            )
            print(
                f"  sample mfe time_ms={mfe.get('time_ms')} mae time_ms={mae.get('time_ms')} "
                f"flat mae_pct={t0.get('mae_pct')}"
            )
            print(f"  flat/nested mismatches: {mism if mism else 'none'}")

        summ = v.get("metrics", {}).get("path_diagnostics_summary", {})
        if summ:
            tot = summ.get("total", {})
            print(
                f"  path_diagnostics_summary.total: trades={tot.get('trade_count')} "
                f"ref_avail={tot.get('reference_levels_available_count')} "
                f"ref_unavail={tot.get('reference_levels_unavailable_count')}"
            )
        else:
            print("  path_diagnostics_summary: MISSING")
        print()

        all_closed.extend(trades)

    print("=== GLOBAL ===")
    print("total closed:", len(all_closed))
    print("with path_diagnostics:", sum(1 for t in all_closed if "path_diagnostics" in t))
    print(
        "ref available:",
        sum(1 for t in all_closed if t.get("reference_levels", {}).get("reference_levels_available")),
    )
    print(
        "no entry_profile:",
        sum(1 for t in all_closed if not (t.get("entry_profile") or t.get("active_exit_profile"))),
    )

    negative_mae = [t for t in all_closed if (t.get("mae_pct") or 0) < 0]
    print("negative flat mae_pct count:", len(negative_mae))

    return 0


if __name__ == "__main__":
    p = Path(sys.argv[1] if len(sys.argv) > 1 else "research/results/runs/2026-06-05T162150Z_ema_pullback_BTCUSDT_5m.json")
    raise SystemExit(main(p))
