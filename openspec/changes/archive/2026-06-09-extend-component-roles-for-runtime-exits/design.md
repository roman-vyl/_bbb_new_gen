## Context

`ema_pullback` already has:

- **Pipeline registry** (`research/strategies/ema_pullback/components/registry.py`) — maps `component_id` → callable per pipeline slot (`exits`, `blockers`, …).
- **BFF catalog** (`research_api/services/component_catalog.py`) — `ComponentSchema` with single `role` for Composer sections.
- **Managed runtime** (`openspec/specs/trade-exit-management-runtime/spec.md`) — `exit_management.runtime_exits` today only allows `phase_runtime_exit` (unconditional bar close when `activate_when` phase is met).
- **Signal exit primitives** — `rsi_signal_exit`, `ema_cross_loss_exit` in `components/exits.py`; used by `exit_policy` compilation as always-on per-bar signal masks.

The gap: managed runner research needs the **same** RSI/EMA math phase-gated inside `exit_management`, without duplicating components or adding a second trade path.

Principle to encode:

```text
Component     = what to compute (reusable primitive)
Role/Consumer = how to interpret the result (exit_policy vs runtime_exit)
Runtime       = when to apply (activate_when + delayed arm)
Report        = how to attribute (layer, rule_id, component_id, phase)
```

**Naming note:** informal docs sometimes say `ema_cross_exit`; the canonical `component_id` in code and catalog is `ema_cross_loss_exit`. This change uses the canonical id everywhere.

## Goals / Non-Goals

**Goals:**

- Add `allowed_roles` to research consumer registry and BFF catalog (extend, not replace).
- Dispatch `rsi_signal_exit` / `ema_cross_loss_exit` through a runtime consumer adapter when `role: exit_management.runtime_exit`.
- Require `activate_when` on every `runtime_exits[]` rule; reject disallowed roles at validate time.
- Preserve delayed activation: signal evaluated end-of-bar N → armed from bar N+1 (same as `phase_runtime_exit`).
- Extend v1 arbitration to order protective runtime exits before take runtime exits.
- Enrich `managed_events[]` and variant metrics for runtime exit attribution.
- Keep existing `exit_policy` signal exit configs working unchanged.

**Non-Goals:**

- New indicator math, new duplicate components, vectorbt callback ownership, `data_engine` work.
- Suppressing `exit_policy` signal exits on runner transition (explicit future mechanism).
- Renaming `ema_cross_loss_exit` → `ema_cross_exit`.
- Composer `runtime_exits` authoring in Slice 1 (Slice 2 starts only after CHECKPOINT).

## Decisions

### D1 — Consumer roles are separate from pipeline slot role

**Choice:** Introduce dotted consumer role strings:

```text
exit_policy.stop_loss
exit_policy.take_profit
exit_policy.signal_exit
exit_management.phase_condition
exit_management.runtime_exit
exit_management.stop_rule
exit_management.take_rule
```

Pipeline slot `role="exits"` on `ComponentSchema` remains for Composer section placement. `allowed_roles` declares where the same `component_id` may appear in strategy JSON.

**Alternatives considered:**

- Duplicate `component_id` per consumer — rejected (user requirement).
- Infer consumer from JSON path only — rejected (no explicit reject policy, harder to test).

### D2 — Single research `ConsumerComponentRegistry` metadata layer

**Choice:** Extend `ComponentDefinition` (or adjacent dataclass) with:

```python
allowed_roles: frozenset[str]
input_contract: str          # e.g. "exit_rule_params"
output_contract: str         # e.g. "signal_mask" | "phase_condition_bool"
side_aware: bool
feature_requirements: ...  # hook into feature plan
params_schema_ref: str     # catalog/loader schema key; v1 defaults to component_id
diagnostics_contract: ...  # event metadata keys
```

Research validate reads this registry. BFF catalog is generated from the same source of truth (or hand-synced with a test that asserts parity).

