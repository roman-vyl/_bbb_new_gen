# trade-exit-management-runtime-v2 — implementation tasks

Research master-plan reference: `docs/research/21_state_driven_exit_management_v1.md` (phases 1–5 = this change).

**Execution rule:** complete each slice, run tests, hit STOP checkpoint, obtain review approval **before** starting the next slice.

**Layer order (same discipline as v1):** backend JSON report proven end-to-end (Slices 5–6) **before** `research_api` (Slice 7) and frontend (Slice 8).

---

## Slice 1 — Contracts & parsing

**Goal:** Extend `ExitManagementSpec` for `mode: managed`, `take_management`, and v2 management rule shapes without behavior changes yet.

**Scope:**
- `research/strategies/ema_pullback/spec.py` — `mode: managed`, `take_management[]`, management rule dataclasses (`rule_id`, `component_id`, `activate_when.phase_at_least`, `params`). `phase_runtime_exit`: `params.exit_price: "close"` only; no `trigger` field in v2.
- Validation: `diagnostic_only` still rejects non-empty management arrays; `managed` accepts them.
- Component id allowlist for v1 pack: `break_even_stop`, `lock_profit_stop`, `take_profile_switch`, `phase_runtime_exit`.
- `lock_profit_stop` params (required in contract): `lock_atr` (> 0), `atr_period` (default 14), optional `atr.timeframe`. **Must be fully implemented in Slice 3** — not a stub.
- `take_profile_switch` actions: `keep_initial`, `disable_fixed_tp`, `extend_safety_tp_atr`.
- `phase_runtime_exit` params: `exit_price: "close"` only in v2; **no `trigger` sub-object**; reject configs with `trigger` or non-`close` exit_price.
- Document relationship: `exit_policy` unchanged; managed runtime consumes effective `exit_policy` outputs only — does not evaluate or reinterpret HTF context.

**Out of scope:**
- Runtime loop, arbitration, report serialization, API, frontend, Composer editors.
- Component-based `phase_rules` (`component_id` conditions).
- Legacy `break_even_stop` authoring revival.

**Acceptance criteria:**
- [x] Parser round-trips fixture managed config with all three management arrays.
- [x] `diagnostic_only` + non-empty `stop_management` still fails validation.
- [x] `managed` + empty management arrays validates.
- [x] Unknown `component_id` or `take_profile_switch` action fails validation with clear error.

**Tests:**
- [x] 1.1 Add/extend `tests/test_exit_management_contracts.py` for managed mode and `take_management`.
- [x] 1.2 Add fixture JSON under `research/experiments/configs/fixtures/` for managed empty arrays (no behavior yet) and a parsing fixture that round-trips `lock_profit_stop` params (`lock_atr`, `atr_period`).

- [x] 1.3 Implement spec types and validation in `spec.py`.
- [x] 1.4 Wire validation errors into existing config load path.

### STOP — Checkpoint 1: Contracts & parsing review

**Review:** confirm managed contract, mode coexistence, `exit_policy` / HTF non-goals, component allowlist.  
**Do not proceed** to Slice 2 until approved.

---

## Slice 2 — Managed runtime core

**Goal:** Bar-by-bar managed loop skeleton with `ActiveManagementSnapshot`, uniform event emission stubs, and **empty-array baseline parity**.

**Scope:**
- `research/strategies/ema_pullback/execution/trade_runtime.py` — managed loop entry point.
- Domain types: `ActiveManagementSnapshot`, `ExitCandidate` (minimal fields), `ManagedExitContext`.
- Uniform event types enumerated; emit `phase_changed` + no-op layer events as applicable; `exit_executed` attribution stub.
- `backtest.py` / managed bar loop integration hook — research path only, not vectorbt callback source of truth.
- `mode: managed` + empty arrays → same trades/PnL/PF/exit_reasons as omitting `exit_management`.

**Out of scope:**
- Behavior-changing component evaluators (Slice 3).
- Arbitration winner selection beyond passthrough to existing exit path when no managed candidates (Slice 4).
- Report field extensions beyond what diagnostic already emits.
- Second portfolio / shadow trades.

