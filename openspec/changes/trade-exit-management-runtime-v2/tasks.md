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
- `take_profile_switch` actions: `keep_initial`, `disable_initial_tp` (`disable_fixed_tp` deprecated alias → `disable_initial_tp`).
- `phase_runtime_exit` params: `exit_price: "close"` only in v2; **no `trigger` sub-object**; reject configs with `trigger` or non-`close` exit_price.
- Document relationship: `exit_policy` unchanged; execution layer consumes effective `exit_policy` outputs; managed provider does not evaluate or reinterpret HTF context.

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

## Slice 2 — Managed exit provider core

**Goal:** Managed exit provider skeleton with `ActiveManagementSnapshot`, uniform event emission stubs, and **empty-array baseline parity**.

**Scope:**
- `research/strategies/ema_pullback/execution/trade_runtime.py` — managed provider entry points (replay helper for tests).
- Domain types: `ActiveManagementSnapshot`, `ExitCandidate` (minimal fields), `ManagedExitContext`.
- Uniform event types enumerated; emit `phase_changed` + no-op layer events as applicable; `exit_executed` attribution stub.
- `backtest.py` / managed provider integration hook — research path only, not vectorbt callback source of truth.
- `mode: managed` + empty arrays → same trades/PnL/PF/exit_reasons as omitting `exit_management`.

**Out of scope:**
- Behavior-changing component evaluators (Slice 3).
- Arbitration winner selection beyond passthrough to existing exit path when no managed candidates (Slice 4).
- Report field extensions beyond what diagnostic already emits.
- Second portfolio / shadow trades.

**Acceptance criteria:**
- [x] Managed provider replay runs bar-by-bar for each trade in isolation tests.
- [x] `ActiveManagementSnapshot` exists for all three layers (may be empty/neutral).
- [x] Empty management arrays: parity tests green vs baseline.
- [x] `diagnostic_only` tests still green (unchanged).

**Tests:**
- [x] 2.1 Create `tests/test_trade_runtime_managed_core.py` — empty-array parity.
- [x] 2.2 Re-run `tests/test_trade_runtime_diagnostics.py` — no regression.

- [x] 2.3 Implement managed provider skeleton and snapshot types.
- [x] 2.4 Integrate managed hook in `backtest.py` behind `mode == "managed"`.
- [x] 2.5 Emit uniform event type constants / dataclass shapes (full emission completed in later slices).

### STOP — Checkpoint 2: Managed exit provider core review

**Review:** provider placement, parity proof, no second trade path, event model shape.  
**Do not proceed** to Slice 3 until approved.

---

## Slice 3 — Active management component pack v1

**Goal:** One component evaluator per layer — each produces candidates, snapshot updates, and events. **No close ownership yet** (that is Slice 4).

**Scope:**

| Layer | Components |
|-------|------------|
| `stop_management` | `break_even_stop`, `lock_profit_stop` (minimal working: entry ± `lock_atr`×ATR, side-aware, tighten-only) |
| `take_management` | `take_profile_switch` (`keep_initial`, `disable_initial_tp`) |
| `runtime_exits` | `phase_runtime_exit` (phase-gated exit at bar `close`; `params.exit_price: "close"` only) |

- Evaluators update `ActiveManagementSnapshot` and emit `active_stop_updated`, `active_take_updated`, `runtime_exit_triggered`.
- Multi stop-rule merge: tightest protective stop (long) / documented policy.
- New managed `break_even_stop` only — not legacy combiner shape.

**Out of scope:**
- Causal close path and trade close (Slice 4) — evaluators produce candidates/state/events only; no bar-open arbitration yet.
- Final close ownership, `exit_executed`, PnL/outcome changes vs baseline.
- Report serialization (Slice 5).
- ADX/EMA/runner components.
- Composer UI.

