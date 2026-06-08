## Context

- **Foundation:** `openspec/specs/trade-exit-management-runtime/` (archived v1) — `diagnostic_only`, `phase_rules`, post-hoc or parallel diagnostic trace, `phase_changed` / `exit_executed`.
- **Master-plan:** `docs/research/21_state_driven_exit_management_v1.md` — state vs management rule split, eight research phases; **this change implements research phases 1–5** (pipe) only.
- **Execution model:** existing research execution/backtest layer (`backtest.py`) owns position lifecycle; `exit_management` is a managed state/candidate **provider** called for already-open positions — not a separate trade simulation engine.
- **Stakeholders:** research backtests, JSON reports, Workbench read-only diagnostics.

## Goals / Non-Goals

**Goals:**

- Add `managed` as a coexisting behavior-changing mode; keep `diagnostic_only` as permanent parity control.
- Build managed exit provider with all three active layers present in architecture from slice 1.
- Ship component pack v1 (one simple component per layer) behind unified contracts.
- Arbitrate exits between `exit_policy` and `exit_management` with explicit v1 same-bar policy.
- Emit generic managed report/API fields usable by any future component without schema churn.
- Deliver generic baseline vs managed comparison tooling.
- Deliver Workbench Composer authoring for v2 `exit_management` (Slice 10 v1).

**Non-Goals:**

- Replacing or migrating `exit_policy` / Composer exit-policy UI into management rules.
- Component-based `phase_rules` (`component_id` conditions) — future change (research phase 6).
- Runner pack (ADX/DI, EMA trail, structure stop, exhaustion triggers) — future change (research phase 7).
- `data_engine/` changes; vectorbt callback redesign; legacy BE combiner runtime path; adapter-based execution combiner redesign; legacy JSON migration.
- OHLC intrabar path modeling v2; partial take / scale-out.
- Browser-side exit arbitration or PnL recomputation.
- Slice 10 v1: baseline-vs-managed comparison UX, compare runner from Composer, chart overlays (see Future work).

## Runtime modes and migration from v1 foundation

| Mode | Behavior |
|------|----------|
| *(absent)* | Legacy: no trade-management diagnostics; `exit_policy` only. |
| `diagnostic_only` | **Unchanged from v1.** Phase trace + diagnostics; **no** exit feedback; rejects non-empty management arrays. |
| `managed` | Managed exit provider for open trades; execution layer may change exit bar/price/reason when non-empty management rules supply winning candidates. |

**Semantics (critical):**

- `diagnostic_only` is **not** deprecated; it remains the control mode for parity experiments.
- `managed` is **additive**; configs choose mode explicitly.
- `managed` + **empty** `stop_management`, `take_management`, `runtime_exits` → **baseline parity** (trade count, PnL, PF, exit reasons). Behavior-changing effects start only with non-empty management rules.
- `phase_rules` semantics unchanged; they only change phase state, never close trades directly.

**Migration (v1 modes):** no breaking change to existing `diagnostic_only` configs, configs without legacy `exit_management` shape, or reports without managed fields. New optional fields on managed reports only.

**Breaking (Slice 4.5):** configs using legacy `exit_management.always_on` / `profiles` / R-trigger `break_even_stop` are **rejected** — manual rewrite to v2 `stop_management` required. No auto-migration.

## Relationship with existing exit_policy and HTF context

```text
trade_management
├── exit_policy          # initial / fallback layer (unchanged ownership)
│   ├── always_on + profiles (side + htf_context.state)
│   ├── initial SL, initial TP, signal exits
│   └── HTF-context-gated exit profile selection — stays here
└── exit_management      # runtime overlay (v2 managed)
    ├── phase_rules      # state only
    ├── stop_management
    ├── take_management
    └── runtime_exits
```

**Decisions:**

1. **`exit_policy` is not removed or merged** into management rules in v2. Composer exit-policy section stays as-is.
2. **HTF context ownership stays in `exit_policy`.** The execution layer consumes **effective `exit_policy` outputs/candidates** from the existing pipeline (including HTF-gated profile selection). The managed exit provider **does not** evaluate HTF context itself and **must not** duplicate or reinterpret HTF context for profile selection.
3. **`exit_policy` role:** initial SL, initial TP, signal exits — emergency/fallback layer. Execution layer always considers `exit_policy` candidates alongside managed provider candidates.
4. **`exit_management` role:** managed exit provider for open positions — phase tracking, active stop, take profile switch, runtime forced exits. Attribution on close uses `exit_layer: exit_policy | exit_management`.
5. **No HTF logic in management `activate_when` v2** — activation uses `phase_at_least` only. HTF-gated management is future work.

