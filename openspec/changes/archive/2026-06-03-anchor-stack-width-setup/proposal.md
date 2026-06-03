## Why

`ema_pullback` can see a formally ordered EMA stack (`fast > anchor > slow` for long) while fast and slow EMAs remain too close in price—flat chop where pullback geometry is weak. Touch/bounce setups (`untouched_anchor_setup`, `ema_bounce_counter_setup`) gate *interaction* with anchor EMA; they do not measure whether the stack was *expanded* before pullback. Research needs an opt-in **setup** that requires sufficient anchor-stack width on the entry bar and evidence of prior expansion in a lookback window, normalized by ATR, without changing direction, trigger, exits, or blockers.

## What Changes

- Add `anchor_stack_width_setup` as a **setup** component (`role: setup`, `component_id: anchor_stack_width_setup`) for `ema_pullback`.
- Gate via existing multi-setup AND composition: `setup_allowed` when `current_width_atr >= min_current_width_atr` and `recent_max_width_atr >= min_recent_width_atr`; width = `abs(fast_ema - slow_ema)` using EMAs from `strategy.anchor_stack` (no per-component EMA periods). MVP uses an **inclusive** lookback window `[t - width_lookback_bars + 1, t]` for `recent_max_width_atr` and does **not** require recent max > current width.
- Plan ATR through the feature layer (`atr_timeframe: base`, `atr_period`); do not compute EMA or ATR inside the setup runtime.
- Expose trace diagnostics (`setup_allowed`, `blocked_reason`, width fields, thresholds, EMA/ATR snapshots) and component counters (`allowed_count`, `blocked_count`, `blocked_reason_breakdown`).
- Register in research component registry, spec validation, external config loader, and BFF component catalog (Composer fields + help text).
- Emit Chart **allowed episodes** only: `span_start` + label `Width ok` on false→true, `span_end` + label `Width end` on true→false (two events per continuous allowed run; no per-bar markers); blocked bars only in trace internals.
- Add backend, API/catalog, Composer, and chart tests; strategies without this setup remain unchanged.

**Non-goals (explicit)**

- No touch/cross/bounce counting; no changes to `untouched_anchor_setup` or `ema_bounce_counter_setup`.
- No direction, trigger, exit_policy, exit_management, break_even, or blocker semantics changes.
- No `data_engine/` changes; no optimizer/grid runner; no ADX/DMI work.
- No HTF ATR or HTF anchor-stack width in MVP (`atr_timeframe` must be `base`).
- No mandatory closed-trade report snapshots in MVP (optional later if report diagnostics already support setup entry fields cleanly).
- No frontend-side EMA/ATR computation.

## Capabilities

### New Capabilities

- `anchor-stack-width-setup`: Contract for anchor-stack width gate—registration, params, feature dependencies (anchor_stack EMA + ATR), runtime/trace, blocked reasons, counters, and config identity.

### Modified Capabilities

- `ema-pullback-signal-trace`: Setup internals and component counters for `anchor_stack_width_setup` by `instance_id`; optional `component_events` emitter hook.
- `workbench-chart-component-event-markers`: Setup-role events and presentation for `anchor_stack_width_setup` (width ok / width blocked tooltips).
- `ema-pullback-report-diagnostics`: Optional ADDED entry fields when this setup is configured (defer if not cleanly aligned with existing setup trade diagnostics).

## Impact

| Layer | Scope |
|-------|-------|
| **research** | `spec.py` (params model), `components/setup.py`, `components/registry.py`, `setup_runtime.py`, `features/plan.py`, `instance_loader.py`, `component_builders.py`, `execution/signal_trace.py`, setup counter aggregation, tests |
| **research_api** | `component_catalog.py` — setup role entry, param schema, help text |
| **frontend** | Composer catalog-driven setup fields; chart component event presentation (reuse generic setup markers first) |
| **data_engine** | _none_ |

**Reference docs**: [`docs/research/strategy_constructor_master_plan.md`](../../../docs/research/strategy_constructor_master_plan.md), [`docs/research/README.md`](../../../docs/research/README.md), [`openspec/specs/ema-pullback-setup-stack/spec.md`](../../specs/ema-pullback-setup-stack/spec.md), [`openspec/specs/ema-bounce-counter-setup/spec.md`](../../specs/ema-bounce-counter-setup/spec.md), [`openspec/specs/workbench-chart-component-event-markers/spec.md`](../../specs/workbench-chart-component-event-markers/spec.md).