**Acceptance criteria:**
- [ ] Managed loop runs bar-by-bar for each open trade in research execution.
- [ ] `ActiveManagementSnapshot` exists for all three layers (may be empty/neutral).
- [ ] Empty management arrays: parity tests green vs baseline.
- [ ] `diagnostic_only` tests still green (unchanged).

**Tests:**
- [ ] 2.1 Create `tests/test_trade_runtime_managed_core.py` — empty-array parity.
- [ ] 2.2 Re-run `tests/test_trade_runtime_diagnostics.py` — no regression.

- [ ] 2.3 Implement managed loop skeleton and snapshot types.
- [ ] 2.4 Integrate managed hook in `backtest.py` behind `mode == "managed"`.
- [ ] 2.5 Emit uniform event type constants / dataclass shapes (full emission completed in later slices).

### STOP — Checkpoint 2: Managed runtime core review

**Review:** loop placement, parity proof, no second trade path, event model shape.  
**Do not proceed** to Slice 3 until approved.

---

## Slice 3 — Active management component pack v1

**Goal:** One component evaluator per layer — each produces candidates, snapshot updates, and events. **No close ownership yet** (that is Slice 4).

**Scope:**

| Layer | Components |
|-------|------------|
| `stop_management` | `break_even_stop`, `lock_profit_stop` (minimal working: entry ± `lock_atr`×ATR, side-aware, tighten-only) |
| `take_management` | `take_profile_switch` (`keep_initial`, `disable_fixed_tp`, `extend_safety_tp_atr`) |
| `runtime_exits` | `phase_runtime_exit` (phase-gated exit at bar `close`; `params.exit_price: "close"` only) |

- Evaluators update `ActiveManagementSnapshot` and emit `active_stop_updated`, `active_take_updated`, `runtime_exit_triggered`.
- Multi stop-rule merge: tightest protective stop (long) / documented policy.
- New managed `break_even_stop` only — not legacy combiner shape.

**Out of scope:**
- Exit arbitration and trade close (Slice 4) — evaluators produce candidates/state/events only.
- Final close ownership, `exit_executed`, PnL/outcome changes vs baseline.
- Report serialization (Slice 5).
- ADX/EMA/runner components.
- Composer UI.

**Acceptance criteria:**
- [ ] Each layer produces at least one **candidate** or **snapshot update** on a fixture (stop price, take profile, runtime exit signal).
- [ ] `break_even_stop`: after `protected`, `active_stop_updated` emitted and managed stop **candidate** present at breakeven (+ buffer); no assertion that trade closes yet.
- [ ] `lock_profit_stop`: when active, `active_stop_updated` emitted and stop **candidate** at entry ± `lock_atr`×ATR (side-aware); tighten-only verified in unit test; no close assertion yet.
- [ ] `take_profile_switch`: when `disable_fixed_tp` active, `active_take_updated` emitted and take profile reflects disabled fixed TP; managed TP **candidate set** altered (not final close).
- [ ] `phase_runtime_exit`: when `activate_when` phase is met, `runtime_exit_triggered` emitted and exit **candidate** at bar close price; no `trigger` / pattern evaluation.
- [ ] Per-layer unit tests pass in isolation (evaluator → snapshot/candidate/events only).
- [ ] **No** outcome-vs-baseline or trade-count/PnL assertions in Slice 3.

**Tests:**
- [ ] 3.1 `tests/test_managed_stop_components.py`
- [ ] 3.2 `tests/test_managed_take_components.py`
- [ ] 3.3 `tests/test_managed_runtime_exit_components.py`
- [ ] 3.4 Fixture: `smoke_managed_component_pack_v2.json` (or per-layer fixtures)

- [ ] 3.5 Implement `break_even_stop` evaluator.
- [ ] 3.6 Implement `lock_profit_stop` evaluator (entry ± `lock_atr`×ATR, tighten-only, ATR missing → skip bar).
- [ ] 3.7 Implement stop merge (tightest protective for long / loosest protective for short).
- [ ] 3.8 Implement `take_profile_switch` evaluator.
- [ ] 3.9 Implement `phase_runtime_exit` evaluator (active when `phase_at_least` met → candidate at `close`; no pattern triggers).
- [ ] 3.10 Wire evaluators into managed loop (pre-arbitration).

### STOP — Checkpoint 3: Active layer / component contract review

