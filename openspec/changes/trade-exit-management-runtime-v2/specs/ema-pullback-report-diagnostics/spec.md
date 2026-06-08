## ADDED Requirements

### Requirement: Managed mode extends closed-trade diagnostics with exit attribution
When `exit_management.mode` is `managed` and a trade is closed, the nested `trade_management` object on that closed trade record SHALL include managed exit attribution fields:

- `active_stop_at_exit` (price or null)
- `active_take_at_exit` (profile action or descriptor)
- `exit_layer` (`exit_policy` or `exit_management`)
- `exit_rule_id`
- `exit_component_id`

These fields SHALL be generic across all managed components and SHALL NOT require component-specific report keys.

#### Scenario: Managed breakeven close includes layer attribution
- **GIVEN** a managed report where a trade closed via `break_even_stop`
- **WHEN** the trade record is read
- **THEN** `trade_management.exit_layer` is `exit_management`
- **AND** `trade_management.exit_component_id` is `break_even_stop`
- **AND** `trade_management.active_stop_at_exit` is populated

#### Scenario: Exit policy close retains exit_policy layer
- **GIVEN** a managed report where a trade closed via initial stop loss without a winning managed candidate
- **WHEN** the trade record is read
- **THEN** `trade_management.exit_layer` is `exit_policy`

### Requirement: Managed variant metrics include layer breakdowns
When a variant is produced from a managed config with at least one closed trade, `trade_management_summary` SHALL include generic breakdown sections:

- `exit_layer_breakdown`
- `stop_management_breakdown` keyed by `rule_id` and/or `component_id`
- `take_management_breakdown` keyed by `rule_id` and/or `component_id`
- `runtime_exit_breakdown` keyed by `rule_id` and/or `component_id`

Adding a new managed component SHALL populate these breakdowns without a report schema change.

#### Scenario: Stop management breakdown includes break_even_stop
- **GIVEN** a managed report with closes attributed to `break_even_stop`
- **WHEN** variant metrics are read
- **THEN** `trade_management_summary.stop_management_breakdown` includes an entry for `break_even_stop`

#### Scenario: Take management breakdown includes profile switch
- **GIVEN** a managed report where `take_profile_switch` changed outcomes
- **WHEN** variant metrics are read
- **THEN** `trade_management_summary.take_management_breakdown` includes an entry for `take_profile_switch`

### Requirement: Managed event trace includes all uniform managed event types
When `exit_management.mode` is `managed`, the variant payload `trade_management_events` SHALL include the uniform managed event types when emitted:

- `phase_changed`
- `active_stop_updated`
- `active_take_updated`
- `runtime_exit_triggered`
- `exit_rule_triggered`
- `exit_executed`

#### Scenario: Managed report includes active stop update events
- **GIVEN** a managed run where an active stop was placed
- **WHEN** the full report is loaded
- **THEN** `trade_management_events` contains at least one `active_stop_updated` event

### Requirement: Comparison summary supports generic baseline versus managed analysis
When a comparison run provides baseline and managed variants, the managed variant metrics SHALL include `baseline_vs_managed_summary` with generic fields including:

- `saved_by_managed_stop`
- `hurt_by_managed_stop`
- `take_disabled_then_won`
- `take_disabled_then_lost`
- `runtime_exit_helped`
- `runtime_exit_hurt`
- `exit_layer_transition_matrix`

Component-specific labels such as `be_helped` SHALL be derived views and SHALL NOT be required as separate top-level report schema fields.

#### Scenario: Comparison summary present for paired runs
- **GIVEN** a comparison artifact with baseline and managed variants on the same fixture
- **WHEN** the managed variant metrics are read
- **THEN** `baseline_vs_managed_summary` is present
- **AND** `exit_layer_transition_matrix` is populated

## MODIFIED Requirements

### Requirement: Variant metrics include trade management summary
When at least one closed trade contains trade-management diagnostics, the variant metrics SHALL include `trade_management_summary`.

For `diagnostic_only` reports, existing v1 summary fields (`by_phase_reached`, `runner_capture_summary`, exit-layer diagnostics where present) SHALL remain supported.

For `managed` reports, `trade_management_summary` SHALL additionally include the managed layer breakdown fields defined in this change.

#### Scenario: Diagnostic-only summary unchanged
- **GIVEN** a report produced from `mode: "diagnostic_only"`
- **WHEN** variant metrics are read
- **THEN** `trade_management_summary.by_phase_reached` is present when phases were reached
- **AND** managed-only breakdown fields are absent or empty

#### Scenario: Managed summary includes layer breakdowns
- **GIVEN** a report produced from `mode: "managed"` with closed trades
- **WHEN** variant metrics are read
- **THEN** `trade_management_summary.exit_layer_breakdown` is present
