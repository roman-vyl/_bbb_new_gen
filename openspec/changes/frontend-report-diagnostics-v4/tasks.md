## 1. Frontend — Reports diagnostics (shipped)

- [x] 1.1 `reportSchema.ts`, `formatDiagnostics.ts`, fixtures v3/v4/v5
- [x] 1.2 Fee / Profile / Exit Reason tables + `ReportsPanel` wiring
- [x] 1.3 Trade filters, diagnostics columns toggle, `TradeDetail` expansion
- [x] 1.4 Vitest: `ReportsPanel`, breakdown tables, filters, trade focus
- [x] 1.5 `npm test` in `frontend/` (reports slice)

## 2. Research — audit & refactor `trade_analyzer.py`

- [ ] 2.1 Audit call sites: `extract_trade_records`, `build_managed_trade_records`, `build_trade_quality_breakdowns` — document in PR
- [ ] 2.2 Extract `_compute_trade_path_core()` — single MFE/MAE/capture/giveback math (formulas per design)
- [ ] 2.3 Add `_build_nested_path_diagnostics()` and `_compute_reference_levels()` (reuse `exit_attribution` touch helpers)
- [ ] 2.4 Extend `build_trade_quality_diagnostics()` — nested + flat + `quality_flags` from one core
- [ ] 2.5 Add `build_path_diagnostics_summary()` + `path_diagnostics_config_payload()`
- [ ] 2.6 Fix giveback: `max(0, MFE - realized)`; allow negative `capture_ratio`; positive MAE magnitudes in flat/nested

## 3. Research — wire report generation

- [ ] 3.1 `results.extract_trade_records()` — pass `open_`, attribution; attach nested on closed only
- [ ] 3.2 `results.build_managed_trade_records()` — same builder for closed trades when OHLC available
- [ ] 3.3 `build_trade_quality_breakdowns()` — include `path_diagnostics_summary`
- [ ] 3.4 `build_research_run_payload()` — `report_schema_version: 6`, `path_diagnostics_config`
- [ ] 3.5 `result_models.py` — optional `path_diagnostics_summary` on `VariantMetrics`

## 4. Research — unit tests (`tests/test_ema_pullback_trade_analyzer.py` + new cases)

- [ ] 4.1 Long/short MFE/MAE basic; bars_to_mfe / bars_to_mae / bars_from_mfe_to_exit
- [ ] 4.2 Capture/giveback winner long and short
- [ ] 4.3 Losing trade: negative `capture_ratio`; giveback > MFE; `giveback_pct` ratio
- [ ] 4.4 MFE ≤ 0 → null capture/giveback
- [ ] 4.5 Reference: TP first, SL first, `ambiguous_same_bar`, available+untouched, unavailable
- [ ] 4.6 Summary: `no_reference_level_hit_count` vs `reference_levels_unavailable_count`
- [ ] 4.7 Open trades omit nested keys (integration with record builder)

## 5. Research — integration tests

- [ ] 5.1 `test_ema_pullback_results_artifact.py` — v6 payload keys, `path_diagnostics_config`, schema 6
- [ ] 5.2 Generated closed trade: nested + flat parity (`mfe_pct`, `capture_ratio`, …)
- [ ] 5.3 `path_diagnostics_summary` in variant metrics
- [ ] 5.4 v5 fixtures still load; `extract_candidate_summary` unchanged on v5
- [ ] 5.5 Managed closed trades get diagnostics when OHLC wired (if applicable)

## 6. Contracts & frontend types (minimal)

- [ ] 6.1 `frontend/src/api/types.ts` — optional v6 nested types; `SUPPORTED_REPORT_SCHEMA_VERSIONS` includes 6
- [ ] 6.2 `frontend/.../reportSchema.ts` — `isDiagnosticsV4` true for version 6
- [ ] 6.3 `research_api/contracts/runs.py` — optional nested types (pass-through only)

## 7. Verification

- [ ] 7.1 `pytest tests/test_ema_pullback_trade_analyzer.py tests/test_trade_path_diagnostics.py tests/test_ema_pullback_results_artifact.py` (adjust names as created)
- [ ] 7.2 `cd frontend && npm test` — reports + `reportSchema` v6
- [ ] 7.3 Smoke: one ema_pullback run → v6 JSON with `path_diagnostics` on closed trades
- [ ] 7.4 Manual Workbench: v6 run loads in Reports (existing UI); v3 fixture intact (tasks 5.3–5.4 from frontend slice)

## 8. Out of scope

Reports UI for nested `path_diagnostics` / `path_diagnostics_summary`; silent migration of historical JSON; duplicate path math outside `trade_analyzer.py`.