**Acceptance criteria:**
- [x] Each layer produces at least one **candidate** or **snapshot update** on a fixture (stop price, take profile, runtime exit signal).
- [x] `break_even_stop`: after `protected`, `active_stop_updated` emitted and managed stop **candidate** present at breakeven (+ buffer); no assertion that trade closes yet.
- [x] `lock_profit_stop`: when active, `active_stop_updated` emitted and stop **candidate** at entry ± `lock_atr`×ATR (side-aware); tighten-only verified in unit test; no close assertion yet.
- [x] `take_profile_switch`: when `disable_initial_tp` active, `active_take_updated` emitted and take profile reflects suppressed initial TP; managed **candidate view** altered (not final close).
- [x] `phase_runtime_exit`: when `activate_when` phase is met, `runtime_exit_triggered` emitted and exit **candidate** at bar close price; no `trigger` / pattern evaluation.
- [x] Per-layer unit tests pass in isolation (evaluator → snapshot/candidate/events only).
- [x] **No** outcome-vs-baseline or trade-count/PnL assertions in Slice 3.

**Tests:**
- [x] 3.1 `tests/test_managed_stop_components.py`
- [x] 3.2 `tests/test_managed_take_components.py`
- [x] 3.3 `tests/test_managed_runtime_exit_components.py`
- [x] 3.4 Fixture: `smoke_managed_component_pack_v2.json` (or per-layer fixtures) — covered by per-layer unit/replay tests

- [x] 3.5 Implement `break_even_stop` evaluator.
- [x] 3.6 Implement `lock_profit_stop` evaluator (entry ± `lock_atr`×ATR, tighten-only, ATR missing → skip bar).
- [x] 3.7 Implement stop merge (tightest protective for long / loosest protective for short).
- [x] 3.8 Implement `take_profile_switch` evaluator.
- [x] 3.9 Implement `phase_runtime_exit` evaluator (active when `phase_at_least` met → candidate at `close`; no pattern triggers).
- [x] 3.10 Wire evaluators into managed provider replay (pre-arbitration).

### STOP — Checkpoint 3: Active layer / component contract review

**Review:** component params, activation semantics, legacy BE separation, candidate/snapshot/event outputs — **not** close behavior.  
**Do not proceed** to Slice 4 until approved.

---

## Slice 4 — Execution integration + managed exit provider

**Goal:** Integrate the managed exit provider into the existing execution layer **without** making `exit_management` the execution owner. Execution layer remains responsible for open/close lifecycle; provider supplies inherited candidates, end-of-bar snapshots, and events with **delayed activation**.

**Provider / execution interaction (normative):**

1. Execution layer starts bar N with open position state, inherited snapshot, and effective `exit_policy` candidates.
2. Execution layer calls provider `get_bar_open_candidates(...)` — inherited managed stop, take profile effect, armed runtime exits only.
3. Execution layer arbitrates among `exit_policy` + inherited managed candidates (`same_bar_policy: "v1"`); applies close if winner.
4. If still open, execution layer calls provider `update_end_of_bar_snapshot(...)` — MFE/MAE, `phase_rules`, next snapshot, events; snapshot effective from N+1.
5. New provider state from end of bar N MUST NOT produce close candidates on bar N.

**Scope:**
- Define provider interface in research layer (e.g. `ManagedExitProvider` or equivalent: `get_bar_open_candidates`, `update_end_of_bar_snapshot`).
- Wire execution layer (`backtest.py`) to call provider for **already-open** positions only.
- Execution layer opens positions from precomputed `entries` / `short_entries` (existing entry pipeline) — unchanged.
- `research/strategies/ema_pullback/execution/exit_arbitration.py` — `ExitArbitrator` used by execution layer; v1 priority among bar-open-active candidates.
- Collect `exit_policy` candidates from effective pipeline outputs (initial SL/TP/signal; respect inherited `disable_initial_tp` in candidate view). No HTF evaluation in provider.
- Provider builds managed candidates from **inherited snapshot only**.
- Execution layer applies close; emits `exit_rule_triggered` + `exit_executed` with attribution metadata.
- **Delayed activation:** new stop / take switch / runtime arm from end-of-bar update on bar N → eligible from bar N+1.
- Provider MUST NOT import setup/blocker/trigger/direction or consume entries as entry owner.

**Out of scope:**
- exit_management as entry or lifecycle owner; second portfolio; shadow trades.
- OHLC intrabar path modeling v2.
- Arbitrating candidates first eligible from same-bar provider update.
- Report serialization (Slice 5).
- API, frontend, comparison tooling.

