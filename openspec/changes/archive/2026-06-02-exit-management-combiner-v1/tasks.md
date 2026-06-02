## 1. Contracts and Config

- [x] 1.1 Add `trade_management.exit_management` dataclasses/contracts with empty default groups.
- [x] 1.2 Add `break_even_stop` rule model with `instance_id`, `component_id`, `trigger_r`, `offset_r`, and `apply_once`.
- [x] 1.3 Validate v1 rule constraints: `trigger_r > 0`, `offset_r >= 0`, `apply_once == true`.
- [x] 1.4 Validate v1 scope: at most one active `break_even_stop` rule per group and no merge/chaining semantics.
- [x] 1.5 Validate global `instance_id` uniqueness across exit policy and exit-management rules.
- [x] 1.5a **BLOCKER:** reject any config with `break_even_stop` when the effective `exit_policy` group has no `stop_loss` (always_on-only BE requires always_on SL; profile BE requires always_on ∪ that profile SL).
- [x] 1.5b Add tests: break-even + atr SL passes; break-even alone fails validate; aligned BE without aligned/always_on SL fails.
- [x] 1.6 Add builder/helper support for test and manual specs (e.g. `exit_management_group`, `break_even_stop_rule`).
- [x] 1.7 Document example YAML/JSON in `design.md` (profile override + always_on fallback) and keep one fixture aligned with it — `research/experiments/configs/fixtures/exit_management_be_profile_override.json`.

## 2. Exit Management Combiner

- [x] 2.1 Add `research/strategies/ema_pullback/execution/exit_management.py`.
- [x] 2.2 Define resolved rule, active source, managed position state, trade diagnostics, and per-bar trace diagnostics structures.
- [x] 2.3 Resolve active management rule from locked entry profile: profile overrides `always_on`, else fallback to `always_on`.
- [x] 2.4 Implement initial stop and initial risk freeze at entry using existing static exit-policy stop source; fail fast at entry if active break-even but no finite initial stop.
- [x] 2.5 Implement long and short `break_even_stop` trigger calculation.
- [x] 2.6 Implement effective/pending stop state with next-bar promotion.
- [x] 2.7 Implement tighten-only behavior and same-bar old-stop edge handling.
- [x] 2.8 Add focused unit tests for triggered, never-triggered, no-rule, profile override, always-on fallback, short-side, and same-bar old-stop cases — **autotest partial** (`test_exit_management.py`, `test_exit_management_extended.py`): triggered long BE + next-bar trace (`test_managed_long_break_even_trigger_next_bar`); never-triggered diagnostics (`test_resolve_never_triggered_break_even_diagnostics`); profile override / always_on resolve (`test_resolve_profile_overrides_always_on`, `test_resolve_fallback_to_always_on`); SL fill at level + gap (`test_managed_stop_loss_fill_price_uses_level_not_close`, `test_fill_price_for_distance_exit_matches_vectorbt_gap_and_level`); SL before signal (`test_managed_distance_stop_wins_over_signal_on_same_bar`); fixture profile shape (`test_fixture_loads_exit_management_shape`). **Not automated:** short-side BE, same-bar old-stop hit before promotion, explicit no-rule combiner loop.

## 3. Backtest Integration

- [x] 3.1 Detect whether a strategy spec has stateful `exit_management` rules.
- [x] 3.2 Keep current static `vectorbt` path for specs without stateful management rules.
- [x] 3.3 Add managed runtime path for specs with exit-management rules, consuming outputs from `build_signals_from_spec` and `build_exit_outputs_from_spec`.
- [x] 3.4 Ensure managed trade rows normalize into the existing metrics/report shape.
- [x] 3.5 Preserve distance stop priority over signal exits on the same bar — `test_managed_distance_stop_wins_over_signal_on_same_bar`.
- [x] 3.6 Add parity regression proving no-management specs match current trade counts and core metrics within existing tolerances — `test_run_strategy_spec_without_exit_management_skips_managed_loop` (optional_vectorbt).

## 4. Report Diagnostics

- [x] 4.1 Extend research trade record model/output with optional `break_even`.
- [x] 4.2 Populate `break_even` from combiner diagnostics for active `break_even_stop` trades.
- [x] 4.3 Include `active_stop_management_source` as `"profile"` or `"always_on"` when a rule is active.
- [x] 4.4 Keep historical reports without `break_even` readable.
- [x] 4.5 Add report tests for triggered, never-triggered, no-management, profile override source, and always-on fallback source — `test_build_managed_trade_records_break_even_exit_reason`, `test_resolve_never_triggered_break_even_diagnostics`, `test_fixture_loads_exit_management_shape` / `test_fixture_matches_design_json_fragment`; API contract `test_trade_record_accepts_managed_path_bar_indices_and_break_even` (`test_research_api_run_report.py`). **Not automated:** closed-trade e2e with `trigger_time_ms` on full managed backtest.

## 5. Signal Trace and API