## Execution ownership boundary

`exit_management` is **not** the execution layer.

### Entry pipeline (unchanged owner)

The existing entry pipeline remains the sole owner of entry decision generation. It computes `entries` / `short_entries` from setup, blocker, trigger, and direction logic. `exit_management` MUST NOT inspect, import, or recompute entry logic.

### Execution / backtest layer (lifecycle owner)

The existing execution/backtest layer owns position lifecycle:

- opening positions from precomputed entry signals;
- holding open position state;
- requesting effective `exit_policy` candidates from the existing exit-policy pipeline;
- requesting managed candidates, snapshot, and events from the `exit_management` provider for already-open positions;
- selecting and applying close decisions (optionally via `ExitArbitrator`).

`exit_management` MUST NOT open trades, consume `entries` / `short_entries` as an entry owner, or replace the execution/backtest layer.

### exit_policy (initial / fallback layer)

`exit_policy` remains the declarative owner of initial SL/TP/signal exits and HTF-context-gated profile selection. The execution layer consumes its effective outputs; the managed provider does not evaluate HTF context or mutate `exit_policy` config.

### exit_management (managed exit provider)

For already-open positions, `exit_management` is a **managed state / candidate provider**. It owns:

- `TradeRuntimeState` / phase tracking;
- `ActiveManagementSnapshot`;
- `stop_management`, `take_management`, and `runtime_exits` evaluation;
- managed events;
- managed exit candidates derived from inherited snapshot state.

`exit_management` does **not** own:

- entry signal generation;
- opening trades;
- full position lifecycle loop;
- second portfolio or shadow trades;
- HTF profile switching;
- `exit_policy` mutation.

### Provider call pattern (per open position, per bar)

The execution layer calls the managed exit provider once per bar for each open trade:

1. **Bar open:** pass inherited snapshot; receive bar-open-active managed candidates.
2. **Bar close (if still open):** pass bar OHLC and runtime state; receive end-of-bar snapshot update, phase events, and managed layer events effective from the next bar.

Close is applied by the **execution layer** after combining `exit_policy` candidates with provider candidates.

## Execution routing (decision — single managed runtime path)

**Decision (post–Checkpoint 4):** remove legacy BE combiner as a runtime path. Do **not** build a unified `execution_combiner` or adapter shim (reverted `e5724b1` remains rejected).

`backtest.run_strategy_spec` SHALL use **two** execution paths only:

| Path | Gate | Implementation |
|------|------|----------------|
| **Default** | No behavior-changing managed rules (`mode` absent, `diagnostic_only`, or `managed` with empty management arrays) | `vectorbt.Portfolio.from_signals` + `exit_policy` |
| **v2 managed** | `mode=managed` + non-empty `stop_management` / `take_management` / `runtime_exits` | `run_managed_execution_loop` → `_run_execution_integrated_strategy_spec` |

**Removed / forbidden:**

- `has_exit_management_rules()` as execution-path selector.
- `run_managed_bar_loop` / `_run_managed_strategy_spec` as PnL/runtime path.
- `execution_combiner.py`, `execution_adapters.py`, adapter-based lifecycle owners.
- Legacy config wire `exit_management.always_on` / `profiles` / R-trigger `break_even_stop` rules as a supported runtime shape.

**Legacy shape validation (presence-based):** if `exit_management` contains an `always_on` or `profiles` key **at all** (including empty `rules: []` or empty profile groups), validation SHALL fail with:

`Legacy exit_management shape is no longer supported; use mode=managed with stop_management/take_management/runtime_exits.`

Rejection is **key-presence-based**, not content-based. No compatibility migration.

**Legacy authoring removal (Slice 4.5):** remove production authoring surface for legacy exit_management — not only runtime routing:

- `component_builders.py`: no `break_even_stop_rule(trigger_r, offset_r)`, no legacy `exit_management(always_on, profiles)` builders.
- `components/registry.py`: no catalog entry for trigger_r-based `exit_management`.
- `spec.py`: remove or internalize `ExitManagementRuleSpec(trigger_r)`, `ExitManagementGroupSpec`, `ExitManagementProfilesSpec`, and `ExitManagementSpec.always_on`/`profiles` from the **supported** public contract.

