## 1. Research contracts and loading

- [x] 1.1 Add `SetupRuleSpec` (`instance_id`, `component_id`, typed `params`) and replace `EmaPullbackStrategySpec.setup` with `setups: tuple[SetupRuleSpec, ...]` (min length 1, unique `instance_id`)
- [x] 1.2 Remove `ComponentStackSpec.setup: str`, `_validate_setup_component_matches_spec`, and `component_stack(..., setup=...)` coupling; update `component_builders` and `spec_instances` helpers
- [x] 1.3 Implement `_parse_setups` in `instance_loader.py` for `strategy.setups[]`; add loader-only migration from legacy `strategy.setup` → `[{ instance_id: "setup", ... }]`
- [x] 1.4 Reject instances that contain both `setup` and `setups`; update `_INSTANCE_FIELDS` / strategy field validation
- [x] 1.5 Update `strategy_spec_to_dict`, `spec_report.py`, and round-trip loaders to emit/read `setups` only (no singleton `setup` in canonical wire)
- [x] 1.6 Add loader tests: legacy singleton, dual-setup golden JSON, duplicate `instance_id`, empty list, config_id includes all setup params and order

## 2. Feature planning

- [x] 2.1 Refactor `build_feature_plan_from_strategy_spec` to iterate `spec.setups` and aggregate EMA/indicator requirements with existing dedup (`seen` set)
- [x] 2.2 Change `FeaturePlan` setup column mapping to per-instance (`setup_columns_by_instance_id` or equivalent); update call sites
- [x] 2.3 Add feature-plan test: dual setup with overlapping anchor EMA period plans feature once

## 3. Runtime signals and trace

- [x] 3.1 Add setup registry dispatch by `component_id` returning mask + trace helpers (untouched + bounce counter unchanged internally)
- [x] 3.2 Update `signals.py` `_build_side_signals` to AND all setup instance masks into `setup_ok`
- [x] 3.3 Update `signal_trace.py`: aggregate `setup_ok`; store `internals["setups"][instance_id]`; emit `component_events` with `instance_id` per setup instance
- [x] 3.4 Update trade/report entry diagnostics to namespace setup fields by `instance_id` (no flat overwrite of `setup_allowed`)
- [x] 3.5 Add signal tests: dual setup AND gate, one gate blocks entry, formulas unchanged vs single-setup baselines
- [x] 3.6 Add trace tests: two instances preserve separate `setup_allowed`; aggregate `setup_ok` equals AND

## 4. research_api catalog and validation

- [x] 4.1 Update validate/catalog paths to require `strategy.setups` array (not singleton `setup` object)
- [x] 4.2 Add API validation tests for dual-setup config and legacy migration acceptance on load endpoint if applicable

## 5. Frontend Composer

- [x] 5.1 Remove `setup` from `SINGLETON_ROLES`; add `normalizeStrategySetupsForEditing` / `ForApi` (legacy `setup` → `setups`, nested params)
- [x] 5.2 Replace Setup `SingletonComponentSection` with list slot UI (mirror blockers: add/remove/catalog picker/param forms)
- [x] 5.3 Update draft validation paths and error prefixes to `setups[i].*`; update summary strings for setup list
- [x] 5.4 Add frontend tests: load legacy `setup`, save emits `setups`, add second setup from catalog without component_id branches
- [x] 5.5 Update any composer fixtures/docs referencing singleton `strategy.setup`

## 6. Config migration and docs

- [x] 6.1 Migrate checked-in experiment configs under `research/experiments/configs/` from `setup` to `setups` (or confirm loader migration covers CI)
- [x] 6.2 Update `research/strategies/ema_pullback/README.md` setup section to document `setups[]` and dual-setup example

## 7. Verification and acceptance

- [x] 7.1 Run focused pytest: loader, feature plan, signals, trace, config_id, report diagnostics
- [x] 7.2 Run frontend unit tests for composer setup list
- [x] 7.3 Manual Workbench: compose `untouched_anchor_setup` + `ema_bounce_counter_setup`, validate, run backtest; confirm Chart setup markers show distinct `instance_id` in tooltips
- [x] 7.4 Acceptance: legacy **config** opens in Composer and saves as `setups`; no runtime code reads `spec.setup` singleton
- [x] 7.5 Acceptance: new backtest reports expose setup trace only at `internals["setups"][instance_id]` (not `internals["setup"]`)

## 8. Report/trace legacy cleanup (no consumer dual-read)

- [x] 8.1 Grep active runtime, frontend, and report/chart code for `internals["setup"]`, `internals.setup`, and singleton setup trace readers; remove or rewrite to `internals["setups"][instance_id]` only
- [x] 8.2 Remove any report-consumer fallback from `internals.setup` to `internals.setups` (forbidden)
- [x] 8.3 Update or delete obsolete test fixtures/assertions that expect flat `internals["setup"]`; tests MUST assert new traces use `internals["setups"][instance_id]`
- [x] 8.4 Confirm no tests require old report trace compatibility with singleton `internals.setup`
