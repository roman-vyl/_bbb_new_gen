## MODIFIED Requirements

### Requirement: Catalog-driven context consumption policy selection

Strategy Composer MUST populate context consumption policy dropdowns exclusively from `context_consumption_policies` (or role-level policies) returned by the component catalog for the selected `(role, component_id)`. The UI MUST NOT offer `htf_state_gate` or `allowed_states` for HTF blocker gating after this change.

#### Scenario: Blocker policy dropdown shows HTF regime gate only

- **WHEN** user enables context consumption on a catalog-supported blocker
- **THEN** policy dropdown lists `HTF regime gate` (`htf_regime_gate`) and does not list `HTF state gate`

#### Scenario: Legacy htf_state_gate draft fails validation

- **WHEN** a saved or pasted draft contains `policy_id: htf_state_gate` on a blocker
- **THEN** validate returns an error for unsupported policy_id (no auto-migration)

#### Scenario: Saved payload excludes allowed_states

- **WHEN** user saves a blocker with `htf_regime_gate`
- **THEN** serialized `context_consumption.policy.params` contains `allowed_regimes` only (no `allowed_states`)