`exit_policy.always_on` / `profiles` MUST remain unchanged.

**`run_managed_bar_loop`:** remove all production call-sites (`backtest.py`, `signal_trace.py`, reports, diagnostics, API/BFF). No “diagnostics-only” exception. Delete or archive; historical tests must not invoke production routing.

**Pre-Slice 4.5 implementation gap (current tree):** `backtest.py` still routes `has_exit_management_rules` → `_run_managed_strategy_spec`; `signal_trace.py` still calls `run_managed_bar_loop`; `instance_loader.py` parses legacy keys when `mode` omitted; `run_managed_execution_loop` still calls `update_end_of_bar_snapshot` on entry bar. Slice 4.5 closes these gaps.

### v2 managed execution stack (sole behavior-changing path)

```text
entries / short_entries  (entry pipeline — unchanged)
  → execution layer open/hold/close (run_managed_execution_loop)
      → exit_policy candidates (existing pipeline outputs)
      → ManagedExitProvider.get_bar_open_candidates (inherited snapshot)
      → ExitArbitrator v1
      → close + exit_rule_triggered / exit_executed
      → ManagedExitProvider.update_end_of_bar_snapshot (if still open)
```

`exit_management` remains a **provider** for already-open trades. Execution layer owns lifecycle and close.

### Bar sequencing (normative)

1. `position_was_open_at_bar_start` captured at bar open.
2. If open at bar start: bar-open candidates → arbitrate → close if winner.
3. Entry only if **not** open at bar start (no same-bar re-entry after close).
4. **Entry bar rule:** if position opened on bar N at close, **do not** call `update_end_of_bar_snapshot` on bar N; first provider end-of-bar update on bar N+1 (OHLC intrabar path unknown before close-entry).
5. **Delayed activation:** snapshot computed at end of bar N active from bar N+1 only.

### Out of scope (explicit)

- Unified execution combiner redesign across legacy + v2.
- Adapter wrappers (`LegacyBreakEvenExitAdapter`, `ManagedExitProviderAdapter`).
- Automatic migration of legacy JSON to v2 wire shape.

Human-readable narrative: `docs/research/21_state_driven_exit_management_v1.md` §17–18.

## Slice / checkpoint execution model

Implementation follows **vertical slices** with mandatory **STOP / review** gates (see `tasks.md`). No slice starts until the previous checkpoint is approved.

| Checkpoint | Slice focus |
|------------|-------------|
| 1 | Contracts & parsing |
| 2 | Managed exit provider core (empty-array parity) |
| 3 | Active layer component pack v1 |
| 4 | Execution integration + managed exit provider |
| 5 | Backend report serialization only |
| 6 | Backend smoke / backend acceptance |
| 7 | API / BFF read support |
| 8 | Frontend read-support |
| 9 | Comparison tooling |
| 10 | Composer authoring v1 (managed exit_management) |
| 11 | Final smoke / archive readiness |

**Principle:** build the **full pipe** (all layers + uniform events/report) with **minimal components** per layer — not all trading hypotheses at once.

**Layer order:** prove backend end-to-end on JSON report (Slice 5–6) **before** `research_api` (Slice 7) and frontend read-support (Slice 8); comparison tooling (Slice 9) **before** Composer authoring (Slice 10); **archive readiness (Slice 11) only after Slice 10** — same discipline as v1.

## Managed exit provider core

**Slices 2–3 (delivered):** post-close **replay** helper builds phase trace, `ActiveManagementSnapshot`, evaluator outputs, and events for unit/isolation tests. Evaluators are pure functions under `execution/managed_components/`. Replay is not the execution owner; it validates provider evaluators only.

**Slice 4+ (execution integration):** the execution layer integrates the managed exit provider for open trades with **delayed activation** — provider snapshot updates on bar N apply from bar N+1; no lookahead from phase changes or newly armed rules on the same bar.

### Provider / execution interaction (normative from Slice 4)

For an open position on bar **N**:

**A. Execution layer starts bar N with:**

- current open position state;
- managed snapshot inherited from end of bar N−1;
- effective `exit_policy` candidates from the existing exit-policy pipeline.

