## 1. Contracts And Parsing

- [x] 1.1 Add spec dataclasses/types for `trade_management.exit_management.mode`, `phase_rules`, `stop_management`, and `runtime_exits` without moving declarative exits out of `exit_policy`.
- [x] 1.2 Support v1 phase-rule condition types `mfe_atr`, `mfe_pct`, and `bars_in_trade`, including validation for required fields and positive thresholds.
- [x] 1.3 Enforce diagnostic-only v1 constraints: `mode: "diagnostic_only"` allows phase rules but rejects non-empty `stop_management` and `runtime_exits`.
- [x] 1.4 Preserve existing configs without `exit_management` and existing archived break-even management configs as deprecated backward-compatible parser/runtime behavior; do not treat legacy BE as part of the new runtime architecture.

## 2A. Execution Integration Audit

- [x] 2A.1 Identify the exact current execution paths: static vectorbt path, existing managed `exit_management` path, and report/trade record builder path.
- [x] 2A.2 Document where `entry_idx`, `exit_idx`, side, entry price, exit price, exit reason, locked profile, and OHLCV index are available in the current code.
- [x] 2A.3 Add an implementation note or code comment at the integration point explaining why `diagnostic_only` does not create a second trade path.
- [x] 2A.4 Add a failing parity fixture/test before implementing diagnostics so the first runtime integration must preserve old behavior.

## 2. Diagnostic Runtime State

- [x] 2.1 Introduce `TradeRuntimeState` and `TradeManagementEvent` structures in the existing `ema_pullback` execution layer.
- [x] 2.2 Implement side-aware best/worst price, MFE/MAE price, MFE/MAE percent, and inclusive `bars_in_trade` updates for long and short trades.
- [x] 2.3 Evaluate ordered phase rules monotonically and record `phase_changed` events with rule id, from/to phase, MFE/MAE, and bars in trade.
- [x] 2.4 Build runtime diagnostics from actual closed trade windows using existing trade records' `entry_idx` and `exit_idx`; do not recompute entries, exits, setup, trigger, blockers, indicators, or context.
- [x] 2.5 For each closed trade, iterate only `entry_idx..exit_idx` inclusive to update runtime state and phase transitions.
- [x] 2.6 For `diagnostic_only`, do not feed runtime state back into exit masks, stop prices, vectorbt exits, or managed execution decisions.
- [x] 2.7 Record `exit_executed` events for real closed trades using existing exit attribution when available.

## 3. Report Serialization

- [x] 3.1 Add nested closed-trade `trade_management` diagnostics for diagnostic-only runs, omitting the block for open trades in v1.
- [x] 3.2 Add variant-level `trade_management_events` ordered by bar index and event creation order when diagnostic-only runtime is enabled.
- [x] 3.3 Add variant-level `metrics.trade_management_summary` with phase reached buckets, transition counts, exit-layer breakdown, active-stop source breakdown, runner capture, and protected trade summaries.
- [x] 3.4 Keep `report_schema_version` at `6` and ensure historical v3-v6 reports load without silent migration.
- [x] 3.5 Update candidate/batch summary extraction only as needed so reports with the new optional fields do not break existing summaries.

## 3A. Compact Summary Compatibility

- [x] 3A.1 Ensure the full report may contain `trade_management_events`.
- [x] 3A.2 Ensure compact summaries exclude heavy event arrays by default.
- [x] 3A.3 Ensure compact summaries can keep `metrics.trade_management_summary`.
- [x] 3A.4 Add a test for compact summary JSON size/shape or explicit omission of heavy event fields.

## 4. Backend Tests And Verification

- [x] 4.1 Add unit tests for long and short side-aware best/worst price and MFE/MAE calculations.
- [x] 4.2 Add unit tests for `mfe_atr`, `mfe_pct`, and `bars_in_trade` phase-rule transitions, including monotonic phase behavior.
- [x] 4.3 Add parity tests comparing a config without `exit_management` to the same config with diagnostic-only phase rules: trade count, net PnL, PF, and exit reasons must match within existing tolerances.
- [x] 4.4 Add report fixture/test coverage for closed-trade `trade_management`, variant `trade_management_events`, and `metrics.trade_management_summary`.
- [x] 4.5 Add compatibility tests proving existing break-even exit-management configs still validate and run as before.
- [x] 4.6 Run the focused research test suite for `ema_pullback` execution/report diagnostics and record the command/output in the implementation notes.

## 5. API/BFF Read Integration Future Slice

- [ ] 5.1 Update `research_api` report schemas/types to tolerate and expose `trade.trade_management`, `variant.metrics.trade_management_summary`, and `variant.trade_management_events`.
- [ ] 5.2 Add read-only API support for the new runtime diagnostic fields; do not add authoring support in this slice.
- [ ] 5.3 Ensure old reports without trade-management fields still load and serve through the API.
- [ ] 5.4 Add API tests for both an old report and a new diagnostic-only report.

## 6. Legacy BE Cleanup Future Slice

- [ ] 6.1 After diagnostic runtime v1 lands, remove or archive the legacy `exit_management.always_on/profiles/rules` `break_even_stop` shape from product-facing contracts.
- [ ] 6.2 Remove legacy BE from new runtime documentation, examples, and any Composer/catalog path that could present it as supported.
- [ ] 6.3 Keep only deliberate historical-report/config loading support if still needed, with explicit deprecated-path tests.
- [ ] 6.4 Verify the new runtime architecture uses only `phase_rules`, `stop_management`, and `runtime_exits` as its product contract.

## 7. Frontend Report And Chart Future Slice

- [ ] 7.1 Update frontend report types for optional trade-management fields.
- [ ] 7.2 Add report diagnostics panels for phase reached breakdown, runner capture summary, protected trade summary, and exit-layer breakdown.
- [ ] 7.3 Add chart overlays later for Proven/Protected/Runner markers, MFE peak marker, active stop line when available, and exit-layer label.
- [ ] 7.4 Keep Workbench loading old reports that do not contain trade-management fields.
- [ ] 7.5 Do not add Composer authoring until the backend/API read path is stable.
