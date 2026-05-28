## Why

`strategy-level-contexts-v1` Phase 4 delivered **metadata attribution** on trades and per-bar **`context_consumption_trace`** in signal trace. Chart trade diagnostics currently show v5 fields (`entry_context_consumption`, `exit_context_consumption`) that answer *which consumer/policy was wired*, not *why a specific bar allowed or blocked context*.

Users selecting a trade on Chart still cannot see, in one place:

- HTF **state** on the entry (or exit) bar
- policy inputs (`allowed_states` for `htf_state_gate`)
- the **gate result** (`allow` / `block`) that drove the blocker or exit profile choice

Bar Inspector already exposes causal slices **for the clicked bar**; trade focus does not join trace at `entry_time_ms` / `exit_time_ms`. Trade-record `applied: true` is static and does not use `entry_idx`.

This follow-up closes the **causal diagnostics** gap without reopening strategy-instance architecture.

## What Changes

- **Terminology split (documented + UI labels)**:
  - *Wiring attribution* — v5 trade fields + consumer `context_ref` / `policy_id` (provenance).
  - *Causal decision* — per-bar `context_applied`, HTF `state`, policy params, exit `outcome.profile_*` from signal trace at entry/exit bars.
- **research**: `consumption_attribution_for_trade` sets `applied` from real gate/profile at `entry_idx` (not hardcoded `true`). Optional trace `outcome` enrichment for `htf_state_gate` (`state_at_bar`, `allowed_states`).
- **frontend (Chart)**: `ChartTradeDiagnostics` sections **Entry bar decision** / **Exit bar decision** resolved from loaded `signalTrace` + trade times (reuse Bar Inspector field semantics; no client-side HTF recompute).
- **frontend (Bar Inspector)**: unchanged behavior; may reuse shared formatters with trade panel.
- **research_api**: no new endpoints; optional type/doc alignment for enriched trace `outcome`.

**Non-goals**

- No `data_engine/` changes.
- No HTF/EMA/gate computation in the browser.
- No Composer or strategy-authoring UX changes.
- No new `report_schema_version` (v5 fields stay; semantics of `applied` clarified/fixed).
- No replacement of `entry_context_state` analytics semantics.
- No generic rule-engine or visual condition builder.

## Capabilities

### New Capabilities

- `workbench-trade-context-causal-diagnostics`: Chart selected-trade causal context sections joined from signal trace at entry/exit bars; shared presentation rules with Bar Inspector.

### Modified Capabilities

- `ema-pullback-report-diagnostics`: v5 `entry_context_consumption` / `exit_context_consumption` MUST reflect actual apply result at entry bar when trace-equivalent data exists; signal trace gate records MAY include policy inputs in `outcome` for forensics.

## Impact

| Layer | Scope |
|-------|--------|
| **research** | `consumption_attribution_for_trade`, optional `build_context_consumption_trace` outcome enrichment |
| **research_api** | Types/docs only unless trace payload shape grows |
| **frontend** | `ChartTradeDiagnostics`, shared trace lookup helpers, Vitest |
| **data_engine** | _none_ |

**Depends on**: [`openspec/changes/strategy-level-contexts-v1`](../strategy-level-contexts-v1/) (context bundle, trace, v5 fields) — archive parent change first or treat as merged baseline.

**Reference docs**: [`docs/frontend/implementation_plan.md`](../../../docs/frontend/implementation_plan.md), [`openspec/specs/ema-pullback-report-diagnostics/spec.md`](../../specs/ema-pullback-report-diagnostics/spec.md), [`research/strategies/ema_pullback/README.md`](../../../research/strategies/ema_pullback/README.md).
