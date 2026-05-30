# workbench-strategy-contexts Delta Specification

## ADDED Requirements

### Requirement: Composer Setup section is a catalog-driven setup list

The Research Workbench Composer Setup pipeline section SHALL render a **list** of setup component instances per strategy instance, not a singleton component selector. Authors MUST be able to add a setup from the catalog (`role: setup`), configure params per catalog schema (including nested `params` when `params_storage` is `nested`), remove a setup instance, and edit `instance_id`. The UI MUST NOT branch on specific setup `component_id` strings.

#### Scenario: Add second setup from catalog

- **GIVEN** a draft with one `untouched_anchor_setup` in `strategy.setups`
- **WHEN** the user clicks Add setup and selects `ema_bounce_counter_setup` from the catalog
- **THEN** the draft contains two entries in `strategy.setups` with distinct `instance_id` values

#### Scenario: Remove setup instance

- **GIVEN** a draft with two setup instances
- **WHEN** the user removes one instance
- **THEN** the draft `strategy.setups` array contains only the remaining instance

#### Scenario: No hardcoded ema_bounce_counter_setup UI branch

- **GIVEN** the component catalog defines params for `ema_bounce_counter_setup`
- **WHEN** the user edits that setup instance in Composer
- **THEN** param fields are rendered from catalog `params_schema` only
- **AND** Composer source does not contain strategy-specific `if (component_id === "ema_bounce_counter_setup")` branches for setup params

### Requirement: Composer normalizes legacy singleton setup on load

When a draft or loaded config contains legacy `strategy.setup` object and no `strategy.setups`, Composer normalization for editing SHALL convert it to `setups: [{ instance_id: "setup", ... }]`, removing legacy `setup` from the in-memory draft. Saving or validate SHALL send only `strategy.setups`.

#### Scenario: Open legacy config in Composer

- **GIVEN** a config file with `strategy.setup` only
- **WHEN** the user opens it in Composer
- **THEN** the Setup section shows one list item
- **AND** the draft uses `strategy.setups` not `strategy.setup`

#### Scenario: Save dual-setup draft

- **GIVEN** the user configured `untouched_anchor_setup` and `ema_bounce_counter_setup` in the Setup list
- **WHEN** the user saves or validates the draft
- **THEN** JSON contains `strategy.setups` with both instances
- **AND** JSON does not contain `strategy.setup`

## MODIFIED Requirements

### Requirement: Context consumption UI is catalog-driven per component

For component forms where catalog `supports_context_consumption` is true, Composer SHALL show an optional **Context consumption** subsection with: enable/disable (where optional), `context_ref` selector populated from **defined** `strategy.contexts` keys, `policy_id` selector filtered by catalog, and dynamic params from `params_schema`. Exit policy with non-empty profile exit groups MUST require consumption fields (mirror loader validation). For **setup list** instances, consumption controls apply per list item when the selected setup component supports consumption.

#### Scenario: Unsupported setup hides consumption UI

- **WHEN** catalog marks `supports_context_consumption: false` for a setup `component_id` on a given list item
- **THEN** that setup list item form does not render context consumption controls
