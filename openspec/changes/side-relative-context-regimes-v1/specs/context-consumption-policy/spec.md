## ADDED Requirements

### Requirement: htf_regime_gate maps raw HTF state to side-relative regimes

The research layer SHALL register consumer policy `htf_regime_gate` for catalog-supported roles. The policy handler MUST resolve trader-facing regime labels `aligned`, `countertrend`, and `neutral` from provider raw state (`up`, `down`, `neutral`) and the **evaluated trade side** (`long` or `short`) using this mapping:

- long + `up` → `aligned`; long + `down` → `countertrend`; long + `neutral` → `neutral`
- short + `down` → `aligned`; short + `up` → `countertrend`; short + `neutral` → `neutral`

The handler MUST NOT read trade side from provider configuration or `ContextOutput`. Provider output MUST remain raw states only.

#### Scenario: Long evaluation treats raw up as aligned

- **GIVEN** `context_consumption.policy.policy_id` is `htf_regime_gate` with `allowed_regimes: ["aligned"]`
- **AND** raw HTF state on a bar is `up`
- **WHEN** the consumer policy is evaluated for side `long`
- **THEN** the gate allows context on that bar

#### Scenario: Short evaluation treats raw up as countertrend

- **GIVEN** the same policy and bar raw state `up`
- **WHEN** the consumer policy is evaluated for side `short`
- **THEN** the gate blocks context on that bar

#### Scenario: Neutral raw state is neutral for both sides

- **GIVEN** `htf_regime_gate` with `allowed_regimes: ["neutral"]`
- **AND** raw HTF state is `neutral`
- **WHEN** evaluated for `long` or `short`
- **THEN** the gate allows context on that bar

### Requirement: htf_regime_gate params use allowed_regimes

`htf_regime_gate` policy params MUST accept `allowed_regimes` as a non-empty list of strings drawn from `aligned`, `countertrend`, `neutral`. Validation MUST reject unknown regime labels. When `allowed_regimes` is omitted, all three regimes MUST be treated as allowed (permissive default).

#### Scenario: Unknown regime fails validation

- **WHEN** validate receives `allowed_regimes: ["aligned", "bullish"]`
- **THEN** validation fails naming invalid regime values

#### Scenario: Empty allowed_regimes fails validation

- **WHEN** validate receives `allowed_regimes: []`
- **THEN** validation fails

### Requirement: Consumer policy evaluation receives evaluated trade side

Policy handlers for side-relative regimes MUST be invoked with the **evaluated trade side** for the current mask or trace pass. Call sites that evaluate per-side signals (e.g. long vs short blocker masks) MUST pass the correct side. Applying raw-state gating without side when `policy_id` is `htf_regime_gate` MUST NOT occur.

#### Scenario: Both-side strategy applies different gate per side

- **GIVEN** a strategy with both `long` and `short` enabled and a blocker using `htf_regime_gate` with `allowed_regimes: ["aligned"]`
- **AND** raw HTF state is `up` on a bar
- **WHEN** long and short masks are compiled
- **THEN** long mask treats the bar as allowed and short mask treats the bar as blocked

### Requirement: htf_regime_gate diagnostics expose resolution forensics

For runs with trace or consumption diagnostics enabled, records for `htf_regime_gate` MUST include sufficient fields to explain pass/fail: `context_ref`, per-bar or indexed `raw_state`, `evaluated_side`, `resolved_regime`, configured `allowed_regimes`, and pass/fail (or equivalent `context_applied` boolean series per evaluated side).

#### Scenario: Trace outcome includes regime resolution

- **WHEN** signal trace builds a blocker record for `htf_regime_gate`
- **THEN** the record `outcome` includes `evaluated_side`, `allowed_regimes`, and per-bar `raw_state` and `resolved_regime` labels aligned with `context_applied`

### Requirement: htf_state_gate remains available unchanged

Existing policy `htf_state_gate` with `allowed_states` (`up`, `down`, `neutral`) MUST remain registered and behavior-equivalent for existing configs. This change MUST NOT remove or auto-migrate `htf_state_gate` instances.

#### Scenario: Legacy raw-state gate unchanged

- **GIVEN** a blocker with `policy_id: htf_state_gate` and `allowed_states: ["up"]`
- **WHEN** evaluated without side-relative mapping
- **THEN** allow/deny depends only on raw state `up`, independent of evaluated side
