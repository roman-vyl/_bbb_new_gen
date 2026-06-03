## 1. Research contracts and feature planning

- [x] 1.1 Remove `fast_ema` / `anchor_ema` / `slow_ema` from `EmaBounceCounterSetupSpec` and `ema_bounce_counter_setup_spec()` in `spec.py` / `component_builders.py`; drop setup-level EMA `__post_init__` checks without re-adding bounce-specific timeframe/source validation (rely on global `anchor_stack` validation only)
- [x] 1.2 Update `_add_setup_features` in `features/plan.py` to map bounce setup columns from `spec.anchor_stack` (mirror `AnchorStackWidthSetupSpec` branch; no `_add_ema_feature` from setup params)
- [x] 1.3 Update `instance_loader` bounce setup parsing: bounce-only params; legacy setup-level EMA match-or-reject against `anchor_stack`
- [x] 1.4 Update config identity / serialization paths so new bounce setups do not hash removed EMA fields; verify bounce params still affect identity
- [x] 1.5 Update `signal_trace.py` `_setup_params_meta_for_rule` and `_ema_bounce_metadata` to use `strategy.anchor_stack` periods

## 2. Runtime and trace (semantics unchanged)

- [x] 2.1 Confirm `setup_runtime` column resolution via `plan.setup_columns_for` still works after plan change (no bounce state machine edits unless column wiring requires it)
- [x] 2.2 Run controlled runtime regression: trend episode, raw touch, pending bounce, lookback completion, `setup_allowed` / `max_bounces` on fixed dataframe
- [x] 2.3 Note whether `ema_bounce_counter_setup_trace` is invoked more than once per run; if redundant, record follow-up only (no cache in this change)

## 3. API catalog

- [x] 3.1 Remove setup-level EMA fields from `ema_bounce_counter_setup` in `research_api/services/component_catalog.py`; add help text referencing `strategy.anchor_stack`
- [x] 3.2 Extend `tests/test_research_api_config.py` (or sibling) asserting catalog schema has no `fast_ema` / `anchor_ema` / `slow_ema` for bounce setup

## 4. Frontend Composer

- [x] 4.1 Verify catalog-driven Composer renders bounce params without EMA period fields
- [x] 4.2 Add/extend Composer test: save/load preserves bounce params; legacy setup EMA keys are not re-authored on save
- [x] 4.3 Confirm other setup components’ Composer sections unchanged

## 5. Tests

- [x] 5.1 Loader: new config without setup EMA accepted; matching legacy accepted; mismatch rejected with clear error
- [x] 5.2 Feature plan: bounce `setup_columns` from anchor stack; no extra EMA features from bounce params; dedupe with width setup on same stack
- [x] 5.3 Multi-setup AND: bounce + `anchor_stack_width_setup` block/allow matrix (`tests/test_ema_pullback_setup_stack.py` or new cases)
- [x] 5.4 Signal trace / events: existing bounce internals and `role: setup` events; metadata periods from `anchor_stack`
- [x] 5.5 Update any fixtures/builders still passing setup-level EMA into `ema_bounce_counter_setup_spec()`

## 6. Safety and acceptance

- [x] 6.1 `git diff --stat data_engine/` empty
- [x] 6.2 Run targeted pytest: `test_ema_pullback_components.py`, `test_external_config_loader.py`, `test_ema_pullback_signal_trace.py`, `test_ema_pullback_setup_stack.py`, `test_research_api_config.py`, frontend Composer test
- [x] 6.3 Confirm no edits to direction/trigger/exits/exit_policy/exit_management/`anchor_stack_width_setup` implementation beyond shared plan helper
- [x] 6.4 Verify HTF context EMA overlays unchanged on a variant with `strategy.contexts` (regression-sensitive; read `workbench-chart-htf-context-overlays` if touching trace paths broadly)