**Acceptance criteria:**
- [x] Execution integration: bar-open exit check **before** end-of-bar provider update; next snapshot applies from following bar.
- [x] Managed candidates from inherited snapshot can **win** close selection via execution layer.
- [x] Behavior-changing outcome: managed config with non-empty rules **differs** from empty managed / baseline on at least one fixture.
- [x] Provider never opens a position; provider not called to decide entries.
- [x] Provider does not read setup/blocker/trigger/direction modules.
- [x] `break_even_stop`: phase reaches `protected` on bar N → BE can close on bar **≥ N+1** via execution layer (not bar N).
- [x] Same-bar conflicts among bar-open-active candidates resolve per v1 priority.
- [x] Initial SL wins over already-active managed stop when both hit.
- [x] Already-active managed stop wins over initial TP when both hit.
- [x] Newly activated managed stop on bar N does **not** participate in bar N arbitration.
- [x] `disable_initial_tp` suppresses initial TP in candidate view only; `exit_policy` unchanged.
- [x] `exit_layer` correctly `exit_policy` vs `exit_management`.
- [x] `diagnostic_only` unchanged; managed empty arrays parity unchanged.

**Tests:**
- [x] 4.1 `tests/test_exit_arbitration.py` — bar-open-active conflict matrix.
- [x] 4.2 Provider unit tests — inherited snapshot → managed stop candidate; end-of-bar phase → snapshot effective N+1; no same-bar BE close from newly activated stop.
- [x] 4.3 `tests/test_managed_execution_integration.py` — execution layer closes via managed BE on N+1; opens via precomputed entries only.
- [x] 4.4 Provider not invoked for entry decisions; `diagnostic_only` path unchanged; empty managed arrays parity.

- [x] 4.5 Implement provider interface and wire Slice 3 evaluators for end-of-bar snapshot.
- [x] 4.6 Implement `ExitArbitrator` and v1 policy table (execution layer scope).
- [x] 4.7 Wire execution layer to consume `exit_policy` + provider candidates.
- [x] 4.8 Record `losing_candidates` metadata where specified.

### STOP — Checkpoint 4: Execution integration review

**Review:** execution ownership boundary, provider interface, delayed activation, bar-open arbitration scope, exit_policy candidate sourcing.  
**Do not proceed** to Slice 4.5 until approved.

---

## Slice 4.5 — Legacy path removal & routing cleanup

**Goal:** Single managed runtime path — remove legacy BE combiner execution; reject legacy config wire; fix entry-bar provider lookahead.

**Decision (normative):**

- Keep v2 Slice 4 (`7ab168f`): `ManagedExitProvider` + `ExitCandidate` + `ExitArbitrator` + `run_managed_execution_loop`.
- Remove legacy BE runtime path: no `run_managed_bar_loop` / `_run_managed_strategy_spec` / `has_exit_management_rules` routing for PnL.
- Reject legacy wire **by key presence**: if `exit_management` contains `always_on` or `profiles` keys at all → validation error (including empty `rules: []`). No migration, no adapter shim.
- Do **not** add `execution_combiner.py` / `execution_adapters.py` (reverted `e5724b1` stays rejected).
- Future unified combiner redesign is **out of scope**.

**Scope:**

- `backtest.py` routing: only default vectorbt path OR v2 `_run_execution_integrated_strategy_spec`.
- `spec.py` / `instance_loader.py`: **presence-based** rejection — any `always_on` or `profiles` key under `exit_management` fails validation (empty arrays/objects included).
- `run_managed_execution_loop`: skip `update_end_of_bar_snapshot` on entry bar N; first update on N+1.
- **Remove all production call-sites of `run_managed_bar_loop`.** Do not call it from `backtest.py`, `signal_trace.py`, reports, diagnostics, or API/BFF. Delete or archive the loop; no “diagnostics-only” exception.
- Remove legacy authoring surface (see acceptance): builders, registry catalog, public `ExitManagementSpec.always_on`/`profiles` contract. **`exit_policy.always_on`/`profiles` unchanged.**
- Verify `e5724b1` / combiner artifacts absent from tree.

**Out of scope:**

- Legacy JSON auto-migration.
- `execution_combiner` / adapter unification.
- `data_engine/` changes.
- Entry pipeline changes.
- Slice 5+ features beyond routing prerequisites.

**Acceptance criteria:**

