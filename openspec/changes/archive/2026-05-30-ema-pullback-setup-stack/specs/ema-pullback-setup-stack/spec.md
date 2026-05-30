# ema-pullback-setup-stack Delta Specification

## ADDED Requirements

### Requirement: External strategy config uses setups list as sole setup source

For `ema_pullback` strategy instances, the external JSON under `strategy` SHALL use `setups` as a non-empty array of setup component instances. Each instance MUST include non-empty `instance_id` and `component_id` and component params per catalog shape (top-level or nested `params`). The external config MUST NOT include both `setup` (legacy singleton object) and `setups` on the same instance after save/validate emit paths.

#### Scenario: Dual-setup config validates

- **GIVEN** a strategy instance with `setups` containing `untouched_anchor_setup` and `ema_bounce_counter_setup` with distinct `instance_id` values
- **WHEN** the instance is loaded and validated
- **THEN** validation succeeds
- **AND** both setup instances are present in the resolved internal strategy spec

#### Scenario: Duplicate instance_id rejected

- **GIVEN** `setups` with two entries sharing the same `instance_id`
- **WHEN** the instance is loaded
- **THEN** validation fails with an error referencing duplicate `instance_id`

#### Scenario: Empty setups rejected

- **GIVEN** `setups` is `[]` or missing and legacy `setup` is also missing
- **WHEN** the instance is loaded
- **THEN** validation fails requiring at least one setup instance

### Requirement: Loader migrates legacy singleton setup only at load time

When `strategy.setups` is absent and legacy `strategy.setup` is a component object, the instance loader SHALL normalize it to `setups: [{ "instance_id": "setup", ...legacy fields }]`, parse the list, and produce an internal spec with exactly one setup rule. Runtime execution, feature planning, signal trace, and report serialization MUST read the internal `setups` list only and MUST NOT retain a parallel singleton setup field on the strategy spec.

#### Scenario: Legacy file loads as one-element setups

- **GIVEN** an on-disk instance with only `strategy.setup` object for `untouched_anchor_setup`
- **WHEN** `load_ema_pullback_instance` runs
- **THEN** the resolved spec contains one setup rule with `instance_id` `setup`
- **AND** runtime signal building uses that rule without reading legacy `strategy.setup`

#### Scenario: Saved config emits setups not setup

- **GIVEN** a valid strategy spec loaded from legacy `setup`
- **WHEN** the spec is serialized to canonical external/wire dict for save or report embed
- **THEN** the output contains `strategy.setups` array
- **AND** does not contain legacy `strategy.setup`

### Requirement: Runtime AND-composes setup gates

For each enabled trade side, the strategy SHALL compute an aggregate `setup_ok` mask as the element-wise boolean AND of every setup instance's allowed mask. Setup instances MUST be evaluated independently; no setup component may read another setup instance's state. Final entry composition MUST remain `direction_allowed AND setup_ok AND trigger_ok AND blockers_ok AND risk_ok`.

#### Scenario: Both gates must allow entry

- **GIVEN** a bar where `untouched_anchor_setup` allows entry but `ema_bounce_counter_setup` denies entry
- **WHEN** signals are built
- **THEN** aggregate `setup_ok` is false at that bar
- **AND** final entry signal is false regardless of trigger

#### Scenario: All gates allow entry

- **GIVEN** a bar where every configured setup instance allows entry
- **AND** direction, trigger, blockers, and risk also allow
- **WHEN** signals are built
- **THEN** aggregate `setup_ok` is true
- **AND** final entry signal follows existing compose rules

### Requirement: Feature plan deduplicates setup feature requirements

`build_feature_plan_from_strategy_spec` SHALL collect planned features from every setup instance using each component's existing requirements. Identical planned features (same `feature_id`) MUST appear once in the plan and be shared by all setup instances that need them.

#### Scenario: Shared EMA period planned once

- **GIVEN** `setups` includes `ema_bounce_counter_setup` whose anchor EMA period equals the strategy anchor stack anchor period
- **WHEN** the feature plan is built
- **THEN** the anchor-period EMA feature is planned once
- **AND** both anchor stack and bounce-counter setup receive the same column id

### Requirement: Setup list participates in strategy identity

`strategy_spec_config_id` canonical serialization MUST include the full `setups` array with instance params. Array order MUST affect `config_id`. Each setup instance's `instance_id`, `component_id`, and params MUST be included.

#### Scenario: Adding second setup changes config_id

- **GIVEN** two configs identical except the second adds another setup instance
- **WHEN** `strategy_spec_config_id` is computed for each
- **THEN** the config ids differ

#### Scenario: Reordering setups changes config_id

- **GIVEN** two configs with the same setup instances in different list order
- **WHEN** `strategy_spec_config_id` is computed
- **THEN** the config ids differ

### Requirement: Signal trace namespaces setup internals by instance_id

Per-side signal trace MUST expose aggregate `setup_ok` as the AND of setup instances. Internal setup diagnostics MUST be stored under `internals.setups[instance_id]` (map keyed by instance id), not a single flat `internals.setup` object. Each instance bucket MAY contain component-native keys such as `setup_allowed` without overwriting other instances.

#### Scenario: Two setups preserve separate setup_allowed series

- **GIVEN** a strategy with two setup instances both emitting `setup_allowed` in trace
- **WHEN** signal trace is built
- **THEN** each instance's `setup_allowed` is readable under its own `instance_id` key
- **AND** aggregate `setup_ok` reflects AND across instances

### Requirement: No report or consumer legacy for singleton setup trace

Research report emission and Workbench report/chart consumers MUST use `internals["setups"][instance_id]` only. They MUST NOT read legacy `internals["setup"]`, MUST NOT dual-read both shapes, and MUST NOT fallback from `internals.setup` to `internals.setups`. Old reports with singleton `internals["setup"]` are out of scope for compatibility. Only external strategy **config** loader may migrate legacy `strategy.setup` to `strategy.setups[]`.

#### Scenario: New report omits singleton setup internals key

- **GIVEN** a backtest run after this change with at least one setup instance
- **WHEN** per-side signal trace is serialized into the report
- **THEN** setup internals appear under `internals.setups` keyed by `instance_id`
- **AND** `internals.setup` is not present

#### Scenario: Consumer rejects legacy trace shape

- **GIVEN** a report artifact containing only legacy `internals.setup` (no `internals.setups`)
- **WHEN** a Workbench report or chart consumer loads setup diagnostics
- **THEN** it does not silently map `internals.setup` into a synthetic `internals.setups` entry
- **AND** setup diagnostics from that artifact are unavailable unless the report is re-run
