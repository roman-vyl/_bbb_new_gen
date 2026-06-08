## Context

- **Foundation:** `openspec/specs/trade-exit-management-runtime/` (archived v1) — `diagnostic_only`, `phase_rules`, post-hoc or parallel diagnostic trace, `phase_changed` / `exit_executed`.
- **Master-plan:** `docs/research/21_state_driven_exit_management_v1.md` — state vs management rule split, eight research phases; **this change implements research phases 1–5** (pipe) only.
- **Execution model:** research combiner inside `ema_pullback` execution (`backtest.py`, `exit_management.py`); not a second vectorbt portfolio path.
- **Stakeholders:** research backtests, JSON reports, Workbench read-only diagnostics.

## Goals / Non-Goals

**Goals:**

- Add `managed` as a coexisting behavior-changing mode; keep `diagnostic_only` as permanent parity control.
- Build bar-by-bar managed runtime with all three active layers present in architecture from slice 1.
- Ship component pack v1 (one simple component per layer) behind unified contracts.
- Arbitrate exits between `exit_policy` and `exit_management` with explicit v1 same-bar policy.
- Emit generic managed report/API fields usable by any future component without schema churn.
- Deliver generic baseline vs managed comparison tooling.

**Non-Goals:**

- Replacing or migrating `exit_policy` / Composer exit-policy UI into management rules.
- Component-based `phase_rules` (`component_id` conditions) — future change.
- Runner pack (ADX/DI, EMA trail, structure stop, exhaustion triggers) — future change.
- Full Composer authoring for `stop_management` / `take_management` / `runtime_exits`.
- `data_engine/` changes; vectorbt callback redesign; legacy `break_even_stop` product authoring.
- OHLC intrabar path modeling v2; partial take / scale-out.

## Runtime modes and migration from v1 foundation

| Mode | Behavior |
|------|----------|
| *(absent)* | Legacy: no trade-management diagnostics; `exit_policy` only. |
| `diagnostic_only` | **Unchanged from v1.** Phase trace + diagnostics; **no** exit feedback; rejects non-empty management arrays. |
| `managed` | Bar-by-bar overlay; may change exit bar/price/reason when management rules are active. |

**Semantics (critical):**

- `diagnostic_only` is **not** deprecated; it remains the control mode for parity experiments.
- `managed` is **additive**; configs choose mode explicitly.
- `managed` + **empty** `stop_management`, `take_management`, `runtime_exits` → **baseline parity** (trade count, PnL, PF, exit reasons). Behavior-changing effects start only with non-empty management rules.
- `phase_rules` semantics unchanged; they only change phase state, never close trades directly.

**Migration:** no breaking change to existing `diagnostic_only` configs or reports. New optional fields on managed reports only.

## Relationship with existing exit_policy and HTF context

```text
trade_management
├── exit_policy          # initial / fallback layer (unchanged ownership)
│   ├── always_on + profiles (side + htf_context.state)
│   ├── initial SL, safety TP, signal exits
│   └── HTF-context-gated exit profile selection — stays here
└── exit_management      # runtime overlay (v2 managed)
    ├── phase_rules      # state only
    ├── stop_management
    ├── take_management
    └── runtime_exits
```

**Decisions:**

1. **`exit_policy` is not removed or merged** into management rules in v2. Composer exit-policy section stays as-is.
2. **HTF context ownership stays in `exit_policy`.** Managed runtime **does not** evaluate HTF context itself. It consumes the **effective `exit_policy` outputs/candidates** already produced by the existing `exit_policy` pipeline (including any locked/effective profile or precomputed levels/masks/signals). If `exit_policy` locks or gates profiles using HTF context, that behavior remains unchanged and owned by `exit_policy`. Managed runtime **must not** duplicate or reinterpret HTF context for profile selection.
3. **`exit_policy` role:** initial SL, safety TP, signal exits — emergency/fallback layer. Arbitration always considers `exit_policy` candidates alongside managed candidates.
4. **`exit_management` role:** phase-driven overlay — active stop, take profile switch, runtime forced exits. Attribution on close uses `exit_layer: exit_policy | exit_management`.
5. **No HTF logic in management `activate_when` v2** — activation uses `phase_at_least` only. HTF-gated management is future work.

## Slice / checkpoint execution model

Implementation follows **vertical slices** with mandatory **STOP / review** gates (see `tasks.md`). No slice starts until the previous checkpoint is approved.

| Checkpoint | Slice focus |
|------------|-------------|
| 1 | Contracts & parsing |
| 2 | Managed runtime core (empty-array parity) |
| 3 | Active layer component pack v1 |
| 4 | Exit arbitration |
| 5 | Backend report serialization only |
| 6 | Backend smoke / backend acceptance |
| 7 | API / BFF read support |
| 8 | Frontend read-support |
| 9 | Comparison tooling |
| 10 | Final smoke / archive readiness |

**Principle:** build the **full pipe** (all layers + uniform events/report) with **minimal components** per layer — not all trading hypotheses at once.

