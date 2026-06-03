## Context

`ema_pullback` defines the canonical EMA stack on `strategy.anchor_stack` (fast / anchor / slow). Direction and `anchor_stack_width_setup` already consume prepared columns from that stack via `FeaturePlan.setup_columns_by_instance_id`. `ema_bounce_counter_setup` still stores `fast_ema`, `anchor_ema`, and `slow_ema` in `EmaBounceCounterSetupSpec`, and `_add_setup_features` plans separate EMA `PlannedFeature` entries from setup params—duplicating global anchor-stack planning and allowing experiments where bounce counting uses a different stack than direction.

Runtime (`setup_runtime.py`) already passes column names from `plan.setup_columns_for(instance_id)` into `ema_bounce_counter_setup_trace`; the cleanup is primarily **ownership** (params, loader, feature plan, catalog, identity, event metadata), not a rewrite of the bounce state machine in `components/setup.py`.

## Goals / Non-Goals

**Goals:**

- Single EMA source of truth: `strategy.anchor_stack` for bounce counter fast/anchor/slow columns.
- Align bounce setup architecture with `anchor_stack_width_setup` (setup role, `setups[]`, feature-planned columns, trace by `instance_id`, catalog-driven params).
- Preserve stateful bounce semantics (trend episode, raw touch, pending bounce, lookback, `setup_allowed`, existing trace keys and component_events).
- Loader compatibility for legacy configs when setup-level EMA periods match `anchor_stack`; clear reject on mismatch.
- Remove setup-level EMA period fields from catalog and Composer for new authoring.

**Non-Goals:**

- Bounce rule changes, stack width logic, direction/trigger/exits/blockers, `data_engine/`, trace-cache optimization, changes to `anchor_stack_width_setup`.
- Duplicate HTF / timeframe MVP rules inside bounce setup (no second validation surface).

## Decisions

### 1. Params model: drop EMA fields from `EmaBounceCounterSetupSpec`

Remove `fast_ema`, `anchor_ema`, `slow_ema` from the frozen dataclass. Keep bounce-only fields: `max_bounces`, `raw_touch_mode`, `touch_lookback_bars`, `trend_start_confirmation_bars`, `trend_break_confirmation_bars` (and any other existing non-EMA bounce params already in code).

Remove `__post_init__` ordering checks on setup EMA periods; stack ordering and timeframe rules remain validated only on `strategy.anchor_stack` (existing global MVP validation).

Update `ema_bounce_counter_setup_spec()` builder to accept only bounce params (no EMA coercion).

**Do not introduce bounce-specific timeframe validation.** When removing `EmaBounceCounterSetupSpec.__post_init__` checks on `ema.timeframe` / `ema.source`, do **not** re-add equivalent checks in bounce loader, feature plan, runtime, or catalog. Rely on existing `strategy.anchor_stack` MVP validation (same as `anchor_stack_width_setup`). Bounce setup only consumes already-planned anchor-stack columns via `setup_columns_by_instance_id`.

**Alternative considered:** Keep optional EMA fields for “override” — rejected; contradicts single source of truth and experiment clarity.

### 2. Feature planning: map columns from `spec.anchor_stack`

In `features/plan.py` `_add_setup_features`, change the `EmaBounceCounterSetupSpec` branch to mirror `AnchorStackWidthSetupSpec`:

```python
stack = spec.anchor_stack
setup_columns_by_instance_id[rule.instance_id] = {
    "fast": _ema_feature_id(stack.fast.timeframe, stack.fast.period),
    "anchor": _ema_feature_id(stack.anchor.timeframe, stack.anchor.period),
    "slow": _ema_feature_id(stack.slow.timeframe, stack.slow.period),
}
```

Do **not** call `_add_ema_feature` from setup params for bounce setup. Rely on the existing global loop that plans `spec.anchor_stack` EMAs (dedupe via `seen` set).

### 3. External loader: compatibility gate for legacy setup-level EMA keys

In `instance_loader._parse_setup_rule` for `ema_bounce_counter_setup`:

- Parse bounce params only into `EmaBounceCounterSetupSpec`.
- If payload/params contain `fast_ema`, `anchor_ema`, and/or `slow_ema` (integers or nested ema objects):
  - Resolve each to a base close EMA period (same coercion rules as today).
  - Compare to `strategy.anchor_stack` fast/anchor/slow periods on the parsed spec.
  - **Match:** accept config (optional: strip legacy keys from normalized in-memory spec; serialized round-trip may omit them).
  - **Mismatch:** raise `EmaPullbackInstanceValidationError` with message naming setup instance, setup periods, and anchor_stack periods.
- If legacy keys absent: accept (new config shape).

Do not default missing legacy keys to 50/200/500 for identity purposes when anchor_stack is authoritative—defaults in loader today imply a hidden second stack; new path uses anchor_stack only.

**Alternative considered:** Hard reject any setup-level EMA keys — simpler but breaks saved configs until manual edit; user prefers match-or-reject.

### 4. Config identity

Ensure `strategy_spec_config_id` / setup serialization for bounce counter does **not** include removed setup-level EMA fields for normalized specs. Legacy files that still contain matching EMA keys may hash differently until re-saved; document in tasks as acceptable or add normalization step in loader before identity if already done for other components.

Verify: changing only `strategy.anchor_stack` periods changes identity and runtime bounce columns; changing only bounce params (`max_bounces`, etc.) changes identity; new bounce configs without setup EMA params do not treat removed fields as identity inputs.

### 5. Signal trace and component event metadata

Update `_setup_params_meta_for_rule` and `_ema_bounce_metadata` to read EMA **period integers** from `spec.anchor_stack`, not `rule.params`.

Per-bar EMA values in trace (if exposed) already come from prepared columns resolved via plan—no formula change.

No new event roles; `role: setup` unchanged.

### 6. research_api catalog

In `component_catalog.py`, remove `fast_ema`, `anchor_ema`, `slow_ema` from `ema_bounce_counter_setup.params_schema`. Extend description/help: “Uses strategy.anchor_stack EMAs; does not define its own EMA periods.”

### 7. Frontend Composer

Catalog-driven rendering should drop EMA fields automatically when catalog updates. Add/extend test: save/load preserves bounce params; when API returns legacy setup-level EMA keys, Composer save must not re-emit them as authored fields (strip on normalize or ignore unknown keys per existing Composer patterns).

No UI changes to other setup components.

### 8. Multi-setup AND composition

No combiner changes. Bounce + `anchor_stack_width_setup` continue AND via `setup_runtime`; tests assert width blocks when bounce allows and vice versa.

### 9. Performance follow-up (document only)

After implementation, note in tasks verification: if `ema_bounce_counter_setup_trace` is invoked multiple times per run (e.g. runtime + events path), file a separate change for setup trace reuse—out of scope unless trivial.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Legacy configs used bounce EMA ≠ anchor_stack silently “fixed” by switch | Loader rejects mismatch with explicit error |
| Config id drift when re-saving old files | Accept one-time id change when EMA keys dropped; test identity on bounce params |
| Composer re-saves legacy EMA keys | Strip/ignore on save; frontend test |
| Duplicate trace calls | Manual check + optional follow-up issue |

## Migration Plan

1. Ship research + loader + feature plan + tests.
2. Ship research_api catalog.
3. Ship frontend Composer test/fix if needed.
4. Operators with mismatching legacy configs must align setup EMA to anchor_stack or remove setup keys after editing anchor_stack.

Rollback: revert commit; no data migration.

## Open Questions

_None blocking — prefer loader match-or-reject as specified._
