## ADDED Requirements

### Requirement: Context consumption trace records per consumer role

Signal trace and diagnostic payloads for ema_pullback runs SHALL include a `context_consumption_trace` (or equivalent) array with one record per consumer that applied context on each traced index (or summarized counters per bar). Each record MUST include: `role`, `component_id`, `context_ref`, `policy_id`, `context_applied` (boolean), and policy-specific `outcome` or counters when applicable.

#### Scenario: Exit policy trace includes consumption metadata

- **WHEN** exit policy has `context_consumption` and trace is built for a bar index
- **THEN** trace includes a record with `role: exit_policy`, matching `context_ref` and `policy_id`, and `context_applied: true`

#### Scenario: Consumer without consumption omitted from trace

- **WHEN** setup has no `context_consumption`
- **THEN** no setup-role record appears in `context_consumption_trace` for that run

### Requirement: Entry and exit context attribution are separated in trade records

When report schema version 5 is enabled, closed trade records MAY include `entry_context_consumption` and `exit_context_consumption` objects separately. `entry_context_state` MUST continue to represent HTF state at entry for backward analytics; it MUST NOT be overloaded to encode exit policy `policy_id`.

#### Scenario: Trade with entry blocker consumption shows entry attribution

- **WHEN** a closed trade passed through a blocker with `context_consumption` at entry
- **THEN** `entry_context_consumption` documents `context_ref`, `policy_id`, and `applied: true` while exit fields remain independent

#### Scenario: Exit-only consumption leaves entry consumption null

- **WHEN** only exit policy consumes context
- **THEN** `exit_context_consumption` is populated and `entry_context_consumption` is null or absent

### Requirement: Report schema version 5 is additive with v4 compatibility

New runs that emit per-consumer context attribution SHALL set `report_schema_version` to `5`. Loaders MUST accept `report_schema_version` `4` and `3` without requiring v5 fields. v5-only fields MUST be absent on older artifacts.

#### Scenario: New run writes schema v5 when attribution enabled

- **WHEN** Phase 4 reporting is enabled for a backtest
- **THEN** `report_schema_version` is `5`

#### Scenario: Historical v4 report loads unchanged

- **WHEN** results_reader loads a persisted v4 report
- **THEN** the API returns the payload without error and without `entry_context_consumption`

### Requirement: Historical reports readable without old config authoring

Reading a historical report (v3/v4) or a run whose embedded `strategy_spec` still contains legacy `exit_policy.context` MUST NOT imply that Composer or validate API support authoring or validating that old config shape. Report display MAY surface legacy fields for forensics only.

#### Scenario: Old report loads without requiring new strategy shape in API

- **WHEN** results_reader loads a v4 report from before this change
- **THEN** the API returns the report successfully as a historical artifact

#### Scenario: Validate rejects old exit_policy.context for new drafts

- **WHEN** validate receives a new draft containing `trade_management.exit_policy.context`
- **THEN** validation fails even if a historical report on disk still embeds the legacy shape

## MODIFIED Requirements

### Requirement: Diagnostics do not alter strategy behavior

Implementation of report diagnostics and context consumption trace serialization MUST NOT change signal generation, exit compilation, portfolio simulation parameters, or component registry beyond the explicitly scoped context architecture changes in `strategy-level-contexts-v1`. Serialization and post-hoc aggregation of simulation outputs MAY add fields.

#### Scenario: Phase 4 trace-only change preserves masks when tracing disabled

- **WHEN** trace emission is disabled for a run configuration
- **THEN** entry and exit masks match the same run with tracing enabled (excluding trace payload size)

#### Scenario: Equivalence uses target JSON shape not dual-read

- **WHEN** Phase 1 equivalence tests run with instance JSON in target shape (`strategy.contexts` + `exit_policy.context_consumption`) migrated from baseline fixtures offline
- **THEN** golden backtest trade counts and profile locks match pre-change baseline within tolerance