**Layer order:** prove backend end-to-end on JSON report (Slice 5–6) **before** `research_api` (Slice 7) and frontend (Slice 8) — same discipline as v1.

## Managed runtime core

Bar-by-bar loop for each open trade (entry bar through close):

1. Update `TradeRuntimeState` (prices, MFE/MAE, `bars_in_trade`).
2. Evaluate `phase_rules` → optional `phase_changed`.
3. Resolve active management rules for current phase (`activate_when.phase_at_least`).
4. Recompute `ActiveManagementSnapshot` (stop, take profile, runtime exit arm state).
5. Collect `ExitCandidate`s from managed layers + `exit_policy` layer.
6. Run `ExitArbitrator` → close or continue.
7. Append uniform events.

**Domain objects:**

- `ActiveManagementSnapshot` — current managed stop/take/runtime state + rule/component ids.
- `ExitCandidate` — `layer`, `rule_id`, `component_id`, `price`, `bar`, `reason`.
- `ExitArbitrator` — applies `same_bar_policy` version `v1`.
- `ManagedExitContext` — bar OHLC, ATR, feature columns for evaluators.

**Integration:** extend existing research execution path (`backtest.py` / managed bar loop); research layer remains source of truth — not vectorbt callbacks.

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

- `take_profile_switch` actions: `keep_initial`, `disable_fixed_tp`, `extend_safety_tp_atr`.

### runtime_exits (v1 pack)

- `phase_runtime_exit` — **phase-gated close at bar close** (no pattern catalog in v2):
  - **Activation:** `activate_when.phase_at_least` only (e.g. `exhaustion`).
  - **Params:** `exit_price: "close"` (only supported value in v2).
  - **Behavior:** when rule is active on a bar, emit `runtime_exit_triggered` and add runtime exit **candidate** at that bar's close price. Final close ownership is Slice 4 arbitration.
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

## Exit arbitration

Per bar, candidates may include: initial SL, managed active stop, initial/managed TP, runtime exit, signal exits.

**v1 `same_bar_policy` priority (high → low):**

1. initial stop loss (`exit_policy`)
2. managed active stop (`exit_management`)
3. initial take profit / managed take / safety take
4. runtime exit (`exit_management`)
5. signal exit (`exit_policy`)

Winner recorded on `exit_executed` with `exit_layer`, `exit_rule_id`, `exit_component_id`, `same_bar_policy: "v1"`. Optional `losing_candidates` in metadata.

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

Comparison requires paired runs (baseline config vs managed config); tooling lives in research layer (script or report post-processor).

## Out of scope / future phases

Per `docs/research/21_state_driven_exit_management_v1.md`:

| Research phase | Scope | When |
|----------------|-------|------|
| 6 | Component-based state rules (`component_id` phase conditions) | Future change |
| 7 | Runner management pack (ADX/DI, EMA trail, exhaustion) | Future change |
| 8 | Composer managed-mode + management editors | Future change |
| — | OHLC intrabar priority v2, partial take | Future change |

## Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|-------------------------|
| `managed` coexists with `diagnostic_only` | Permanent control mode for parity | Replace diagnostic with managed empty-array only — rejected; loses explicit diagnostic semantics |
| Empty management arrays = baseline | Safe incremental rollout | Implicit no-op rules — rejected; harder to validate |
| All three layers in architecture before rich components | Avoid report/API rework per layer | BE-only first slice — rejected per research doc |
| `lock_profit_stop` minimal working in v2 | Two real stop components; no allowlist/behavior gap | Contract-only stub in allowlist — rejected as half-stub risk |
| `phase_runtime_exit` close-at-close, phase-only | Simplest testable runtime exit; no pattern catalog in v2 | `exhaustion_pattern` trigger stub — deferred to future |
| Research combiner owns closes | Matches v1 integration audit | vectorbt callback-driven stops — rejected |
| Generic report breakdown by `component_id` | Future components need no schema change | Per-component report sections — rejected |
| `phase_at_least` only for `activate_when` v2 | Minimal activation contract | Full condition component tree — deferred to phase 6 |

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Same-bar priority ambiguity | Freeze `same_bar_policy: v1` in spec; record `losing_candidates` |
| Managed loop diverges from diagnostic path | Separate test suites; `diagnostic_only` parity tests unchanged |
| HTF profile + managed take interaction | Managed runtime consumes effective `exit_policy` TP candidates only; no HTF reimplementation; test with HTF fixture |
| Scope creep into runner/Composer | Explicit non-goals; STOP gates per slice |
| Legacy BE confusion | Distinct managed contract; no catalog authoring revival |

## Migration Plan

1. Ship slices 1–9 behind feature-complete tests per checkpoint; Slice 10 for archive readiness.
2. Existing configs: no change required.
3. New managed configs: opt-in via `mode: managed` + management rules.
4. Rollback: revert to `diagnostic_only` or omit `exit_management`.

## Open Questions

- Comparison tooling delivery: inline report field vs standalone diff script — decide at slice 9 review.