- [x] **Presence-based legacy rejection:** any config with `exit_management.always_on` or `exit_management.profiles` key fails validation (including `"rules": []`); documented error string.
- [x] **No production authoring surface for legacy exit_management:**
  - no `break_even_stop_rule(trigger_r, offset_r)` builder;
  - no `exit_management(always_on=…, profiles=…)` legacy BE builder;
  - no registry/catalog entry describing trigger_r-based `exit_management`;
  - no public `ExitManagementSpec.always_on` / `profiles` / `ExitManagementRuleSpec(trigger_r)` runtime contract in supported API.
  - `exit_policy.always_on` / `profiles` **unchanged** — do not touch exit_policy authoring.
- [x] **No `run_managed_bar_loop` production call-sites:** grep-clean for imports/calls from `backtest.py`, `signal_trace.py`, reports, diagnostics, API/BFF.
- [x] `mode=managed` + non-empty management rules routes only to `run_managed_execution_loop`.
- [x] No `has_exit_management_rules` execution-path routing in `backtest.py`; remove `_run_managed_strategy_spec`.
- [x] `diagnostic_only` / managed empty arrays / absent exit_management preserve default vectorbt path and baseline parity.
- [x] Entry bar does not call provider end-of-bar update; first update on N+1.
- [x] Delayed activation tests still pass (snapshot N → active N+1).
- [x] No `execution_combiner`, `execution_adapters`, or adapter-based combiner in codebase.
- [x] Existing Slice 4 tests (`test_exit_arbitration`, `test_managed_exit_provider`, `test_managed_execution_integration`) pass.

**Tests:**

- [x] 4.5.1 Presence-based legacy rejection — empty `always_on.rules: []` and non-empty legacy both fail (`tests/test_exit_management_contracts.py`).
- [x] 4.5.2 Routing matrix — v2 managed vs default path integration tests.
- [x] 4.5.3 Entry-bar no provider update — `tests/test_managed_execution_integration.py`.
- [x] 4.5.4 Legacy BE runtime tests removed or archived — must not import/call production legacy routing (`test_exit_management.py`, `test_exit_management_extended.py`).
- [x] 4.5.5 Static guards: no combiner/adapter modules; no `run_managed_bar_loop` in production modules; no legacy authoring builders in public API.
- [x] 4.5.6 Authoring/registry cleanup tests or static import guards.

- [x] 4.5.7 Implement presence-based validation rejection in `spec.py` / `instance_loader.py`.
- [x] 4.5.8 Remove legacy routing and `_run_managed_strategy_spec` from `backtest.py`.
- [x] 4.5.9 Remove `run_managed_bar_loop` from `signal_trace.py` and all other production call-sites; delete or archive loop module.
- [x] 4.5.10 Remove legacy authoring surface (`component_builders.py`, `components/registry.py`, legacy `ExitManagement*` spec types).
- [x] 4.5.11 Fix entry-bar lookahead in `run_managed_execution_loop`.
- [x] 4.5.12 Sync `docs/research/21_state_driven_exit_management_v1.md` §17–18.

### STOP — Checkpoint 4.5: Single managed path review

**Review:** routing matrix; presence-based legacy rejection; no `run_managed_bar_loop` call-sites anywhere; legacy authoring surface removed; `exit_policy` untouched; entry-bar rule; combiner still absent.  
**Do not proceed** to Slice 5 until approved.

---

## Slice 5 — Backend report serialization only

**Goal:** Serialize managed provider output into research JSON report — **research layer only**, no API or frontend.

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
- [x] Unit tests assert JSON shape for managed fields and breakdowns.
- [x] Legacy reports without managed fields still parse in tests.
- [x] Generic breakdown keys — no component-specific report branches.

**Tests:**
- [x] 5.1 `tests/test_managed_report_contract.py` — serialization unit tests.
- [x] 5.2 Extend existing report compatibility tests if present.

