## Why

`ema_bounce_counter_setup` currently owns its own fast/anchor/slow EMA periods in setup params, creating a second source of truth alongside `strategy.anchor_stack`. That duplicates feature planning, can diverge from direction’s stack in experiments, and diverges architecturally from `anchor_stack_width_setup`, which correctly consumes the strategy-level anchor stack. After `anchor_stack_width_setup` shipped, bounce counter should use the same EMA ownership model while keeping its stateful bounce semantics unchanged.

## What Changes

- Refactor `ema_bounce_counter_setup` to resolve fast/anchor/slow columns from `strategy.anchor_stack` (same pattern as `anchor_stack_width_setup`).
- Remove setup-level EMA period params from `EmaBounceCounterSetupSpec`, feature planning, config identity (new configs), component catalog, and Composer.
- **Loader compatibility (preferred):** accept legacy configs when setup-level EMA periods match `strategy.anchor_stack`; reject with a clear error when they mismatch (no silent behavior change).
- Preserve bounce state machine, trace fields, component_events, multi-setup AND composition, and interaction with other setups (including `anchor_stack_width_setup`).
- Update tests for loader, feature plan, runtime, catalog/Composer, and multi-setup AND.
- Document follow-up note if trace is recomputed redundantly per run (no trace-cache work in this change).

**Non-goals (explicit)**

- No changes to bounce counting rules, direction, trigger, exits, exit_policy, exit_management, break_even, or blockers.
- No changes to `anchor_stack_width_setup`, `untouched_anchor_setup`, or `data_engine/`.
- No bounce-specific HTF/timeframe validation (consume planned anchor-stack columns; existing `strategy.anchor_stack` MVP rules only).
- No setup trace caching/optimization unless trivial local reuse with no API change.
- No new direction component; bounce counter does not become a blocker.

**BREAKING (authoring only):** New configs and Composer no longer accept setup-level `fast_ema` / `anchor_ema` / `slow_ema`. Legacy configs with matching periods remain loadable; mismatched legacy configs are rejected.

## Capabilities

### New Capabilities

_None — architectural alignment of an existing setup component._

### Modified Capabilities

- `ema-bounce-counter-setup`: EMA column source moves to `strategy.anchor_stack`; setup params, validation, feature planning, config identity, catalog/Composer contract, legacy loader rules, and event metadata periods updated; bounce trading semantics unchanged.

## Impact

| Layer | Scope |
|-------|-------|
| **research** | `spec.py` (`EmaBounceCounterSetupSpec`), `features/plan.py`, `instance_loader.py`, `component_builders.py`, `setup_runtime.py`, `components/setup.py` (runtime only if column resolution changes), `execution/signal_trace.py` (column resolution / event metadata), tests |
| **research_api** | `component_catalog.py` — remove EMA period fields; help text references `strategy.anchor_stack` |
| **frontend** | Composer catalog-driven fields for bounce setup; ensure save/load does not re-author setup-level EMA params |
| **data_engine** | _none_ |

**Reference docs:** [`openspec/specs/anchor-stack-width-setup/spec.md`](../../specs/anchor-stack-width-setup/spec.md), [`openspec/specs/ema-bounce-counter-setup/spec.md`](../../specs/ema-bounce-counter-setup/spec.md), [`openspec/specs/ema-pullback-setup-stack/spec.md`](../../specs/ema-pullback-setup-stack/spec.md), [`docs/research/strategy_constructor_master_plan.md`](../../../docs/research/strategy_constructor_master_plan.md).
