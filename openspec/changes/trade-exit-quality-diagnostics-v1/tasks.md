## 1. Research Analyzer

- [ ] 1.1 Add `research/strategies/ema_pullback/execution/trade_analyzer.py` with pure helpers for direction-aware MFE / MAE, capture, giveback, timing fields, and quality flags.
- [ ] 1.2 Add focused unit tests for long and short MFE / MAE formulas, one-bar trades, capture ratio, giveback, zero-based bars-to-MFE / bars-to-MAE, first-occurrence tie-breaking, and ATR-null behavior.
- [ ] 1.3 Add tests for additive quality flags: `high_mfe_high_capture`, `high_mfe_low_capture`, `signal_exit_winner`, `signal_exit_giveback_failure`, `stop_loss_after_low_mfe`, and `stop_loss_after_bad_context`.
- [ ] 1.4 Implement explicit `diagnostic_atr_series` handling only; do not fuzzy-discover ATR columns, and keep all `*_atr` fields `null` when no explicit positive ATR value is available.
- [ ] 1.5 Add tests documenting v1 bar-level exit limitation: entry and exit bars are included, and intrabar stop/take exit-bar high/low may include movement after fill.

## 2. Research Report Wiring

- [ ] 2.1 Update `results.py` so `extract_trade_records` calls analyzer helpers for closed trades and keeps formulas out of the record assembly body.
- [ ] 2.2 Update `backtest.py` and related call sites to pass any required ATR series into trade record extraction.
- [ ] 2.3 Add `quality_flag_breakdown` and `exit_component_quality_breakdown` builders and include them in `VariantMetrics`.
- [ ] 2.4 Emit new generated reports with `report_schema_version = 5` and top-level `trade_quality_config` threshold metadata, including `atr_source`.
- [ ] 2.5 Add or update research tests proving diagnostics do not alter existing signal generation, exit attribution, portfolio simulation, or closed/open trade counts.

## 3. API Contracts

- [ ] 3.1 Extend supported report schema versions to include v5 while preserving v3/v4 support.
- [ ] 3.2 Extend `research_api/contracts/runs.py` with optional trade fields for MFE / MAE, capture, giveback, timing, and `quality_flags`.
- [ ] 3.3 Extend API metric contracts for optional `quality_flag_breakdown`, `exit_component_quality_breakdown`, and top-level `trade_quality_config`.
- [ ] 3.4 Add or update API tests showing old schema v4 reports without the new fields still parse, new schema v5 reports parse, and the BFF serves persisted values without recomputation.

## 4. Frontend Contracts And Reports

- [ ] 4.1 Extend `frontend/src/api/types.ts` and report schema validation with schema v5 support plus optional exit quality trade, aggregate, and `trade_quality_config` fields.
- [ ] 4.2 Add trade table columns for MFE %, MAE %, capture %, capture ratio, giveback %, and quality flags.
- [ ] 4.3 Add report filters for high MFE high capture, high MFE low capture, signal exit winners, signal exit giveback failures, stop loss after low MFE, and bad-context stop losses.
- [ ] 4.4 Add or update frontend fixtures and tests for old reports without fields and new reports with populated exit quality diagnostics.

## 5. Chart Diagnostics

- [ ] 5.1 Extend selected-trade diagnostics fields to show MFE, MAE, captured, capture ratio, giveback, bars to MFE, bars from MFE to exit, and quality flags.
- [ ] 5.2 Add or update `ChartTradeDiagnostics` tests for populated exit quality diagnostics and missing-field fallback.

## 6. Verification

- [ ] 6.1 Run focused research tests for `ema_pullback` execution diagnostics.
- [ ] 6.2 Run focused API contract/results-reader tests.
- [ ] 6.3 Run focused frontend tests for report schema, filters, trade table columns, and chart diagnostics.
- [ ] 6.4 Manually load Workbench with a report containing exit quality diagnostics and verify Reports filters/table plus selected-trade Chart diagnostics.
- [ ] 6.5 Run `openspec validate trade-exit-quality-diagnostics-v1 --strict` if supported by the local OpenSpec CLI; otherwise run the equivalent available strict validation command and record the result.
- [ ] 6.6 Run full `python -m pytest -q`.
- [ ] 6.7 Run `cd frontend && npm test && npm run build`.
