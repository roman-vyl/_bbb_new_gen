## 1. Contracts and Config

- [x] 1.1 Add `trade_management.exit_management` dataclasses/contracts with empty default groups.
- [x] 1.2 Add `break_even_stop` rule model with `instance_id`, `component_id`, `trigger_r`, `offset_r`, and `apply_once`.
- [x] 1.3 Validate v1 rule constraints: `trigger_r > 0`, `offset_r >= 0`, `apply_once == true`.
- [x] 1.4 Validate v1 scope: at most one active `break_even_stop` rule per group and no merge/chaining semantics.
- [x] 1.5 Validate global `instance_id` uniqueness across exit policy and exit-management rules.
- [x] 1.5a **BLOCKER:** reject any config with `break_even_stop` when the effective `exit_policy` group has no `stop_loss` (always_on-only BE requires always_on SL; profile BE requires always_on ∪ that profile SL).
- [x] 1.5b Add tests: break-even + atr SL passes; break-even alone fails validate; aligned BE without aligned/always_on SL fails.
- [x] 1.6 Add builder/helper support for test and manual specs (e.g. `exit_management_group`, `break_even_stop_rule`).
- [ ] 1.7 Document example YAML/JSON in `design.md` (profile override + always_on fallback) and keep one fixture aligned with it.

## 2. Exit Management Combiner

- [x] 2.1 Add `research/strategies/ema_pullback/execution/exit_management.py`.
- [x] 2.2 Define resolved rule, active source, managed position state, trade diagnostics, and per-bar trace diagnostics structures.
- [x] 2.3 Resolve active management rule from locked entry profile: profile overrides `always_on`, else fallback to `always_on`.
- [x] 2.4 Implement initial stop and initial risk freeze at entry using existing static exit-policy stop source; fail fast at entry if active break-even but no finite initial stop.
- [x] 2.5 Implement long and short `break_even_stop` trigger calculation.
- [x] 2.6 Implement effective/pending stop state with next-bar promotion.
- [x] 2.7 Implement tighten-only behavior and same-bar old-stop edge handling.
- [ ] 2.8 Add focused unit tests for triggered, never-triggered, no-rule, profile override, always-on fallback, short-side, and same-bar old-stop cases.

## 3. Backtest Integration

- [x] 3.1 Detect whether a strategy spec has stateful `exit_management` rules.
- [x] 3.2 Keep current static `vectorbt` path for specs without stateful management rules.
- [x] 3.3 Add managed runtime path for specs with exit-management rules, consuming outputs from `build_signals_from_spec` and `build_exit_outputs_from_spec`.
- [x] 3.4 Ensure managed trade rows normalize into the existing metrics/report shape.
- [x] 3.5 Preserve distance stop priority over signal exits on the same bar.
- [ ] 3.6 Add parity regression proving no-management specs match current trade counts and core metrics within existing tolerances.

## 4. Report Diagnostics

- [x] 4.1 Extend research trade record model/output with optional `break_even`.
- [x] 4.2 Populate `break_even` from combiner diagnostics for active `break_even_stop` trades.
- [x] 4.3 Include `active_stop_management_source` as `"profile"` or `"always_on"` when a rule is active.
- [x] 4.4 Keep historical reports without `break_even` readable.
- [ ] 4.5 Add report tests for triggered, never-triggered, no-management, profile override source, and always-on fallback source.

## 5. Signal Trace and API

- [x] 5.1 Make Signal Trace consume combiner per-bar diagnostics instead of recomputing break-even formulas.
- [x] 5.2 Add optional trace fields: `effective_stop_price`, `pending_stop_price`, `break_even_active`, `break_even_triggered_on_bar`, `break_even_trigger_price`, `break_even_stop_moved_to`, `break_even_initial_risk`, `break_even_instance_id`, and `active_stop_management_source`.
- [x] 5.3 Extend `research_api` Signal Trace contracts to accept and return the optional fields.
- [x] 5.4 Ensure `research_api/services/signal_trace_service.py::_to_contract()` preserves all new exit-management trace fields.
- [ ] 5.5 Add tests for trigger-bar old effective stop, next-bar promoted stop, API passthrough, and legacy trace payload compatibility.
- [ ] 5.6 Verify HTF context EMA overlays (`workbench-chart-htf-context-overlays`) on a `strategy.contexts` variant after Signal Trace contract/service changes.

## 6. Composer Authoring

- [x] 6.1 Add `break_even_stop` to research component registry with params `trigger_r`, `offset_r`, `apply_once`.
- [x] 6.2 Extend `research_api` component catalog: role `exit_management`, sections for always_on + aligned/countertrend/neutral profile rule lists.
- [x] 6.3 Extend validate/config_service for `trade_management.exit_management` paths, v1 rule constraints, and **BLOCKER** break-even-without-initial-stop errors with actionable messages.
- [x] 6.4 Add Composer list slots and paths: `exit_management.always_on.rules[]` and `profiles.<profile>.rules[]` (mirror exit policy UX, separate wire).
- [x] 6.5 Render `break_even_stop` param form from catalog (`trigger_r`, `offset_r`; `apply_once` fixed true in v1).
- [x] 6.6 Default new instances: empty `exit_management` groups (no break-even until author adds a rule).
- [ ] 6.7 Add Composer/authoring tests: add rule to always_on, add profile override, validate rejects duplicate break-even per group.
- [ ] 6.8 Manual check: saved draft round-trips through validate and matches example shape in `design.md`.

## 7. Frontend Read-Only Diagnostics

- [x] 7.1 Add optional `BreakEvenDiagnostics` / `break_even` to frontend trade record types.
- [x] 7.2 Display a read-only Break-even section in selected trade diagnostics when `break_even` is present.
- [x] 7.3 Omit the Break-even section for old reports/trades without `break_even`.
- [x] 7.4 Add vitest/component coverage for present and absent break-even diagnostics.
- [x] 7.5 Confirm no chart stop-line overlay, viewport, pan, or cache behavior changes were added.

## 8. Verification

- [x] 8.1 Run targeted research tests for exit-management combiner and report diagnostics.
- [x] 8.2 Run targeted API tests for catalog, validate, report, and Signal Trace contracts.
- [ ] 8.3 Run targeted frontend tests for Composer authoring and selected trade diagnostics.
- [ ] 8.4 Run existing no-management regression tests.
- [x] 8.5 Confirm `git diff --stat data_engine/` is empty.
- [ ] 8.6 Update implementation notes if reality diverges from `design.md`.
