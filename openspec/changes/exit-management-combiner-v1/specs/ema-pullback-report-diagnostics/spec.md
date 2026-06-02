## ADDED Requirements

### Requirement: Closed trade records include optional break-even diagnostics
Closed `ema_pullback` trade records SHALL support an optional `break_even` object when a `break_even_stop` rule was active for that trade. The object SHALL be sourced from the Exit Management Combiner runtime state, not inferred only from post-hoc OHLC after portfolio simulation.

When present, `break_even` SHALL include:

- `enabled`
- `instance_id`
- `trigger_r`
- `trigger_price`
- `triggered`
- `trigger_time`
- `stop_moved_to`
- `initial_stop_price`
- `initial_risk`
- `active_stop_management_source`

#### Scenario: Triggered break-even diagnostics
- **GIVEN** a closed trade had an active `break_even_stop` rule
- **AND** the trade reached the break-even trigger
- **WHEN** the report builds `trade_records`
- **THEN** the trade record includes `break_even.enabled` as true
- **AND** `break_even.triggered` is true
- **AND** `break_even.trigger_time` is set
- **AND** `break_even.stop_moved_to` equals the combiner moved stop
- **AND** `break_even.initial_risk` equals the entry-time stop distance

#### Scenario: Configured but never triggered break-even diagnostics
- **GIVEN** a closed trade had an active `break_even_stop` rule
- **AND** the trade never reached the break-even trigger
- **WHEN** the report builds `trade_records`
- **THEN** the trade record includes `break_even.enabled` as true
- **AND** `break_even.triggered` is false
- **AND** `break_even.trigger_time` is null
- **AND** `break_even.stop_moved_to` is null

#### Scenario: No active management omits diagnostics
- **GIVEN** a closed trade had no active `break_even_stop` rule
- **WHEN** the report builds `trade_records`
- **THEN** the `break_even` object is absent or has `enabled` false

#### Scenario: Profile override source is explicit
- **GIVEN** an `always_on` break-even rule exists
- **AND** the locked profile also has a break-even rule
- **WHEN** a trade opens under that locked profile
- **THEN** `trade_records[].break_even.instance_id` matches the profile rule
- **AND** `trade_records[].break_even.active_stop_management_source` is `profile`

#### Scenario: Always-on fallback source is explicit
- **GIVEN** an `always_on` break-even rule exists
- **AND** the locked profile has no break-even rule
- **WHEN** a trade opens
- **THEN** `trade_records[].break_even.instance_id` matches the `always_on` rule
- **AND** `trade_records[].break_even.active_stop_management_source` is `always_on`

### Requirement: Historical reports load without break-even diagnostics
Report readers and API contracts SHALL continue to accept historical reports whose `trade_records` do not contain `break_even`.

#### Scenario: Old report without break-even loads
- **GIVEN** a persisted report was created before break-even diagnostics existed
- **WHEN** the report is loaded through the API
- **THEN** the payload is returned without validation error
- **AND** missing `break_even` fields are treated as absent optional diagnostics
