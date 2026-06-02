## ADDED Requirements

### Requirement: Setup rules may declare optional context_consumption
Each `strategy.setups[]` rule MAY include `context_consumption` with required `context_ref` and `policy`. When present, `context_ref` MUST match a declared key in `strategy.contexts`, and `policy.component_id` plus params MUST satisfy setup-role policy schema.

When omitted, setup rule configuration MUST remain valid and runtime behavior MUST remain equivalent to local setup-mask evaluation without context gating.

#### Scenario: Valid setup context consumption binds to declared context
- **WHEN** a setup rule includes `context_consumption.context_ref: htf` and strategy declares `strategy.contexts.htf`
- **AND** `policy.component_id: htf_regime_gate` with non-empty valid `allowed_regimes`
- **THEN** strategy validation succeeds for this setup rule

#### Scenario: Unknown setup context_ref fails validation
- **WHEN** a setup rule includes `context_consumption.context_ref: macro_htf` but `strategy.contexts` does not declare `macro_htf`
- **THEN** validation fails naming unknown context reference

#### Scenario: Missing setup policy component_id fails validation
- **WHEN** a setup rule includes `context_consumption` but `policy.component_id` is missing
- **THEN** validation fails before runtime

