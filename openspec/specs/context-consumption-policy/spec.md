# context-consumption-policy Specification

## Purpose
TBD - created by archiving change strategy-level-contexts-v1. Update Purpose after archive.
## Requirements
### Requirement: Optional context_consumption block on supported consumers

A strategy component instance (setup, trigger, blocker, filter, exit_policy, or future entry/exit slots) MAY include `context_consumption`. When omitted, the component MUST execute without reading `ContextBundle`, except where another requirement mandates consumption (exit policy with profile-scoped exits). When present, it MUST include `context_ref` and `policy` with `policy_id`.

#### Scenario: Entry component without consumption ignores bundle

- **WHEN** `setup` has no `context_consumption` block
- **THEN** setup signal generation MUST NOT call `ContextBundle.get`

#### Scenario: Consumption requires context_ref and policy_id

- **WHEN** `context_consumption` is present but `policy_id` is missing
- **THEN** validation fails before backtest execution

### Requirement: context_ref resolves only to declared strategy contexts

`context_consumption.context_ref` MUST match a key in `strategy.contexts`. The runtime and validators MUST NOT fall back to the first or only context when `context_ref` is missing, empty, or unknown.

#### Scenario: Unknown context_ref fails validation

- **WHEN** `context_consumption.context_ref` is `htf2` but `strategy.contexts` has only `htf`
- **THEN** validation fails naming the unknown ref

#### Scenario: No implicit first-context fallback at runtime

- **WHEN** `strategy.contexts` defines `htf` and `macro_htf` and a consumer omits `context_ref` while `context_consumption` is present
- **THEN** validation fails; the runtime MUST NOT select `htf` automatically

#### Scenario: Different consumers may use different context_ref values

- **WHEN** exit policy consumes `context_ref: htf` and a blocker consumes `context_ref: macro_htf`
- **THEN** each consumer reads the matching provider output from `ContextBundle` without implying a default ref for other consumers

### Requirement: Policy belongs to consumer not provider

`context_consumption.policy` MUST be interpreted by the **consumer** component role using a registered policy handler. Provider configuration MUST NOT include `policy_id` or consumer params. The frontend MUST NOT invent policies not exposed by the component catalog for that `(role, component_id)`.

#### Scenario: Provider entry has no policy_id field

- **WHEN** validating `strategy.contexts.htf`
- **THEN** `policy_id` under contexts is rejected if present

#### Scenario: Consumer policy changes mask without changing component_id

- **WHEN** an entry component keeps the same `component_id` but changes `context_consumption.policy.params`
- **THEN** entry mask results change accordingly without requiring a different catalog component_id

#### Scenario: Blocker policy changes mask without changing component_id

- **WHEN** a blocker keeps its original blocker `component_id` but changes `context_consumption.policy.params`
- **THEN** entry pipeline mask results change accordingly without requiring a different catalog component_id

### Requirement: Catalog declares supported consumption and allowed policies

For each `component_id` and consumer **role**, the research_api component catalog SHALL expose `supports_context_consumption: true` and a list of allowed `policy_id` values with parameter schemas. Components without support MUST NOT expose `context_consumption` fields in catalog-driven forms.

#### Scenario: Unsupported component rejects consumption in API validate

- **WHEN** validate receives `context_consumption` on a component_id with `supports_context_consumption: false`
- **THEN** the API returns the same error the research loader would emit

#### Scenario: Unknown policy_id for role rejected

- **WHEN** `policy_id` is not listed for `(role, component_id)` in the policy registry
- **THEN** validation fails naming the policy and role

### Requirement: Exit policy requires context_consumption when profile-scoped exits exist

If `trade_management.exit_policy.profiles` contains any non-empty `aligned`, `countertrend`, or `neutral` exit groups, `trade_management.exit_policy.context_consumption` MUST be present and valid. If `context_consumption` is absent, `exit_policy` MUST contain only `always_on` exits (profile groups empty or omitted). Loader and research_api validate MUST error when profile-scoped exits exist without `context_consumption`.

#### Scenario: Profile exits without context_consumption fail validation

- **WHEN** `exit_policy.profiles.aligned.exits` is non-empty and `exit_policy.context_consumption` is omitted
- **THEN** validation fails with an error requiring `context_consumption` for profile-scoped exits

#### Scenario: Always_on-only exit policy without context_consumption is valid

- **WHEN** `exit_policy` defines only non-empty `always_on.exits` and all profile exit groups are empty
- **THEN** validation succeeds without `context_consumption`

#### Scenario: Exit policy consumes context for profile bucket selection

- **GIVEN** non-empty profile exits and `context_consumption` with policy `exit_profile_by_htf_state`
- **WHEN** HTF state is `up` on a bar
- **THEN** the active profile bucket matches legacy aligned/countertrend/neutral mapping from pre-change baseline equivalence tests

### Requirement: Entry consumer policies gate without new component_id

Phase 3 SHALL introduce at least one reference entry consumer (setup or blocker) that uses `context_consumption` with a catalog-listed entry policy. The reference MUST use an existing `component_id` (not `htf_gated_*`).

#### Scenario: Reference blocker gates entries by HTF state

- **GIVEN** a blocker with `context_consumption` and policy allowing only `up`, and HTF state `down` on a bar
- **WHEN** the blocker runs after bundle build
- **THEN** the entry pipeline mask blocks entries on that bar

### Requirement: Execution layer does not apply consumer policies

Vectorbt execution and portfolio simulation MUST consume final masks, profile locks, and signals produced by compilers. They MUST NOT read `ContextBundle` or apply `policy_id` logic directly.

#### Scenario: Portfolio receives compiled masks only

- **WHEN** backtest runs with context-consuming exit policy
- **THEN** execution inputs match masks produced by exit compiler after policy application