**B. Execution layer asks the managed exit provider for bar-open-active managed candidates** (from inherited snapshot only):

- already-active managed stop;
- already-active take profile effect;
- already-armed runtime exits.

**C. Execution layer selects a close candidate** among `exit_policy` candidates and inherited managed candidates (via `ExitArbitrator`, `same_bar_policy: "v1"`). If a winner hits on bar N OHLC → execution layer closes the position and records `exit_rule_triggered` + `exit_executed`.

**D. If the position remains open**, execution layer calls the provider for end-of-bar state update:

- update MFE/MAE/`bars_in_trade`;
- evaluate `phase_rules`;
- compute next `ActiveManagementSnapshot`;
- emit `phase_changed` / `active_stop_updated` / `active_take_updated` / `runtime_exit_triggered` as appropriate;
- next snapshot is effective from bar N+1.

**E. New managed state computed at end of bar N MUST NOT produce close candidates on bar N.**

**Why:** OHLC does not define intrabar path. A stop, take profile switch, or runtime exit that **first becomes eligible** because of phase/MFE observed on bar N cannot causally affect bar N exits — only bar N+1 onward.

**Domain objects:**

- `ActiveManagementSnapshot` — managed stop/take/runtime state **effective for the next bar** after it is computed.
- `ExitCandidate` — `layer`, `rule_id`, `component_id`, `price`, `bar`, `reason`.
- `ExitArbitrator` — used by execution layer; resolves conflicts among **bar-open-active** candidates only; `same_bar_policy: "v1"`.
- `ManagedExitContext` — bar OHLC, ATR, feature refs for provider evaluators.
- Provider interface (Slice 4): e.g. `get_bar_open_candidates(...)`, `update_end_of_bar_snapshot(...)` — exact names TBD at implementation.

**Integration:** execution layer in `backtest.py` calls the provider; execution layer remains lifecycle owner — not vectorbt callbacks, not a second portfolio.

## Active layers

Three parallel management arrays; each rule: `rule_id`, `component_id`, `activate_when`, `params`. **v2 `phase_runtime_exit` has no `trigger` sub-object** — activation is phase-only via `activate_when`; exit pricing via `params`.

### stop_management (v1 pack)

- `break_even_stop` — BE at/after phase threshold; optional ATR buffer (`buffer_type`, `buffer_atr`, `atr_period`).
- `lock_profit_stop` — **minimal working implementation required in v2** (not contract-only stub):
  - **Formula (side-aware):** long → `entry + lock_atr × ATR`; short → `entry − lock_atr × ATR`.
  - **Tighten-only:** stop price MAY only move in the protective direction (long: up or unchanged; short: down or unchanged). Never loosen once set.
  - **Params:** `lock_atr` (required, > 0), `atr_period` (default 14), optional `atr.timeframe` aligned with existing ATR refs.
  - Missing/non-finite/non-positive ATR on a bar → rule does not update stop on that bar (same guard as `mfe_atr` phase conditions).

**Multi-rule merge:** when multiple active stop rules apply, use tightest protective stop for long / loosest protective for short — fixed in spec. Example: `lock_profit_stop` at entry+0.5 ATR and `break_even_stop` at entry → merged stop is higher of the two for long.

### take_management (v1 pack)

- `take_profile_switch` actions: `keep_initial`, `disable_initial_tp`.
  - `disable_initial_tp` suppresses the initial `exit_policy` take-profit candidate in the managed/execution candidate view only; does not mutate `exit_policy` config or compiled masks; does not disable managed stops or runtime exits.
  - `disable_fixed_tp` MAY remain a deprecated parsing alias normalized to `disable_initial_tp`.

### runtime_exits (v1 pack)

- `phase_runtime_exit` — **phase-gated close at bar close** (no pattern catalog in v2):
  - **Activation:** `activate_when.phase_at_least` only (e.g. `exhaustion`).
  - **Params:** `exit_price: "close"` (only supported value in v2).
  - **Behavior (Slice 3 replay):** when rule is active on a bar, emit `runtime_exit_triggered` and add runtime exit **candidate** at that bar's close price (diagnostics only).
  - **Behavior (Slice 4 integration):** when a rule becomes armed on bar N, runtime exit **candidates** may win closes starting bar N+1 via execution layer; bar N exits use only rules armed through bar N−1.
  - **No `trigger` block** and no `exhaustion_pattern` / component triggers in v2 — future change.

