## 1. Frontend — Reports diagnostics (shipped)

- [x] 1.1 `reportSchema.ts`, `formatDiagnostics.ts`, fixtures v3/v4/v5
- [x] 1.2 Fee / Profile / Exit Reason tables + `ReportsPanel` wiring
- [x] 1.3 Trade filters, diagnostics columns toggle, `TradeDetail` expansion
- [x] 1.4 Vitest: `ReportsPanel`, breakdown tables, filters, trade focus
- [x] 1.5 `npm test` in `frontend/` (reports slice)

## 2. Research — audit & refactor `trade_analyzer.py`

- [x] 2.1 Audit call sites: `extract_trade_records`, `build_managed_trade_records`, `build_trade_quality_breakdowns` — document in PR
- [x] 2.2 Extract `_compute_trade_path_core()` — single MFE/MAE/capture/giveback math (formulas per design)
- [x] 2.3 Add `_build_nested_path_diagnostics()` and `_compute_reference_levels()` (reuse `exit_attribution` touch helpers)
- [x] 2.4 Extend `build_trade_quality_diagnostics()` — nested + flat + `quality_flags` from one core
- [x] 2.5 Add `build_path_diagnostics_summary()` + `path_diagnostics_config_payload()`
- [x] 2.6 Fix giveback: `max(0, MFE - realized)`; allow negative `capture_ratio`; positive MAE magnitudes in flat/nested

## 3. Research — wire report generation

- [x] 3.1 `results.extract_trade_records()` — pass `open_`, attribution; attach nested on closed only
- [x] 3.2 `results.build_managed_trade_records()` — same builder for closed trades when OHLC available
- [x] 3.3 `build_trade_quality_breakdowns()` — include `path_diagnostics_summary`
- [x] 3.4 `build_research_run_payload()` — `report_schema_version: 6`, `path_diagnostics_config`
- [x] 3.5 `result_models.py` — optional `path_diagnostics_summary` on `VariantMetrics`

## 4. Research — unit tests (`tests/test_ema_pullback_trade_analyzer.py` + new cases)

- [x] 4.1 Long/short MFE/MAE basic; bars_to_mfe / bars_to_mae / bars_from_mfe_to_exit
- [x] 4.2 Capture/giveback winner long and short
- [x] 4.3 Losing trade: negative `capture_ratio`; giveback > MFE; `giveback_pct` ratio
- [x] 4.4 MFE ≤ 0 → null capture/giveback
- [x] 4.5 Reference: TP first, SL first, `ambiguous_same_bar`, available+untouched, unavailable
- [x] 4.6 Summary: `no_reference_level_hit_count` vs `reference_levels_unavailable_count`
- [x] 4.7 Open trades omit nested keys (integration with record builder)

## 5. Research — integration tests

- [x] 5.1 `test_ema_pullback_results_artifact.py` — v6 payload keys, `path_diagnostics_config`, schema 6
- [x] 5.2 Generated closed trade: nested + flat parity (`mfe_pct`, `capture_ratio`, …)
- [x] 5.3 `path_diagnostics_summary` in variant metrics
- [x] 5.4 v5 fixtures still load; `extract_candidate_summary` unchanged on v5
- [x] 5.5 Managed closed trades get diagnostics when OHLC wired (if applicable)

## 6. Contracts & frontend types (minimal)

- [x] 6.1 `frontend/src/api/types.ts` — optional v6 nested types; `SUPPORTED_REPORT_SCHEMA_VERSIONS` includes 6
- [x] 6.2 `frontend/.../reportSchema.ts` — `isDiagnosticsV4` true for version 6
- [x] 6.3 `research_api/contracts/runs.py` — optional nested types (pass-through only)

## 7. Verification

- [x] 7.1 `pytest tests/test_ema_pullback_trade_analyzer.py tests/test_trade_path_diagnostics.py tests/test_ema_pullback_results_artifact.py` (adjust names as created)
- [x] 7.2 `cd frontend && npm test` — reports + `reportSchema` v6
- [x] 7.3 Smoke: one ema_pullback run → v6 JSON with `path_diagnostics` on closed trades
- [x] 7.4 Manual Workbench: v6 run loads in Reports (existing UI); v3 fixture intact (tasks 5.3–5.4 from frontend slice)

## 8. Out of scope

Reports UI for nested `path_diagnostics` / `path_diagnostics_summary`; silent migration of historical JSON; duplicate path math outside `trade_analyzer.py`.

## 9. Compact run summary artifact

- [x] 9.1 `build_compact_report_payload()` — strip `trade_records` + known heavy keys; add trade counts; no in-place mutation
- [x] 9.2 `write_research_results()` — also write `runs/<RUN_ID>.summary.json` with `artifact_kind` / `summary_schema_version`
- [x] 9.3 Batch runner — optional `summary_report_path` on `ExperimentCandidateResult` when summary file exists
- [x] 9.4 Tests — compact projection + writer creates summary alongside full report