- [x] 5.3 Serialize per-trade managed attribution in `results.py`.
- [x] 5.4 Serialize variant breakdowns and extended event trace.
- [x] 5.5 Add placeholder `baseline_vs_managed_summary` shape (empty/null until Slice 9).

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
- [x] Smoke run completes with `status=ok`.
- [x] Full report contains `trade_management_events` with managed event types.
- [x] Closed trades have `exit_layer`, `exit_rule_id`, `exit_component_id` where applicable.
- [x] `trade_management_summary.exit_layer_breakdown` populated on managed variant.
- [x] BE path fixture: `exit_layer=exit_management` + `break_even_stop` attribution visible in JSON.
- [x] `diagnostic_only` parity suite still green.

**Tests:**
- [x] 6.1 Re-run full backend pytest suite for Slices 1–5 (94 passed).
- [x] 6.2 Execute smoke run command documented in `smoke.md`.

- [x] 6.3 Add/commit smoke fixture config if not already present.
- [x] 6.4 Run smoke; capture checklist of JSON fields verified.
- [x] 6.5 Write `smoke.md` with command, fixture path, and expected JSON assertions.

### STOP — Checkpoint 6: Backend smoke / backend acceptance review

**Status:** ACCEPTED (2026-06-08). See `smoke.md` for fixtures, commands, and verified JSON checklist.

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
- [x] API types match research JSON shape from Slice 6 smoke artifact.
- [x] Existing report endpoints still serve legacy reports without managed fields.
- [x] API integration test or contract test against smoke JSON fixture.

**Tests:**
- [x] 7.1 API contract tests for managed report fields.
- [x] 7.2 Manual or automated fetch of smoke run report through BFF.

- [x] 7.3 Add `research_api` types for managed fields.
- [x] 7.4 Wire read endpoints / response models.
- [x] 7.5 Verify against smoke JSON from Slice 6.

### STOP — Checkpoint 7: API / BFF read support review

**Status:** ACCEPTED (2026-06-08). Managed report fields pass through `research_api` contracts; smoke artifact + HTTP BFF tests green.

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
- [x] Managed report renders layer breakdowns without component-specific UI branches.
- [x] Legacy diagnostic-only report still renders.
- [x] Workbench smoke against Slice 6 run artifact via API.
- [x] `npm test` + `npm run build` pass for touched frontend modules.

**Tests:**
- [x] 8.1 Frontend unit tests for managed report types/panels.
- [x] 8.2 Manual Workbench smoke on managed fixture report (post-API).

- [x] 8.3 Update frontend types from API.
- [x] 8.4 Render unified managed sections in diagnostics panel.
- [x] 8.5 Optional: chart markers for `active_stop_updated` / `exit_rule_triggered`.

### STOP — Checkpoint 8: Frontend read-support review

**Status:** ACCEPTED (2026-06-08). Managed diagnostics read-only in Reports/Chart; string `trade_id` default focus fixup included.

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
- [x] Paired fixture runs produce non-empty `baseline_vs_managed_summary` where outcomes differ.
- [x] `be_helped`/`be_hurt` computable from `stop_management_breakdown` without separate schema fields.
- [x] Transition matrix covers `exit_policy` → `exit_management` moves.

**Tests:**
- [x] 9.1 `tests/test_managed_comparison.py` on synthetic paired trade sets.

- [x] 9.2 Implement comparison aggregator.
- [x] 9.3 Wire into report generation or standalone diff command.
- [x] 9.4 Add experiment fixture pair for manual validation.

### STOP — Checkpoint 9: Comparison tooling review

**Review:** metric definitions, paired-run ergonomics. See `comparison.md`.  
**Do not proceed** to Slice 10 until approved.

---

## Slice 10 — Composer / managed exit management UX

**Goal:** Workbench Composer authoring and visualization for v2 `exit_management` — users can author, validate, and inspect managed configs without legacy wire shapes. Archive readiness (Slice 11) MUST NOT start until this slice is complete.

**Scope:**

### 10.A — Composer authoring UI (`exit_management` v2 shape)

Catalog/schema-driven editors (match existing Composer conventions — no ad-hoc legacy terminology):

| Section | Editor scope |
|---------|----------------|
| Mode | `exit_management.mode` — `diagnostic_only` \| `managed` |
| Phase rules | `phase_rules[]` — `rule_id`, `to_phase`, `condition` (`mfe_atr` + ATR ref) |
| Stop management | `stop_management[]` — `break_even_stop`, `lock_profit_stop` |
| Take management | `take_management[]` — `take_profile_switch` (`keep_initial`, `disable_initial_tp`) |
| Runtime exits | `runtime_exits[]` — `phase_runtime_exit` (`activate_when.phase_at_least`, `params.exit_price: "close"`) |