**Rationale:** Avoid parallel systems per `docs/research/06_component_registry.md` direction.

### D3 — Runtime exit consumer adapter, not new exit functions

**Choice:** `evaluate_runtime_exits` dispatches by `component_id` to adapters:

| component_id | Adapter behavior |
|---|---|
| `phase_runtime_exit` | Existing bar-close when phase active |
| `rsi_signal_exit` | Call `rsi_signal_exit(...)` for open trade side at current bar; fire when series True |
| `ema_cross_loss_exit` | Call `ema_cross_loss_exit(...)` likewise |

Adapter responsibilities only:

- Check `activate_when.phase_at_least` before evaluation.
- Pass `RuntimeExitRuleSpec` params mapped to `ExitRuleSpec`-compatible shape.
- Emit `RuntimeExitTrigger` + `runtime_exit_triggered` event with full attribution.
- Do **not** reimplement RSI/EMA logic.

**Alternatives:** Copy-paste phase-gated RSI function — rejected.

### D4 — `runtime_exits[]` wire shape

**Choice:** Generalize `RuntimeExitRuleSpec`:

```json
{
  "rule_id": "runner_rsi90_take",
  "component_id": "rsi_signal_exit",
  "role": "exit_management.runtime_exit",
  "activate_when": { "phase_at_least": "runner" },
  "exit_kind": "take_profit",
  "params": { ... same as exit_policy instance ... }
}
```

Rules:

- `role` MUST be present and MUST match the consumer being validated.
- `activate_when` REQUIRED (reject if missing).
- `exit_kind` REQUIRED; allowed values for `runtime_exits` ONLY: `take_profit`, `protective_exit`, `market_close`. `signal` is NOT allowed (it does not inform arbitration; RSI90-in-runner is `take_profit`, EMA cross is `protective_exit`).
- `phase_runtime_exit` defaults `exit_kind` to `market_close`.
- Optional explicit `role` on `exit_policy` exits is out of scope (inferred from list placement).

`phase_runtime_exit` params remain `{ "exit_price": "close" }`.

### D5 — Validation reject policy

**Choice:** At spec load / validate:

| Condition | Error |
|---|---|
| `component_id` unknown | reject |
| `role` not in component `allowed_roles` | reject with role + component_id |
| `runtime_exits` without `activate_when` | reject |
| `exit_kind: "signal"` on `runtime_exits` | reject |
| `atr_stop_loss` in `runtime_exits` | reject (not in allowed_roles) |
| `role` mismatch (e.g. `exit_policy.signal_exit` in `runtime_exits`) | reject |

No silent ignore, no fallback to `phase_runtime_exit`, no dual-read.

### D6 — Extended `same_bar_policy: "v1"` priority

**Choice:** Split former single `runtime_exit` bucket:

```text
1. initial stop_loss          (exit_policy)
2. managed_stop               (exit_management)
3. initial take_profit        (exit_policy, unless disable_initial_tp)
4. runtime protective_exit    (exit_management.runtime_exit, exit_kind protective_exit)
5. runtime take_profit        (exit_management.runtime_exit, exit_kind take_profit)
6. runtime market_close       (exit_management.runtime_exit, exit_kind market_close — phase_runtime_exit)
7. signal                     (exit_policy)
```

Map `candidate_type` subtypes: `runtime_protective`, `runtime_take`, `runtime_close` (or encode via `exit_kind` on `ExitCandidate`).

**Rationale:** Matches runner research intent (protective EMA cross before RSI take) while preserving catastrophic stop supremacy.

### D7 — Normalized `exit_layer` and `exit_owner` attribution

**Choice:** Use one precise vocabulary for trade records, events, and metrics breakdowns:

```text
exit_layer  — machine-precise close attribution (same keys as breakdown)
exit_owner  — coarse rollup only: "exit_policy" | "exit_management"
```

Allowed `exit_layer` values (v1):

