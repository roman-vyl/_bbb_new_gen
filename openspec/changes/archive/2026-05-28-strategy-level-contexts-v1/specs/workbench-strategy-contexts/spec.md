## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Exit policy context provider fields in Composer

**Reason**: Provider fields belong in Strategy contexts; exit policy is a consumer only.

**Migration**: Authors recreate configs in target shape. Composer MUST NOT load or edit `exit_policy.context` for new drafts. Optional one-off script may rewrite stored JSON outside Composer — not a Composer migration banner that reintroduces the old shape as editable.