Each rule row: `rule_id`, `component_id`, `activate_when`, `params` per component contract from Slice 1.

**Forbidden in UI and serialized draft output:**

- `exit_management.always_on` / `exit_management.profiles`
- `trigger_r`, `offset_r`, `apply_once` on management rules
- Legacy `break_even_stop_rule` authoring or R-trigger terminology
- Any UI path that reintroduces removed registry/catalog legacy BE surface

`exit_policy` Composer section **unchanged** — do not merge exit-policy and exit-management editors.

### 10.B — Validation / catalog integration

- Reuse existing Composer validate → `POST /api/research/config/validate` flow.
- Component pickers driven by catalog where the project already does so for `exit_policy`.
- Serialize drafts with v2 keys only (`mode`, `phase_rules`, `stop_management`, `take_management`, `runtime_exits`).
- Client-side guards MAY mirror server rejection of legacy keys; server validation remains source of truth.
- **No** backend runtime semantics changes; **no** execution path changes; **no** `data_engine/` changes.

### 10.C — Baseline-vs-managed UX (Workbench)

Design and implement Workbench UX around paired comparison (see `comparison.md` for research-layer helper). Wording MUST NOT imply saved/hurt categories prove causal attribution — they are **paired-run diagnostic diffs**.

**Minimum (required in Slice 10):**

- When `baseline_vs_managed_summary` is placeholder/empty: show explicit **“comparison not generated”** state (not silent empty panel).
- UI contract for future compare trigger: document/run affordance placeholder (button, menu item, or documented manual CLI path) without hiding Slice 9 tooling.
- When populated: show paired/unpaired counts, category list sizes, transition matrix summary.
- Copy/disclaimer: paired diff is observational; not causal proof.

**Full compare UX (implement if scope allows; otherwise defer sub-features inside Slice 10, not to a new change):**

- Baseline selection: same `experiment_id` / variant params with `diagnostic_only` or baseline managed-empty config.
- Managed run launch from Composer (existing backtest/run flow).
- Compare step: invoke `compare_baseline_managed` (CLI wrapper or BFF endpoint — decide at implementation; no new execution semantics).
- Render `saved_by_managed_stop`, `hurt_by_managed_stop`, `take_disabled_then_won/lost`, `runtime_exit_helped/hurt`, `exit_layer_transition_matrix`.
- `be_helped` / `be_hurt` as derived labels only (filter `break_even_stop` entries or breakdown view) — **no** new schema fields.

### 10.D — Chart visualization (frontend only)

- Improve existing managed event markers from Slice 8 where low-cost.
- **Active managed stop line overlay** — in scope for Slice 10 (read from report/trace fields; no trading logic on frontend).
- Phase / protected / runner / exhaustion band visualization — **optional or staged** within Slice 10 (document in implementation notes if deferred).
- No browser-side exit arbitration or PnL recomputation.

**Out of scope:**

- Backend runtime / execution architecture changes.
- `data_engine/`.
- Component-based `phase_rules` (`component_id` conditions) — research phase 6.
- Runner pack (ADX/EMA trail) — research phase 7.
- Archive / spec merge (Slice 11).
- Misleading causal copy for comparison categories.

**Acceptance criteria:**

- [ ] Composer exposes v2 `exit_management` sections: mode, phase_rules, stop_management, take_management, runtime_exits.
- [ ] Authoring `break_even_stop` and `lock_profit_stop` under `stop_management` with `activate_when.phase_at_least` — no legacy fields in saved JSON.
- [ ] Authoring `take_profile_switch` with `keep_initial` and `disable_initial_tp`.
- [ ] Authoring `phase_runtime_exit` with `params.exit_price: "close"` only.
- [ ] Saved draft fails validation if legacy `always_on`/`profiles` keys present; UI does not offer legacy authoring paths.
- [ ] Validate + serialize round-trip managed smoke fixture shape (`exit_management_managed_smoke.json`).
- [ ] Baseline-vs-managed panel shows **comparison not generated** for single-run managed reports (placeholder).
- [ ] Compared artifact renders category counts and transition matrix; disclaimer copy present.
- [ ] Chart: managed event markers still work on managed smoke report; active stop line overlay implemented or explicitly staged with follow-up note in slice review.
- [ ] `npm test` + `npm run build` pass for touched frontend modules.
- [ ] No `data_engine/` diff from Slice 10 work.

