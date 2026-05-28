## MODIFIED Requirements

### Requirement: Entry and exit context attribution are separated in trade records

When report schema version 5 is enabled, closed trade records SHALL support separate `entry_context_consumption` and `exit_context_consumption` objects. These objects document **which consumer and policy were configured** for the trade (wiring attribution).

For entry-side `htf_state_gate` blockers, `entry_context_consumption.applied` MUST reflect whether the gate **allowed** context on the **entry bar** (`entry_idx`), using the same gate series as `context_consumption_trace` for that consumer. It MUST NOT be hardcoded to `true` when the gate blocked on the entry bar.

`entry_context_state` MUST continue to represent raw HTF provider state at entry for analytics. It MUST NOT be overloaded to encode gate allow/block or exit policy `policy_id`.

Causal per-bar allow/block and profile selection remain authoritative in `signal_trace.context_consumption_trace` (and related `htf_context` / `outcome` fields), not duplicated as a full time series on each trade row.

#### Scenario: Entry gate blocked on entry bar

- **WHEN** a closed trade's `entry_idx` fails `htf_state_gate` for the configured blocker consumption
- **THEN** `entry_context_consumption.applied` is `false`
- **AND** `entry_context_state` may still be populated with the raw HTF state at that bar

#### Scenario: Entry gate allowed on entry bar

- **WHEN** the gate allows on `entry_idx`
- **THEN** `entry_context_consumption.applied` is `true`

#### Scenario: Trade wiring vs trace causal remain distinct

- **WHEN** a consumer inspects both trade record and signal trace for the same run
- **THEN** trade `*_context_consumption` identifies configured `context_ref` and `policy_id`
- **AND** trace `context_applied[i]` explains bar *i* gate outcome for blockers

#### Scenario: Exit-only consumption leaves entry consumption null

- **WHEN** only exit policy consumes context
- **THEN** `exit_context_consumption` is populated and `entry_context_consumption` is null or absent

### Requirement: Context consumption trace records per consumer role

Signal trace and diagnostic payloads for ema_pullback runs SHALL include a `context_consumption_trace` array with one record per consumer that applied context on each traced index. Each record MUST include: `role`, `component_id`, `context_ref`, `policy_id`, `context_applied` (per-bar boolean series), and policy-specific `outcome` when applicable.

For `htf_state_gate` blocker records, `context_applied[i]` MUST equal the gate allow result on bar *i* (true = allow, false = block).

For `exit_policy` records, `context_applied` MUST NOT be interpreted as HTF gate semantics; profile selection causality is carried in `outcome.profile_long` / `outcome.profile_short` when present.

#### Scenario: Blocker gate trace matches runtime mask

- **WHEN** trace is built for a run with `htf_state_gate` on a blocker
- **THEN** `context_applied` on that record matches the blocker mask derived from the same gate function used in execution

#### Scenario: Exit policy trace includes profile outcome

- **WHEN** exit policy has `context_consumption` and trace is built
- **THEN** the exit_policy record includes `outcome.profile_long` and `outcome.profile_short` series aligned to the trace index

#### Scenario: Consumer without consumption omitted from trace

- **WHEN** setup has no `context_consumption`
- **THEN** no setup-role record appears in `context_consumption_trace` for that run

## ADDED Requirements

### Requirement: Optional gate forensics in trace outcome

When trace enrichment is enabled for `htf_state_gate`, blocker trace records MUST include an `outcome` object with per-bar `state_at_bar` (HTF state labels) and the configured `allowed_states` list for display and forensics. Correctness of `context_applied` MUST NOT depend on this enrichment.

#### Scenario: Enriched trace exposes allowed states

- **WHEN** trace enrichment is enabled for `htf_state_gate`
- **THEN** the blocker trace record `outcome.allowed_states` matches the policy params on the strategy spec
- **AND** `outcome.state_at_bar[i]` matches `htf_context` state at index *i* for the consumed `context_ref`