**Review:** component params, activation semantics, legacy BE separation, candidate/snapshot/event outputs — **not** close behavior.  
**Do not proceed** to Slice 4 until approved.

---

## Slice 4 — Exit arbitration

**Goal:** `ExitArbitrator` with `same_bar_policy: "v1"` across `exit_policy` and `exit_management` candidates.

**Scope:**
- `research/strategies/ema_pullback/execution/exit_arbitration.py` (new module or equivalent).
- Collect candidates: initial SL, managed active stop, initial/managed TP, runtime exit, signal exits.
- Consume **effective `exit_policy` outputs/candidates** from the existing exit-policy pipeline as arbitration inputs. Do **not** evaluate HTF context in managed runtime; do **not** duplicate or reinterpret HTF profile switching.
- Winner → managed trade close in research path; `exit_rule_triggered` + `exit_executed` with `exit_layer`, `exit_rule_id`, `exit_component_id`, optional `losing_candidates`, `same_bar_policy`.

**Out of scope:**
- OHLC intrabar priority v2.
- Report serialization (Slice 5).
- API, frontend, comparison tooling.

**Acceptance criteria:**
- [ ] Managed candidates from Slice 3 enter arbitration and can **win** close selection.
- [ ] Behavior-changing outcome: managed config with non-empty rules **differs** from empty managed config / baseline on at least one fixture (trade close bar, exit reason, or PnL).
- [ ] `break_even_stop` end-to-end: protected → BE → trade closes via `exit_management` (`exit_layer`, `exit_rule_id`, `exit_component_id`).
- [ ] Same-bar multi-candidate fixtures resolve deterministically per v1 priority.
- [ ] Initial SL wins over managed stop when both hit (v1 policy).
- [ ] Managed stop wins over TP when both hit (v1 policy).
- [ ] `exit_layer` correctly `exit_policy` vs `exit_management`.

**Tests:**
- [ ] 4.1 `tests/test_exit_arbitration.py` — matrix of same-bar conflicts.
- [ ] 4.2 Integration test: managed BE close end-to-end through arbitrator (first outcome-changing proof).
- [ ] 4.3 Outcome-vs-empty-managed parity/break test on component-pack fixture.

- [ ] 4.4 Implement `ExitArbitrator` and v1 policy table.
- [ ] 4.5 Connect arbitrator to managed loop close path (Slice 3 candidates → winning close).
- [ ] 4.6 Record `losing_candidates` metadata where specified.

### STOP — Checkpoint 4: Exit arbitration review

**Review:** priority table, exit_policy candidate sourcing (effective outputs only — no HTF in managed runtime), close path ownership.  
**Do not proceed** to Slice 5 until approved.

---

## Slice 5 — Backend report serialization only

**Goal:** Serialize managed runtime output into research JSON report — **research layer only**, no API or frontend.

**Scope:**
- `research/strategies/ema_pullback/execution/results.py` — per-trade managed fields (`phase_at_exit`, `active_stop_at_exit`, `active_take_at_exit`, `exit_layer`, `exit_rule_id`, `exit_component_id`).
- `trade_management_events` — full uniform event set.
- Variant `trade_management_summary` — `exit_layer_breakdown`, `stop_management_breakdown`, `take_management_breakdown`, `runtime_exit_breakdown`.
- `baseline_vs_managed_summary` — **placeholder structure only** (population in Slice 9).
- `report_schema_version` 6 backward compatibility preserved.

**Out of scope:**
- `research_api` types/endpoints (Slice 7).
- Frontend (Slice 8).
- Comparison population (Slice 9).
- Composer.

**Acceptance criteria:**
- [ ] Unit tests assert JSON shape for managed fields and breakdowns.
- [ ] Legacy reports without managed fields still parse in tests.
- [ ] Generic breakdown keys — no component-specific report branches.

**Tests:**
- [ ] 5.1 `tests/test_managed_report_contract.py` — serialization unit tests.
- [ ] 5.2 Extend existing report compatibility tests if present.

- [ ] 5.3 Serialize per-trade managed attribution in `results.py`.
- [ ] 5.4 Serialize variant breakdowns and extended event trace.
- [ ] 5.5 Add placeholder `baseline_vs_managed_summary` shape (empty/null until Slice 9).

### STOP — Checkpoint 5: Unified report contract review (backend only)

