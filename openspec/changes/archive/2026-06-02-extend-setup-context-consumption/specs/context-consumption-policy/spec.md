## ADDED Requirements

### Requirement: Setup rule context consumption gates local setup masks externally
`strategy.setups[]` rules SHALL be valid context consumers. When a setup rule defines `context_consumption`, runtime MUST evaluate the setup component first to produce its local setup mask, then apply context gate outside the setup component by intersecting the local mask with policy result for the same evaluated side and bars.

Setup components (`untouched_anchor_setup`, `ema_bounce_counter_setup`, and future setup components) MUST NOT read `ContextBundle` directly and MUST NOT resolve HTF regimes internally for context gating.

#### Scenario: Setup rule with htf_regime_gate applies external gate
- **WHEN** a setup rule local mask is `true` on a bar and `context_consumption.policy.component_id` is `htf_regime_gate` with `allowed_regimes` that do not include the resolved regime for that bar/side
- **THEN** the resulting setup rule mask is `false` on that bar
- **AND** setup component code path remains unchanged and context-unaware

#### Scenario: Setup rule without context_consumption remains local-only
- **WHEN** a setup rule omits `context_consumption`
- **THEN** runtime uses the setup component local mask as-is for that rule
- **AND** no `ContextBundle.get` call is triggered by setup runtime for that rule

### Requirement: Setup context consumption uses role catalog policy contract
Setup role catalog metadata SHALL declare whether each setup component supports context consumption and which policy components are allowed. Validation MUST reject `context_consumption` for setup component IDs with `supports_context_consumption: false` and MUST reject unknown policy component IDs for setup role.

#### Scenario: Unsupported setup component rejects context consumption
- **WHEN** validate receives `context_consumption` on a setup component whose setup-role catalog metadata has `supports_context_consumption: false`
- **THEN** validation fails before backtest execution

#### Scenario: Legacy htf_state_gate remains invalid in setup role
- **WHEN** setup rule `context_consumption.policy.component_id` is `htf_state_gate`
- **THEN** validation fails naming unsupported policy component for setup role

### Requirement: V1 setup components support htf_regime_gate consumption
In v1 scope, both currently supported setup components SHALL support setup-level `context_consumption`: `untouched_anchor_setup` and `ema_bounce_counter_setup` MUST expose `supports_context_consumption: true` for setup role and MUST allow `htf_regime_gate`.

#### Scenario: Both v1 setup components expose setup consumption support
- **WHEN** setup role catalog metadata is requested
- **THEN** `untouched_anchor_setup` and `ema_bounce_counter_setup` both expose `supports_context_consumption: true`
- **AND** both list `htf_regime_gate` in allowed setup policies

### Requirement: Setup diagnostics separate local gate and final outcomes
Where setup context gating is surfaced in trace/report diagnostics, the system SHALL expose local setup result, context gate result, and final gated setup result as separate fields so operators can distinguish "setup condition matched" from "setup condition blocked by context policy".

Diagnostic payload for setup context consumption SHALL include at least: `setup_instance_id`, `component_id`, `context_ref`, `policy_id`, `allowed_regimes`, `raw_state`, `resolved_regime`, `evaluated_side`, `local_setup_allowed`, `context_gate_allowed`, `final_setup_allowed`.

#### Scenario: Diagnostics show local true and context-blocked final false
- **GIVEN** setup local mask is `true`
- **AND** resolved regime is `countertrend`
- **AND** `allowed_regimes` is `["aligned"]`
- **WHEN** setup context diagnostics are emitted for the evaluated side
- **THEN** `local_setup_allowed` is `true`
- **AND** `context_gate_allowed` is `false`
- **AND** `final_setup_allowed` is `false`

### Requirement: Setup component events remain local when context blocks
Setup `component_events[]` SHALL remain local setup diagnostics and MUST NOT be removed or rewritten when setup-level context gate blocks final setup mask. Context blocking MUST be represented through context diagnostics/consumption trace rather than by deleting local setup events.

#### Scenario: Local setup event persists under context block
- **GIVEN** a setup component emits a local setup event on a bar
- **AND** setup context gate evaluates to blocked for that bar
- **WHEN** trace/report diagnostics are produced
- **THEN** the setup `component_events[]` entry remains present for that local event
- **AND** context block is visible in context diagnostics fields

