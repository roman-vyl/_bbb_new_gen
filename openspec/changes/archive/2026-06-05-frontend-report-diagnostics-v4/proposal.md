## Why

The Workbench Reports layer (schema v4/v5) already surfaces variant breakdowns and per-trade quality fields, but **closed-trade path semantics** are still flat and incomplete: no nested `path_diagnostics`, no `reference_levels` (initial SL/TP touch order inside the real trade window), and no `path_diagnostics_summary` aggregates.

Research already computes MFE/MAE/capture/giveback in `trade_analyzer.py` for v5 flat fields. The next step is **one formula source** — extend that module for schema **v6** nested JSON + summaries, while keeping v3–v5 readers and the shipped frontend Reports UI working.

## What Changes

### Research — schema v6 path diagnostics (extend `trade_analyzer.py`)

- **Single builder** `build_trade_quality_diagnostics()` remains the entry point for post-trade diagnostics on closed trades.
- Refactor inside `trade_analyzer.py`: pure path math, reference levels, nested serialization, summary aggregation — **no second independent MFE/MAE implementation**.
- Per **closed** trade (window `entry_idx..exit_idx` inclusive, no post-exit bars):
  - nested `path_diagnostics` (mfe, mae, capture);
  - nested `reference_levels` with `reference_levels_available`;
  - preserved flat v5 fields from the **same** computation (`mfe_pct`, `capture_ratio`, `quality_flags`, …).
- **Open trades:** omit `path_diagnostics` and `reference_levels` keys entirely.
- Variant `metrics.path_diagnostics_summary` (`total`, `by_side`, `by_exit_reason`; optional profile/context buckets).
- New runs: `report_schema_version: 6` + top-level `path_diagnostics_config` (no thresholds).
- Wire through **both** `extract_trade_records()` and `build_managed_trade_records()` when OHLC + indices available.

### Frontend — Reports diagnostics (already shipped on branch)

- Fee / Profile / Exit Reason blocks; trade filters; optional diagnostics columns; v3 empty state.
- **No new UI** for nested v6 sections in this change — optional TypeScript types only if needed for build.
- Gating treats schema v4, v5, and **6** as “diagnostics-capable” for existing v4/v5 UI.

### Research — compact run summary artifact (follow-up)

- When `write_research_results` persists `runs/<RUN_ID>.json`, also write **`runs/<RUN_ID>.summary.json`** beside it.
- Summary is a **projection** of the full report (not a new `report_schema_version`): keeps top-level metadata, variant `metrics`, breakdowns, `path_diagnostics_summary`, `component_counters`, `strategy_spec`; **omits** `trade_records` and other known heavy arrays.
- Summary markers (written last, cannot be overwritten): `artifact_kind: run_summary`, `summary_schema_version: 1`, `source_report_path`.
- Per-variant counts before strip: `trade_records_count`, `closed_trades_count`, `open_trades_count`.
- `write_research_results` returns `(latest_path, run_path, summary_path)`; full `latest.json` unchanged.
- Batch runner may set optional `summary_report_path` on `ExperimentCandidateResult`.

### Compatibility

- v3–v5 historical JSON: read-only, no silent migration.
- Flat v5 field names unchanged; values aligned with nested v6 where applicable.
- Batch `extract_candidate_summary` continues on v5; v6 summary fields optional.
- Compact `.summary.json` is additive; absence on old runs does not break loaders.

## Non-goals

- No trading / signal / portfolio simulation behavior changes.
- No post-exit or hypothetical trade analysis.
- No new context snapshot contracts.
- No duplicate path math outside `trade_analyzer.py`.
- No mandatory Reports UI for `path_diagnostics` / `path_diagnostics_summary`.
- No replacement of full report JSON with summary-only artifact.

## Capabilities

### New Capabilities

- _(none — extends existing contracts)_

### Modified Capabilities

- `ema-pullback-report-diagnostics`: schema v6 nested trade path + reference levels + `path_diagnostics_summary`; extend `trade_analyzer.py` as single formula source.
- `workbench-report-diagnostics`: schema v6 gating for existing Reports UI; optional types for nested fields.

## Impact

| Layer | Scope |
|-------|--------|
| **research** | `trade_analyzer.py` (core refactor), `results.py` (v6 payload + `build_compact_report_payload` / `.summary.json` writer), `runner.py`, `backtest.py` / `result_models.py`, tests under `tests/test_ema_pullback_*` |
| **research_api** | Optional pass-through types in `contracts/runs.py`; readers unchanged |
| **research/experiments** | `summary.py` tolerance for v6; optional `summary_report_path` on batch candidate results |
| **frontend** | `api/types.ts` optional v6 nested types; `reportSchema.ts` include v6; **no new Reports panels** |
| **data_engine** | _none_ |

**References**: [`openspec/specs/ema-pullback-report-diagnostics/spec.md`](../../specs/ema-pullback-report-diagnostics/spec.md), archived [`2026-05-24-trade-exit-quality-diagnostics-v1`](../../archive/2026-05-24-trade-exit-quality-diagnostics-v1), [`docs/frontend/implementation_plan.md`](../../../docs/frontend/implementation_plan.md).
