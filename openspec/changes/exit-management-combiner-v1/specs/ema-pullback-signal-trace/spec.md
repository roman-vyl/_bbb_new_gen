## ADDED Requirements

### Requirement: Signal Trace exposes exit-management diagnostics
When a traced `ema_pullback` run uses stateful exit-management rules, Signal Trace SHALL expose optional per-bar exit-management diagnostic fields sourced from the Exit Management Combiner.

Optional fields:

- `effective_stop_price`
- `pending_stop_price`
- `break_even_active`
- `break_even_triggered_on_bar`
- `break_even_trigger_price`
- `break_even_stop_moved_to`
- `break_even_initial_risk`
- `break_even_instance_id`
- `active_stop_management_source`

#### Scenario: Trigger bar shows pending break-even stop
- **GIVEN** Signal Trace is built for a trade that triggers `break_even_stop` on bar `t`
- **WHEN** the trace row for bar `t` is returned
- **THEN** `break_even_triggered_on_bar` is true
- **AND** `effective_stop_price` still equals the old effective stop
- **AND** `pending_stop_price` equals the break-even moved stop

#### Scenario: Next bar shows promoted effective stop
- **GIVEN** `break_even_stop` triggered on bar `t`
- **WHEN** the trace row for bar `t+1` is returned
- **THEN** `effective_stop_price` equals the moved break-even stop
- **AND** `pending_stop_price` is null or absent for the already-promoted stop

#### Scenario: Trace source identifies profile override
- **GIVEN** the active break-even rule came from the locked profile
- **WHEN** Signal Trace rows for the active trade are returned
- **THEN** `active_stop_management_source` is `profile`
- **AND** `break_even_instance_id` equals the profile rule instance id

### Requirement: Signal Trace compatibility without management
Signal Trace SHALL remain backward compatible for runs and historical trace payloads that do not include exit-management diagnostics.

#### Scenario: No management omits optional fields
- **GIVEN** a strategy config has no `trade_management.exit_management` rules
- **WHEN** Signal Trace is returned
- **THEN** exit-management diagnostic fields are absent or null
- **AND** existing trace fields remain valid

#### Scenario: BFF preserves exit-management fields
- **GIVEN** research Signal Trace contains exit-management diagnostic fields
- **WHEN** `research_api` converts it to the API contract
- **THEN** the API response preserves those fields
- **AND** it does not drop `effective_stop_price`, `pending_stop_price`, or break-even fields