```text
exit_policy
exit_management.stop_rule
exit_management.take_rule
exit_management.runtime_exit
```

`exit_owner` MUST be derivable: `exit_policy` when `exit_layer == "exit_policy"`; `exit_management` otherwise.

`exit_layer_breakdown` keys MUST match `exit_layer` values exactly (no `exit_management.other` bucket). Rollups that need only top-level grouping use `exit_owner_breakdown` or aggregate from `exit_layer`.

**Rationale:** Avoid mismatch where metrics use `exit_management.runtime_exit` but trade records say `exit_management`.

### D8 — Diagnostics and events

**Choice:** Add `runtime_exit_executed` event (or enrich `exit_executed` metadata) with:

`component_id`, `role`, `exit_layer`, `exit_owner`, `rule_id`, `exit_kind`, `phase`, `side`, `price`, `bar_index`, `mfe_pct`, `mae_pct`, `bars_in_trade`, `metadata`.

Variant metrics add `exit_layer_breakdown` (precise keys), optional `exit_owner_breakdown`, and `runtime_exit_breakdown` keyed by `component_id` and `rule_id`.

Report schema version bump only if new required fields break loaders; prefer additive optional fields under existing `trade_management` diagnostics (align with `ema-pullback-report-diagnostics` v6 pattern).

Implementation note: existing coarse `exit_layer: "exit_management"` on breakeven closes SHOULD be narrowed to `exit_management.stop_rule` when this change lands (same `exit_owner`).

### D9 — Runtime signal exits fill at bar close

**Choice:** `rsi_signal_exit` and `ema_cross_loss_exit` in `exit_management.runtime_exit` fill at the **bar close** of the arbitration bar. No intrabar fill, no optimistic price inside the bar.

Consistent with close-based RSI/EMA primitives and `phase_runtime_exit` (`params.exit_price: "close"`).

### D10 — `phase_runtime_exit` retention

**Choice:** Keep `phase_runtime_exit` in `allowed_roles` for `exit_management.runtime_exit`. Existing tests and configs using it remain valid.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Catalog / research registry drift | Single-source test asserting `allowed_roles` parity |
| Signal exit fires both in `exit_policy` and `runtime_exits` on same trade | Document as author responsibility; diagnostics show layer breakdown |
| Feature plan misses RSI/EMA for runtime-only usage | Adapter registers `feature_requirements` same as exit_policy path |
| Arbitration behavior change for existing `phase_runtime_exit` configs | `market_close` stays at same relative priority as old `runtime_exit` bucket vs signal |
| Composer complexity | Explicit CHECKPOINT before Slice 2 |
| Coarse `exit_layer` in existing reports | Narrow to precise layers; keep `exit_owner` for rollup |

## Migration Plan

**Slice 1 (backend, no Composer UI):**

1. Registry metadata + validate rejects.
2. Runtime adapter for `rsi_signal_exit` / `ema_cross_loss_exit` (bar-close fill).
3. Arbitration + normalized `exit_layer` / `exit_owner` diagnostics.
4. BFF catalog `allowed_roles`.
5. Smoke JSON configs + tests.

**CHECKPOINT (mandatory stop before Slice 2):**

- Manual verification of hand-authored JSON configs.
- All Slice 1 tests green.
- Smoke runner + RSI/EMA runtime configs run end-to-end.
- Reports show `exit_layer: exit_management.runtime_exit` (not coarse `exit_management`) and breakdown keys align.

**Slice 2 (Composer):**

6. `runtime_exits` authoring section, picker, validate round-trip.

Rollback: configs using only `exit_policy` and `phase_runtime_exit` unaffected; new runtime signal rules are opt-in.

## Open Questions

1. Should `exit_policy` instances gain optional explicit `role` field for symmetry, or remain path-inferred indefinitely?
2. Slice 2: migrate experiment JSON templates under `research/experiments/configs/` in the same slice, or separate?