Example:

```json
{
  "rule_id": "exit_on_exhaustion",
  "component_id": "phase_runtime_exit",
  "activate_when": { "phase_at_least": "exhaustion" },
  "params": { "exit_price": "close" }
}
```

**Legacy `break_even_stop`:** deprecated combiner shape remains parse-only compatibility; **new** managed `break_even_stop` uses `activate_when` + uniform events — different contract.

## Execution integration and bar-open arbitration (Slice 4)

**Not in scope for Slice 4:** arbitrating candidates that only became eligible because of provider snapshot updates on the **same** bar.

**Bar-open candidate set** (assembled by execution layer) may include:

- `exit_policy`: initial SL, initial TP (respecting inherited managed take profile in candidate view), signal exits.
- managed provider: managed stop from **inherited** snapshot; runtime exit if **armed in inherited** snapshot.

**v1 `same_bar_policy` priority (high → low)** — among bar-open-active candidates only:

1. initial stop loss (`exit_policy`)
2. managed active stop (`exit_management`) — must have been active before this bar
3. initial take profit (`exit_policy`, unless suppressed by inherited `disable_initial_tp` profile)
4. runtime exit (`exit_management`) — must have been armed before this bar
5. signal exit (`exit_policy`)

**Excluded from same-bar arbitration on bar N:** managed stop, take profile switch, or runtime exit arm that first appears in the snapshot computed **after** bar N provider update (effective bar N+1).

Execution layer records winner on `exit_executed` with `exit_layer`, `exit_rule_id`, `exit_component_id`, `same_bar_policy: "v1"`. Optional `losing_candidates` in metadata.

**Example:** trade reaches `protected` on bar 10 → provider computes `break_even_stop` snapshot end of bar 10 → BE stop can win close starting bar 11, not bar 10.

## Unified managed event / report contract

**Events (all modes that emit trace; managed emits full set):**

`phase_changed` | `active_stop_updated` | `active_take_updated` | `runtime_exit_triggered` | `exit_rule_triggered` | `exit_executed`

**Per closed trade (managed):** `phase_at_exit`, `active_stop_at_exit`, `active_take_at_exit`, `exit_layer`, `exit_rule_id`, `exit_component_id`, `managed_events[]`.

**Variant metrics:** `exit_layer_breakdown`, `stop_management_breakdown`, `take_management_breakdown`, `runtime_exit_breakdown`, `baseline_vs_managed_summary` (populated when comparison run available).

Schema stays backward compatible (`report_schema_version` 6, optional fields).

## Comparison model

Generic baseline vs managed analysis — not BE-specific schema:

- `saved_by_managed_stop` / `hurt_by_managed_stop`
- `take_disabled_then_won` / `take_disabled_then_lost`
- `runtime_exit_helped` / `runtime_exit_hurt`
- `exit_layer_transition_matrix`

`be_helped` / `be_hurt` are **derived views** over `stop_management_breakdown` for `break_even_stop`, not separate report fields.

Comparison requires paired runs (baseline config vs managed config); tooling lives in research layer (Slice 9 — `comparison.md`). Workbench comparison UX is **future work**, not Slice 10 v1.

## Composer authoring v1 (Slice 10)

### Goal

Users configure managed exit rules through Composer and save a correct v2 strategy spec. Composer-generated configs MUST run on the existing backend path without runtime changes.

### Authoring contract

Composer SHALL author only the v2 wire shape:

```text
exit_management
├── mode: diagnostic_only | managed
├── phase_rules[]
├── stop_management[]      # break_even_stop, lock_profit_stop
├── take_management[]    # take_profile_switch
└── runtime_exits[]      # phase_runtime_exit
```

Legacy keys (`always_on`, `profiles`, `trigger_r`, `offset_r`) MUST NOT appear in UI or saved drafts. Validation errors from Slice 4.5 remain the enforcement boundary.

Editors follow existing Composer patterns: catalog-driven component pickers, validate-on-save, schema-aligned params forms. `exit_policy` section stays separate and unchanged.

### Save / load round-trip

- Load saved managed config into Composer without losing `phase_rules`, `stop_management`, `take_management`, or `runtime_exits`.
- Serialize back to the same v2 shape; reference fixture: `exit_management_managed_smoke.json`.
- Non-managed configs (diagnostic_only, legacy-absent exit_management) continue to work unchanged.