**Tests:**

- [ ] 10.1 Frontend unit tests — v2 exit_management draft serialization / validation guards.
- [ ] 10.2 Composer smoke — author managed config matching `exit_management_managed_smoke.json` structure; validate OK.
- [ ] 10.3 Workbench — load managed smoke report; comparison empty state + compared artifact state (manual or fixture).
- [ ] 10.4 Chart — managed markers + stop line overlay smoke on managed fixture.

- [ ] 10.5 Implement Composer managed exit_management editors.
- [ ] 10.6 Wire catalog-driven component pickers and params forms.
- [ ] 10.7 Implement comparison UX (minimum empty state + populated view).
- [ ] 10.8 Chart visualization improvements (markers + stop line overlay).

### STOP — Checkpoint 10: Composer / managed exit management UX review

**Review:** v2 authoring shape only; no legacy wire; comparison UX honest labeling; chart overlays read-only.  
**Do not proceed** to Slice 11 until approved.

---

## Slice 11 — Final smoke / archive readiness

**Goal:** End-to-end validation across all layers (including Composer UX from Slice 10) and archive checklist. **Archive readiness runs only after Slice 10 is accepted.**

**Scope:**
- Full pytest suite for Slices 1–9 (backend) plus frontend tests from Slice 10.
- Frontend build CI parity (`npm test`, `npm run build`).
- Re-run backend smoke (Slice 6) + comparison smoke (`comparison.md`).
- Workbench spot-check: Slice 8 read-support + Slice 10 Composer/compare/chart on managed smoke fixtures.
- Composer manual acceptance checklist (author managed smoke config end-to-end).
- Confirm non-goals untouched: `data_engine/`, runner pack, component state rules.
- `openspec validate trade-exit-management-runtime-v2 --strict` at change level.

**Out of scope:**
- Archive merge itself (unless explicitly requested).
- Research doc phases 6–7 (component state rules, runner pack).

**Acceptance criteria:**
- [ ] All Slice 1–9 backend tests green.
- [ ] Slice 10 frontend tests + build green.
- [ ] `diagnostic_only` parity suite green.
- [ ] Backend smoke + comparison smoke pass per `smoke.md` / `comparison.md`.
- [ ] Composer smoke: managed config authors, validates, saves without legacy keys.
- [ ] Workbench: managed report read + comparison states + chart overlays spot-check.
- [ ] `git diff --stat data_engine/` empty.
- [ ] `openspec validate trade-exit-management-runtime-v2 --strict` passes.

**Tests:**
- [ ] 11.1 `python -m pytest tests/test_exit_management_contracts.py tests/test_trade_runtime_diagnostics.py tests/test_trade_runtime_managed_core.py tests/test_managed_stop_components.py tests/test_managed_take_components.py tests/test_managed_runtime_exit_components.py tests/test_exit_arbitration.py tests/test_managed_execution_integration.py tests/test_managed_report_contract.py tests/test_managed_comparison.py -q`
- [ ] 11.2 `cd frontend && npm test && npm run build`
- [ ] 11.3 Re-run backend smoke per `smoke.md`.
- [ ] 11.4 Re-run paired comparison smoke per `comparison.md`.
- [ ] 11.5 Composer manual acceptance + Workbench spot-check (Slice 10 fixtures).
- [ ] 11.6 Final review against `docs/research/21_state_driven_exit_management_v1.md` phases 1–5 checklist.

### STOP — Checkpoint 11: Final smoke / archive readiness review

**Review:** ready for `/opsx:archive` or follow-up changes for research phases 6–7.  
**Stop** — no further implementation in this change without new proposal.

---

## Future work (outside this change — do not implement here)

- [ ] Component-based state rules (`phase_rules` with `component_id`) — research phase 6.
- [ ] Runner management pack (ADX/DI, EMA trail, exhaustion) — research phase 7.
- [ ] OHLC intrabar priority v2.
- [ ] Partial take / scale-out.
