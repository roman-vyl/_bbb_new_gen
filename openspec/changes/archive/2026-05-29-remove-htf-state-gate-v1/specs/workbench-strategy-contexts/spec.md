## REMOVED Requirements

### Requirement: Legacy htf_state_gate unchanged in Composer

**Reason**: `htf_state_gate` removed as a supported context consumption policy; authors must use `htf_regime_gate`.

**Migration**: Recreate `context_consumption` with `policy_id: htf_regime_gate` and explicit `allowed_regimes`.

## MODIFIED Requirements

### Requirement: policy_id must be listed for the component role

When `context_consumption` is enabled on a catalog-supported consumer, client-side draft validation MUST reject `policy.policy_id` values that are not listed in `context_consumption_policies` for that `(role, component_id)`. The same rule applies to `exit_policy.context_consumption` against `context_consumption_roles` for `exit_policy`.

#### Scenario: Loaded draft with unknown policy_id fails validation

- **GIVEN** a catalog-supported HTF context consumer whose catalog lists only `htf_regime_gate`
- **AND** a loaded draft with `policy_id: htf_state_gate`
- **WHEN** client-side draft validation runs
- **THEN** validation fails on `context_consumption.policy.policy_id` with a message that the policy is not supported for this component

#### Scenario: Legacy htf_state_gate draft fails validation

- **WHEN** a saved or pasted draft contains `policy_id: htf_state_gate` on any catalog-supported HTF context consumer
- **THEN** validate returns an error for unsupported policy_id (no auto-migration)

### Requirement: Composer authors htf_regime_gate with allowed_regimes

For catalog-supported consumers where `context_consumption_policies` includes `htf_regime_gate`, Strategy Composer SHALL offer that policy in the `policy_id` selector and render `params.allowed_regimes` as a multiselect of catalog enum values `aligned`, `countertrend`, and `neutral`. The saved draft MUST serialize:

```yaml
context_consumption:
  context_ref: <explicit_ref>
  policy:
    policy_id: htf_regime_gate
    params:
      allowed_regimes: ["aligned", "neutral"]
```

Composer MUST NOT write `allowed_states`, raw `up`/`down`/`neutral`, or `resolved_regime` into strategy config. Composer MUST NOT compute side-relative mapping in the browser. Composer MUST NOT offer `htf_state_gate` or `allowed_states` for catalog-supported HTF context consumers.

#### Scenario: User selects regime gate and allowed regimes

- **GIVEN** catalog lists `htf_regime_gate` for the HTF context consumer `component_id`
- **AND** `strategy.contexts` defines `htf_4h`
- **WHEN** the user enables context consumption, selects `context_ref: htf_4h`, policy `htf_regime_gate`, and checks `aligned` and `neutral`
- **THEN** saved JSON contains `allowed_regimes: ["aligned", "neutral"]` under `policy.params`
- **AND** does not contain `allowed_states`

#### Scenario: HTF context consumption policy dropdown shows HTF regime gate only

- **WHEN** user enables context consumption on a catalog-supported HTF context consumer
- **THEN** policy dropdown lists `HTF regime gate` (`htf_regime_gate`) and does not list `HTF state gate`

#### Scenario: Saved payload excludes allowed_states

- **WHEN** user saves a catalog-supported HTF context consumer with `htf_regime_gate`
- **THEN** serialized `context_consumption.policy.params` contains `allowed_regimes` only (no `allowed_states`)

#### Scenario: Policy availability is catalog-driven

- **GIVEN** catalog response for a component does not include `htf_regime_gate`
- **WHEN** the user opens context consumption for that component
- **THEN** `htf_regime_gate` is not offered in the policy selector