**Review:** field names, generic breakdown keys, backward compatibility, JSON examples from tests.  
**Do not proceed** to Slice 6 until approved.

---

## Slice 6 — Backend smoke / backend acceptance

**Goal:** Prove managed v2 **end-to-end on research JSON** via `run.py` before any API or frontend work.

**Scope:**
- Run `research/strategies/ema_pullback/run.py` on component-pack fixture (`smoke_managed_component_pack_v2.json` or equivalent).
- Inspect `research/results/latest.json` (or run artifact) for managed fields from Slice 5.
- Document expected smoke output in `openspec/changes/trade-exit-management-runtime-v2/smoke.md`.
- Fix any backend integration gaps found (results wiring, event ordering, trade record shape).

**Out of scope:**
- `research_api` (Slice 7).
- Frontend (Slice 8).
- Comparison tooling (Slice 9).

**Acceptance criteria:**
- [ ] Smoke run completes with `status=ok`.
- [ ] Full report contains `trade_management_events` with managed event types.
- [ ] Closed trades have `exit_layer`, `exit_rule_id`, `exit_component_id` where applicable.
- [ ] `trade_management_summary.exit_layer_breakdown` populated on managed variant.
- [ ] BE path fixture: `exit_layer=exit_management` + `break_even_stop` attribution visible in JSON.
- [ ] `diagnostic_only` parity suite still green.

**Tests:**
- [ ] 6.1 Re-run full backend pytest suite for Slices 1–5.
- [ ] 6.2 Execute smoke run command documented in `smoke.md`.

- [ ] 6.3 Add/commit smoke fixture config if not already present.
- [ ] 6.4 Run smoke; capture checklist of JSON fields verified.
- [ ] 6.5 Write `smoke.md` with command, fixture path, and expected JSON assertions.

### STOP — Checkpoint 6: Backend smoke / backend acceptance review

**Review:** smoke JSON matches spec delta; backend path is trustworthy before BFF.  
**Do not proceed** to Slice 7 until approved.

---

## Slice 7 — API / BFF read support

**Goal:** Expose Slice 5 report fields through `research_api` read-only types and endpoints.

**Scope:**
- `research_api` types mirroring managed report fields and breakdowns.
- Read-only endpoints (or extend existing report endpoints) — same pattern as diagnostic v1.
- No behavior changes in research execution.

**Out of scope:**
- Frontend UI (Slice 8).
- Comparison population (Slice 9).
- Composer.

**Acceptance criteria:**
- [ ] API types match research JSON shape from Slice 6 smoke artifact.
- [ ] Existing report endpoints still serve legacy reports without managed fields.
- [ ] API integration test or contract test against smoke JSON fixture.

**Tests:**
- [ ] 7.1 API contract tests for managed report fields.
- [ ] 7.2 Manual or automated fetch of smoke run report through BFF.

- [ ] 7.3 Add `research_api` types for managed fields.
- [ ] 7.4 Wire read endpoints / response models.
- [ ] 7.5 Verify against smoke JSON from Slice 6.

### STOP — Checkpoint 7: API / BFF read support review

**Review:** API parity with backend JSON; no frontend yet.  
**Do not proceed** to Slice 8 until approved.

---

## Slice 8 — Frontend read-support

**Goal:** Workbench displays unified managed diagnostics from API — read-only.

**Scope:**
- `TradeManagementDiagnosticsPanel` (or successor) — `exit_layer`, layer breakdowns, managed events.
- TypeScript types aligned with `research_api` (Slice 7).
- Show managed fields only when present; no crash on legacy reports.
- Chart: extend existing trade-management markers for new event types where low-cost (optional active stop line deferred).

**Out of scope:**
- Composer managed mode editors.
- HTF overlay changes (unless touched — then verify `workbench-chart-htf-context-overlays`).
- Browser-side metric computation.
- Comparison UI (Slice 9).

**Acceptance criteria:**
- [ ] Managed report renders layer breakdowns without component-specific UI branches.
- [ ] Legacy diagnostic-only report still renders.
- [ ] Workbench smoke against Slice 6 run artifact via API.
- [ ] `npm test` + `npm run build` pass for touched frontend modules.