### Read UI (unchanged)

Slice 8 report panels, managed breakdowns, and event markers remain as-is. Slice 10 v1 does **not** require new comparison UI or chart overlays.

### Future work (UX testing debt — not Slice 10 v1)

| Topic | Notes |
|-------|--------|
| Baseline-vs-managed UX | Paired/unpaired counts, compare trigger, automatic baseline generation — revisit during Composer testing; CLI (`compare_baseline_managed`) stays Slice 9 |
| Comparison wording | Any future UI MUST describe paired-run diagnostic diff, not causal truth (saved/hurt) |
| Active managed stop line overlay | Deferred |
| Phase / runner / exhaustion bands | Richer chart visualization deferred |

## Out of scope / future phases

Per `docs/research/21_state_driven_exit_management_v1.md`:

| Research phase | Scope | When |
|----------------|-------|------|
| 6 | Component-based state rules (`component_id` phase conditions) | Future change |
| 7 | Runner management pack (ADX/DI, EMA trail, exhaustion) | Future change |
| — | OHLC intrabar priority v2, partial take | Future change |

Composer managed **authoring** moves from research phase 8 into **this change, Slice 10 v1**. Comparison UX and chart overlays remain future work.

## Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|-------------------------|
| `managed` coexists with `diagnostic_only` | Permanent control mode for parity | Replace diagnostic with managed empty-array only — rejected; loses explicit diagnostic semantics |
| Empty management arrays = baseline | Safe incremental rollout | Implicit no-op rules — rejected; harder to validate |
| All three layers in architecture before rich components | Avoid report/API rework per layer | BE-only first slice — rejected per research doc |
| `lock_profit_stop` minimal working in v2 | Two real stop components; no allowlist/behavior gap | Contract-only stub in allowlist — rejected as half-stub risk |
| `phase_runtime_exit` close-at-close, phase-only | Simplest testable runtime exit; no pattern catalog in v2 | `exhaustion_pattern` trigger stub — deferred to future |
| Execution layer owns lifecycle; provider supplies candidates | Clear boundary; no second simulation engine | exit_management as full execution owner — rejected |
| Generic report breakdown by `component_id` | Future components need no schema change | Per-component report sections — rejected |
| `phase_at_least` only for `activate_when` v2 | Minimal activation contract | Full condition component tree — deferred to phase 6 |
| **Delayed activation (causal bar order)** | Removes OHLC lookahead; phase/snapshot updates apply from next bar | Same-bar phase→stop→arbitrate — rejected; ambiguous intrabar ordering |
| **Same-bar policy = bar-open candidates only** | Clear conflict resolution without new-rule same-bar hits | Arbitrate all candidates computed on bar — rejected as lookahead |

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Same-bar priority ambiguity | Freeze `same_bar_policy: v1` for **bar-open-active** set only; record `losing_candidates` |
| Slice 3 replay vs Slice 4 execution integration | Slice 3 tests stay evaluator-isolated; Slice 4 adds provider + execution integration tests |
| Provider path diverges from diagnostic path | Separate test suites; `diagnostic_only` parity tests unchanged |
| HTF profile + managed take interaction | Execution layer consumes effective `exit_policy` TP candidates; provider does not evaluate HTF; test with HTF fixture |
| Scope creep into runner/Composer | Explicit non-goals; STOP gates per slice |
| Legacy BE confusion | Presence-based config rejection; remove runtime + authoring surface; no diagnostics exception for `run_managed_bar_loop` |

## Migration Plan

1. Ship slices 1–11 behind feature-complete tests per checkpoint; Slice 4.5 before Slice 5; Slice 10 (Composer authoring v1) before Slice 11 (archive readiness).
2. **Existing configs without legacy `exit_management` shape:** no change required (including `diagnostic_only`, absent `exit_management`, `managed` empty arrays).
3. **Existing legacy BE configs** using `exit_management.always_on` / `profiles` / `trigger_r`: **breaking** — must be manually rewritten to `mode=managed` + `stop_management` / `take_management` / `runtime_exits`. No auto-migration.
4. New managed configs: opt-in via `mode: managed` + management rules.
5. Rollback: revert to `diagnostic_only` or omit `exit_management` (not to legacy BE wire).

## Open Questions

- Comparison tooling delivery: inline report field vs standalone diff script — decide at slice 9 review.
