## ADDED Requirements

### Requirement: Anchor stack width setup trace registration

When a strategy variant includes `anchor_stack_width_setup` in `strategy.setups`, signal trace SHALL register a per-instance setup trace callable that produces boolean `setup_allowed` aligned to the market index and the diagnostic fields defined in `anchor-stack-width-setup`.

#### Scenario: Setup internals keyed by instance_id

- **GIVEN** a setup rule with `instance_id: anchor_stack_width` and `component_id: anchor_stack_width_setup`
- **WHEN** signal trace is built for the variant
- **THEN** `setup_internals` (or equivalent setup trace section) contains an entry for `anchor_stack_width`
- **AND** that entry includes `setup_allowed`, `blocked_reason`, and width diagnostic numeric fields

#### Scenario: Trace registry includes width setup component id

- **GIVEN** signal trace maps setup `component_id` to trace functions
- **WHEN** `component_id` is `anchor_stack_width_setup`
- **THEN** the mapped trace function is invoked with feature-planned column names and setup params
- **AND** the trace output index matches `df` / `times` length

### Requirement: Anchor stack width setup component counters in trace payload

Signal trace component counters SHALL include per-instance counters for `anchor_stack_width_setup` with `allowed_count`, `blocked_count`, and `blocked_reason_breakdown` when that setup is configured.

#### Scenario: Counters appear in trace component_counters

- **GIVEN** a variant with `anchor_stack_width_setup`
- **WHEN** signal trace JSON is produced
- **THEN** `component_counters` (or equivalent) lists the setup `instance_id`
- **AND** each entry includes `allowed_count`, `blocked_count`, and `blocked_reason_breakdown`
