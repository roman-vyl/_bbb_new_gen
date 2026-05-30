## Why

`ema_pullback` now has two independent setup gates (`untouched_anchor_setup` and `ema_bounce_counter_setup`) that must apply together, but Strategy Composer and the instance config model still treat setup as a **singleton slot**—only one setup component can be selected. Authors cannot compose the intended pipeline (`direction AND all_setups AND trigger AND blockers AND risk`) with both gates enabled. This blocks the primary use case that motivated `ema_bounce_counter_setup`: limit early bounce interactions **without** removing the untouched-anchor precondition.

## What Changes

- Replace singleton `strategy.setup` (single object) with **`strategy.setups`** (non-empty array of setup component instances), mirroring the existing `blockers` list pattern (`instance_id`, `component_id`, params).
- **BREAKING** external config shape: saved/validated instances emit `setups[]` only; legacy singleton `setup` is accepted **only** at instance-loader migration time (normalized to a one-element `setups` list), not as a permanent dual-read path in runtime or Composer save paths.
- **BREAKING** report/trace shape: canonical signal trace uses `internals["setups"][instance_id]` only; no report-consumer dual-read of legacy `internals["setup"]` (old reports are obsolete artifacts).
- Runtime AND-composes setup masks from every enabled setup instance; final entry semantics stay `direction AND all_setups_allowed AND trigger AND blockers AND risk`.
- Typed internal spec becomes a **setup stack** (`tuple` of setup rules with `instance_id` + typed params); remove `EmaPullbackStrategySpec.setup` singleton and `ComponentStackSpec.setup` string coupling.
- Feature planning aggregates requirements from all setup instances and deduplicates identical EMA/indicator features.
- Signal trace, report diagnostics, and `component_events[]` namespace per setup **`instance_id`** so shared field names (e.g. `setup_allowed`) do not overwrite each other.
- Composer Setup section becomes a **catalog-driven list UI** (add / remove / configure), not `SingletonComponentSection`.
- Explicit acceptance for simultaneous `untouched_anchor_setup` + `ema_bounce_counter_setup` without frontend hardcoding either `component_id`.

**Non-goals (explicit)**

- No change to trading semantics of `untouched_anchor_setup` or `ema_bounce_counter_setup` (formulas unchanged).
- No trigger, blocker, exit, direction, or risk semantic changes.
- No `data_engine/` changes.
- No new setup components beyond those already in catalog.
- No frontend-side strategy/EMA computation.
- No chart-renderer branches on specific setup `component_id`.
- No chart component-event **role toggles** (separate future work).

## Capabilities

### New Capabilities

- `ema-pullback-setup-stack`: External `strategy.setups[]` contract, loader migration from legacy singleton `setup`, runtime AND composition, feature-plan aggregation, config identity, and research execution/trace/report behavior for multiple setup instances.

### Modified Capabilities

- `workbench-strategy-contexts`: Composer Setup section requirements—list-based, catalog-driven setup instances instead of singleton select.
- `ema-bounce-counter-setup`: Clarify coexistence in a setup stack; per-instance trace/event/diagnostic identity (no longer assumes sole setup on spec).
- `ema-pullback-report-diagnostics`: Entry/setup diagnostic payloads keyed by setup `instance_id` when multiple setups are configured.
- `workbench-chart-component-event-markers`: Setup-role events MUST disambiguate source setup via `instance_id` when multiple setup components emit events on the same chart.

## Impact

| Layer | Scope |
|-------|-------|
| **research** | `spec.py`, `instance_loader.py`, `spec_report.py`, `component_builders.py`, `features/plan.py`, `execution/signals.py`, `execution/signal_trace.py`, component registry wiring, config_id serialization, tests |
| **research_api** | Validate/catalog paths that assume singleton `strategy.setup` |
| **frontend** | `ComposerPanel.tsx`, composer draft normalization/validation, list slot helpers (reuse blockers list patterns), remove setup from `SINGLETON_ROLES` |
| **data_engine** | _none_ |

**Reference docs**: [`docs/research/strategy_constructor_master_plan.md`](../../../docs/research/strategy_constructor_master_plan.md), [`docs/frontend/frontend_master_plan_alternative_chart_composer_reports.md`](../../../docs/frontend/frontend_master_plan_alternative_chart_composer_reports.md), archived [`openspec/changes/archive/2026-05-30-ema-bounce-counter-setup/`](../../archive/2026-05-30-ema-bounce-counter-setup/).