- [x] 5.1 Make Signal Trace consume combiner per-bar diagnostics instead of recomputing break-even formulas.
- [x] 5.2 Add optional trace fields: `effective_stop_price`, `pending_stop_price`, `break_even_active`, `break_even_triggered_on_bar`, `break_even_trigger_price`, `break_even_stop_moved_to`, `break_even_initial_risk`, `break_even_instance_id`, and `active_stop_management_source` (under `internals.exit_management`).
- [x] 5.3 Extend `research_api` Signal Trace contracts to accept and return the optional fields — **via `SideSignalTrace.internals` passthrough, not top-level Pydantic fields**.
- [x] 5.4 Ensure `research_api/services/signal_trace_service.py::_to_contract()` preserves all new exit-management trace fields.
- [x] 5.5 Add tests for trigger-bar old effective stop, next-bar promoted stop, API passthrough, and legacy trace payload compatibility — `_attach_exit_management_internals` (`test_signal_trace_attaches_exit_management_when_traces_active`); trigger/next-bar on long loop (`test_managed_long_break_even_trigger_next_bar`); API `test_to_contract_preserves_exit_management_internals`; strategy spec roundtrip incl. `exit_management` tuples (`test_ema_pullback_signal_trace.py`, 27 tests). **Not automated:** full `build_signal_trace_from_spec` e2e with managed path + profile `active_stop_management_source` on trace rows.
- [x] 5.6 Verify HTF context EMA overlays (`workbench-chart-htf-context-overlays`) on a `strategy.contexts` variant after Signal Trace contract/service changes — manual Workbench Chart, verified.

## 6. Composer Authoring

- [x] 6.1 Add `break_even_stop` to research component registry with params `trigger_r`, `offset_r`, `apply_once`.
- [x] 6.2 Extend `research_api` component catalog: role `exit_management`, sections for always_on + aligned/countertrend/neutral profile rule lists.
- [x] 6.3 Extend validate/config_service for `trade_management.exit_management` paths, v1 rule constraints, and **BLOCKER** break-even-without-initial-stop errors with actionable messages — **via `instance_loader` / `TradeManagementSpec` validation**.
- [x] 6.4 Add Composer list slots and paths: `exit_management.always_on.rules[]` and `profiles.<profile>.rules[]` (mirror exit policy UX, separate wire).
- [x] 6.5 Render `break_even_stop` param form from catalog (`trigger_r`, `offset_r`; `apply_once` fixed true in v1).
- [x] 6.6 Default new instances: empty `exit_management` groups (no break-even until author adds a rule).
- [x] 6.7 Add Composer/authoring tests: add rule to always_on, add profile override, validate rejects duplicate break-even per group — `composerExitManagement.test.ts`, `test_duplicate_break_even_per_group_fails_validation`.
- [x] 6.8 Manual check: saved draft round-trips through validate and matches example shape in `design.md` — verified.

## 7. Frontend Read-Only Diagnostics

- [x] 7.1 Add optional `BreakEvenDiagnostics` / `break_even` to frontend trade record types.
- [x] 7.2 Display a read-only Break-even section in selected trade diagnostics when `break_even` is present.
- [x] 7.3 Omit the Break-even section for old reports/trades without `break_even`.
- [x] 7.4 Add vitest/component coverage for present and absent break-even diagnostics.
- [x] 7.5 Confirm no chart stop-line overlay, viewport, pan, or cache behavior changes were added.

## 8. Verification

- [x] 8.1 Run targeted research tests for exit-management combiner and report diagnostics — **58 passed** (`test_exit_management.py` 17, `test_exit_management_extended.py` 6, `test_ema_pullback_signal_trace.py` 27, `test_research_api_signal_trace.py` 6, `test_research_api_run_report.py` 2).
- [x] 8.2 Run targeted API tests for catalog, validate, report, and Signal Trace contracts — included in 8.1 bundle (`test_research_api_*`, roundtrip `strategy_spec_from_report_dict`).
- [x] 8.3 Run targeted frontend tests for Composer authoring and selected trade diagnostics — **15 passed** (`exitManagementBarInspector.test.ts` 3, `composerExitManagement.test.ts` 2, `ChartTradeDiagnostics.test.tsx` 9, `chartMarkers.breakEven.test.ts` 1).
- [x] 8.4 Run existing no-management regression tests — `test_run_strategy_spec_without_exit_management_skips_managed_loop` (optional_vectorbt, passed); validation/roundtrip in 8.1.
- [x] 8.5 Confirm `git diff --stat data_engine/` is empty.
- [x] 8.6 Update implementation notes if reality diverges from `design.md` — **see `design.md` § Implementation notes (as built)**.

## Beyond original tasks (implemented, now in specs)

- [x] `research_api` `TradeRecord`: `entry_idx`, `exit_idx`, `break_even` (`BreakEvenDiagnostics`).
- [x] Managed path `exit_reason` / `exit_kind` for `break_even:*` exits; chart marker **BE** (`chartMarkers.ts`); vitest `chartMarkers.breakEven.test.ts`.
- [x] Chart Bar Inspector: per-bar **Exit management (break-even)** block from `long`/`short.internals.exit_management` (`exitManagementBarInspector.ts`, `ChartBarInspector.tsx`); vitest `exitManagementBarInspector.test.ts`.
- [x] Managed `exit_price` at stop/TP level (not bar close) — `fill_price_for_distance_exit`, tests in `test_exit_management.py`.

## Autotest command (regression)

```bash
python -m pytest tests/test_exit_management.py tests/test_exit_management_extended.py tests/test_ema_pullback_signal_trace.py tests/test_research_api_signal_trace.py tests/test_research_api_run_report.py -q
cd frontend && npm test -- --run exitManagementBarInspector.test.ts composerExitManagement.test.ts ChartTradeDiagnostics.test.tsx chartMarkers.breakEven.test.ts
```

## Manual verification (done)

- [x] 5.6 HTF context EMA overlays on `strategy.contexts` variant (Workbench Chart).
- [x] 6.8 Composer save → validate round-trip vs `design.md` example shape.