**Tests:**
- [ ] 8.1 Frontend unit tests for managed report types/panels.
- [ ] 8.2 Manual Workbench smoke on managed fixture report (post-API).

- [ ] 8.3 Update frontend types from API.
- [ ] 8.4 Render unified managed sections in diagnostics panel.
- [ ] 8.5 Optional: chart markers for `active_stop_updated` / `exit_rule_triggered`.

### STOP — Checkpoint 8: Frontend read-support review

**Review:** UI parity with API contract, legacy report safety.  
**Do not proceed** to Slice 9 until approved.

---

## Slice 9 — Comparison tooling

**Goal:** Generic baseline vs managed analysis; populate `baseline_vs_managed_summary`; BE labels derived, not schema-first.

**Scope:**
- Comparison helper (research script or report post-processor) for paired baseline/managed runs.
- Populate `baseline_vs_managed_summary`: `saved_by_managed_stop`, `hurt_by_managed_stop`, `take_disabled_then_won/lost`, `runtime_exit_helped/hurt`, `exit_layer_transition_matrix`.
- Wire population into report path or documented standalone diff command.
- Document paired-run workflow in change folder or research experiments README snippet.

**Out of scope:**
- Composer.
- Component state rules.
- Runner pack.

**Acceptance criteria:**
- [ ] Paired fixture runs produce non-empty `baseline_vs_managed_summary` where outcomes differ.
- [ ] `be_helped`/`be_hurt` computable from `stop_management_breakdown` without separate schema fields.
- [ ] Transition matrix covers `exit_policy` → `exit_management` moves.

**Tests:**
- [ ] 9.1 `tests/test_managed_comparison.py` on synthetic paired trade sets.

- [ ] 9.2 Implement comparison aggregator.
- [ ] 9.3 Wire into report generation or standalone diff command.
- [ ] 9.4 Add experiment fixture pair for manual validation.

### STOP — Checkpoint 9: Comparison tooling review

**Review:** metric definitions, paired-run ergonomics.  
**Do not proceed** to Slice 10 until approved.

---

## Slice 10 — Final smoke / archive readiness

**Goal:** End-to-end validation across all layers and archive checklist.

**Scope:**
- Full pytest suite for Slices 1–9.
- Frontend build CI parity.
- Re-run backend smoke (Slice 6) + Workbench spot-check (Slice 8) on same fixture.
- Confirm non-goals untouched: `data_engine/`, Composer authoring, runner pack, component state rules.
- `openspec validate trade-exit-management-runtime-v2 --strict` at change level.

**Out of scope:**
- Archive merge itself (unless explicitly requested).
- Future phases 6–8 from research doc.

**Acceptance criteria:**
- [ ] All Slice 1–9 tests green.
- [ ] `diagnostic_only` parity suite green.
- [ ] Backend smoke + frontend read smoke both pass on component-pack fixture.
- [ ] `git diff --stat data_engine/` empty.
- [ ] `openspec validate trade-exit-management-runtime-v2 --strict` passes.

**Tests:**
- [ ] 10.1 `python -m pytest tests/test_exit_management_contracts.py tests/test_trade_runtime_diagnostics.py tests/test_trade_runtime_managed_core.py tests/test_managed_stop_components.py tests/test_managed_take_components.py tests/test_managed_runtime_exit_components.py tests/test_exit_arbitration.py tests/test_managed_report_contract.py tests/test_managed_comparison.py -q`
- [ ] 10.2 `cd frontend && npm test && npm run build`
- [ ] 10.3 Re-run backend smoke per `smoke.md`.
- [ ] 10.4 Final review against `docs/research/21_state_driven_exit_management_v1.md` phases 1–5 checklist.

### STOP — Checkpoint 10: Final smoke / archive readiness review

**Review:** ready for `/opsx:archive` or follow-up changes for research phases 6–8.  
**Stop** — no further implementation in this change without new proposal.

---

## Future work (outside this change — do not implement here)

- [ ] Component-based state rules (`phase_rules` with `component_id`) — research phase 6.
- [ ] Runner management pack (ADX/DI, EMA trail, exhaustion) — research phase 7.
- [ ] Composer managed mode + management editors — research phase 8.
- [ ] OHLC intrabar priority v2.
- [ ] Partial take / scale-out.
- [ ] Chart active stop line overlay (optional).
