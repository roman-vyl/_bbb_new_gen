## ADDED Requirements

### Requirement: Composer authors htf_regime_gate with allowed_regimes

For catalog-supported consumers where `context_consumption_policies` includes `htf_regime_gate`, Strategy Composer SHALL offer that policy in the `policy_id` selector and render `params.allowed_regimes` as a multiselect of catalog enum values `aligned`, `countertrend`, and `neutral`. The saved draft MUST serialize:

```yaml
context_consumption:
  context_ref: <explicit_ref>
  policy:
    policy_id: htf_regime_gate
    params:
      allowed_regimes: [<one or more of aligned, countertrend, neutral>]
```

Composer MUST NOT write `allowed_states`, raw `up`/`down`/`neutral`, or `resolved_regime` into strategy config. Composer MUST NOT compute side-relative mapping in the browser.

#### Scenario: User selects regime gate and allowed regimes

- **GIVEN** catalog lists `htf_regime_gate` for the blocker `component_id`
- **AND** `strategy.contexts` defines `htf_4h`
- **WHEN** the user enables context consumption, selects `context_ref: htf_4h`, policy `htf_regime_gate`, and checks `aligned` and `neutral`
- **THEN** saved JSON contains `allowed_regimes: ["aligned", "neutral"]` under `policy.params`
- **AND** does not contain `allowed_states`

#### Scenario: Policy availability is catalog-driven

- **GIVEN** catalog response for a component does not include `htf_regime_gate`
- **WHEN** the user opens context consumption for that component
- **THEN** `htf_regime_gate` is not offered in the policy selector

### Requirement: Empty allowed_regimes blocks draft save

When `policy_id` is `htf_regime_gate`, client-side draft validation MUST fail if `params.allowed_regimes` is missing, not a list, or empty. Composer MUST surface validation feedback and MUST NOT treat the draft as valid for save until at least one regime is selected.

#### Scenario: Regime gate without selection fails validation

- **GIVEN** context consumption enabled with `policy_id: htf_regime_gate` and empty `allowed_regimes`
- **WHEN** the user attempts save or validate
- **THEN** client-side validation reports missing/empty `allowed_regimes`
- **AND** save does not proceed as a valid draft

### Requirement: htf_regime_gate load and save roundtrip

Composer MUST load existing backend configs with `htf_regime_gate` and restore `context_ref`, `policy_id`, and `allowed_regimes` in the UI without rewriting to `htf_state_gate` or injecting defaults.

#### Scenario: Reload preserves regime gate config

- **GIVEN** a saved strategy blocker with `context_consumption` using `htf_regime_gate` and `allowed_regimes: ["aligned", "neutral"]`
- **WHEN** the user reopens the draft in Composer
- **THEN** the UI shows the same `context_ref`, policy, and selected regimes
- **AND** a subsequent save emits the same policy shape

### Requirement: Legacy htf_state_gate unchanged in Composer

Composer MUST continue to support `htf_state_gate` with `params.allowed_states` (`up`, `down`, `neutral`). Composer MUST NOT auto-migrate loaded configs to `htf_regime_gate` on open or save.

#### Scenario: State gate config roundtrips unchanged

- **GIVEN** a blocker with `policy_id: htf_state_gate` and `allowed_states: ["up"]`
- **WHEN** the user opens and saves without changing policy
- **THEN** JSON still contains `htf_state_gate` and `allowed_states`, not `allowed_regimes`

### Requirement: Diagnostics display regime gate fields without recomputation

Where Composer or chart/report UI displays context consumption trace or attribution, it MUST render backend-supplied fields such as `allowed_regimes`, `raw_state`, `evaluated_side`, and `resolved_regime` when present. UI MUST NOT derive `resolved_regime` from raw state and trade side in the browser.

#### Scenario: Trace shows backend resolution fields

- **GIVEN** a signal trace record for `htf_regime_gate` with `resolved_regime: countertrend` in the payload
- **WHEN** the user inspects context consumption in the bar inspector
- **THEN** the UI shows `resolved_regime: countertrend` from the payload
- **AND** does not recompute regime from `raw_state` and direction locally
