# strategy-instance-contexts Specification

## Purpose
TBD - created by archiving change strategy-level-contexts-v1. Update Purpose after archive.
## Requirements
### Requirement: Strategy instance declares context providers under contexts

Each strategy instance JSON SHALL include a root-level `contexts` object (default `{}`) mapping **context_ref** strings to provider configurations. `context_ref` keys are case-sensitive and used as-is. Non-empty `contexts` MUST be provided when any consumer references a context or when a feature/provider requires context inputs. Each provider entry MUST include `component_id` identifying a catalog-registered **context provider** component. Provider entries MUST NOT include consumer policies, trading rules, or exit profile names. Multiple providers (e.g. `htf`, `macro_htf`, `local_htf`) MAY coexist; consumers select which ref to use.

#### Scenario: Valid HTF provider at strategy level

- **WHEN** a strategy instance defines `contexts.htf` with `component_id: htf_context`, valid timeframe, `source: close`, and periods satisfying `fast < anchor < slow`
- **THEN** the research family loader accepts the instance without `trade_management.exit_policy.context`

#### Scenario: Case-sensitive refs are distinct

- **WHEN** `contexts` defines both `htf` and `HTF`
- **THEN** validation treats them as two distinct `context_ref` keys and keeps both entries

#### Scenario: Unknown provider component_id rejected

- **WHEN** `contexts.foo.component_id` is not registered as a context provider for the strategy family
- **THEN** validation fails with an error identifying the unknown provider

### Requirement: HTF provider parameters match relocated HtfContext rules

For `component_id: htf_context`, the provider entry MUST require non-empty `timeframe`, `source: close`, strictly positive periods, and `fast_period < anchor_period < slow_period`. Validation error messages MUST reference `strategy.contexts.<context_ref>`, not `trade_management.exit_policy.context`.

#### Scenario: Invalid period ordering fails at contexts path

- **WHEN** `contexts.htf.fast_period >= anchor_period`
- **THEN** validation fails referencing `strategy.contexts.htf`

### Requirement: ContextBundle builds once after feature enrichment

The research runtime SHALL construct a `ContextBundle` exactly once per backtest/trace run after OHLCV feature enrichment and before consumer components read context. The bundle MUST expose `ContextOutput` values keyed by `context_ref`. Provider execution MUST NOT depend on which consumers reference the bundle.

#### Scenario: Bundle contains all declared providers

- **WHEN** a spec defines `contexts.htf` and `contexts.macro_htf`
- **THEN** `ContextBundle.get("htf")` and `ContextBundle.get("macro_htf")` return outputs after build

#### Scenario: Provider does not receive consumer policy

- **WHEN** `ContextBundle.build` runs
- **THEN** provider components are invoked only with provider config and enriched dataframe columns, not with `context_consumption.policy`

### Requirement: Feature plan sources HTF columns from strategy contexts only

The ema_pullback feature plan SHALL register HTF indicator columns from `strategy.contexts` provider entries only. It MUST NOT read provider timeframe or periods from `trade_management.exit_policy.context`.

#### Scenario: HTF columns align to contexts timeframe

- **WHEN** `contexts.htf.timeframe` is `4h` with defined periods
- **THEN** the feature plan requests HTF EMA columns for that timeframe and periods

### Requirement: Nested exit_policy.context is rejected

Strategy instance JSON MUST NOT contain `trade_management.exit_policy.context`. The loader and research_api validate endpoint MUST reject instances that nest provider config under exit policy. The runtime MUST NOT dual-read or normalize legacy `exit_policy.context` on load.

#### Scenario: exit_policy.context rejected

- **WHEN** an instance includes `trade_management.exit_policy.context`
- **THEN** validation fails instructing authors to use `strategy.contexts` and `exit_policy.context_consumption`

#### Scenario: No runtime legacy path

- **WHEN** an instance includes only legacy `exit_policy.context` and no `strategy.contexts`
- **THEN** validation fails; the loader MUST NOT build a ContextBundle from the legacy nested path

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

