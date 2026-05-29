# workbench-strategy-contexts Specification

## Purpose
TBD - created by archiving change strategy-level-contexts-v1. Update Purpose after archive.
## Requirements
### Requirement: Composer exposes Strategy contexts section at instance level

The Research Workbench Composer SHALL provide a **Strategy contexts** section for each strategy instance where authors add, edit, and remove `context_ref` provider entries. HTF provider fields (timeframe, source, fast/anchor/slow periods) MUST appear only in this section, not under Exit policy.

#### Scenario: Author adds HTF provider

- **WHEN** the user adds context `htf` with `component_id: htf_context` and valid periods in Strategy contexts
- **THEN** saved draft JSON contains `strategy.contexts.htf` with those fields

#### Scenario: Exit policy form has no HTF provider fields

- **WHEN** the user opens Trade management → Exit policy
- **THEN** timeframe and EMA period inputs for HTF provider config are not rendered there

#### Scenario: Composer does not author exit_policy.context

- **WHEN** the user saves a strategy draft from Composer after this change
- **THEN** the JSON MUST NOT contain `trade_management.exit_policy.context`

#### Scenario: Historical report does not seed legacy draft shape

- **WHEN** a user opens a historical report whose embedded `strategy_spec` still contains `trade_management.exit_policy.context`
- **THEN** Composer does not populate an editable draft in the old shape and does not expose legacy exit provider fields

### Requirement: Context consumption UI is catalog-driven per component

For component forms where catalog `supports_context_consumption` is true, Composer SHALL show an optional **Context consumption** subsection with: enable/disable (where optional), `context_ref` selector populated from **defined** `strategy.contexts` keys, `policy_id` selector filtered by catalog, and dynamic params from `params_schema`. Exit policy with non-empty profile exit groups MUST require consumption fields (mirror loader validation).

#### Scenario: Unsupported setup hides consumption UI

- **WHEN** catalog marks `supports_context_consumption: false` for the setup component_id
- **THEN** the setup form does not render context consumption controls

#### Scenario: Enabled consumption requires explicit context_ref

- **WHEN** the user enables context consumption but selects no `context_ref`
- **THEN** client-side draft validation fails and validate API is not called with incomplete consumption

#### Scenario: Exit policy with profile exits requires consumption in UI

- **WHEN** the user configures non-empty profile-scoped exits in Exit policy
- **THEN** Composer requires `context_consumption` with explicit `context_ref` and `policy_id` before save/validate succeeds

### Requirement: No auto-select of first context_ref

The Composer MUST NOT pre-fill `context_consumption.context_ref` with the first key from `strategy.contexts` when the user enables consumption. The author MUST explicitly choose a ref.

#### Scenario: New consumption block has empty context_ref

- **WHEN** the user toggles context consumption on for exit policy
- **THEN** `context_ref` is unset until the user picks from the dropdown

### Requirement: Disabled consumption omits keys from JSON

When context consumption is disabled on an optional entry component, the saved strategy instance MUST NOT include `context_consumption` (no null placeholders).

#### Scenario: Save strips context_consumption on optional entry component

- **WHEN** the user disables context consumption on a blocker and saves
- **THEN** the blocker object in JSON has no `context_consumption` property

### Requirement: Composer does not compute HTF or EMA indicators

The frontend MUST NOT calculate HTF EMA stacks, context state, or consumption outcomes in the browser for validation or preview. All policy and provider validation MUST use research_api validate/catalog endpoints.

#### Scenario: Validate delegates policy check to API

- **WHEN** the user submits a draft with invalid `policy.params`
- **THEN** errors originate from the validate API response, not client-side indicator code

### Requirement: Chart HTF aux overlay uses explicit context_ref only

Chart HTF auxiliary overlays (periods, timeframe labels) MUST be derived from an explicitly selected `context_ref` into `strategy.contexts`. Acceptable sources are: (a) user-selected chart display config field (e.g. `chart.context_overlay_ref`), (b) explicit picker listing `strategy.contexts` keys, or (c) the `context_ref` of the consumer being inspected (trade/bar diagnostics). The chart MUST NOT default to the first HTF provider or the only context entry.

#### Scenario: Overlay follows explicit chart display ref

- **WHEN** chart display config sets `context_overlay_ref: macro_htf` and `contexts.macro_htf.slow_period` is `500`
- **THEN** chart HTF overlay legend or config reflects periods from `macro_htf`, not from another context ref

#### Scenario: No first-provider default when multiple contexts exist

- **WHEN** `strategy.contexts` defines both `htf` and `macro_htf` and no explicit chart overlay ref is set
- **THEN** the chart does not render HTF aux overlay periods until the user selects a `context_ref`

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

### Requirement: policy_id must be listed for the component role

When `context_consumption` is enabled on a catalog-supported consumer, client-side draft validation MUST reject `policy.policy_id` values that are not listed in `context_consumption_policies` for that `(role, component_id)`. The same rule applies to `exit_policy.context_consumption` against `context_consumption_roles` for `exit_policy`.

#### Scenario: Loaded draft with unknown policy_id fails validation

- **GIVEN** a blocker whose catalog lists only `htf_state_gate`
- **AND** a loaded draft with `policy_id: htf_regime_gate`
- **WHEN** client-side draft validation runs
- **THEN** validation fails on `context_consumption.policy.policy_id` with a message that the policy is not supported for this component

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

