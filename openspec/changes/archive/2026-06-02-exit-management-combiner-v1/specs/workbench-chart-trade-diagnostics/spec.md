## ADDED Requirements

### Requirement: Selected trade diagnostics display break-even data read-only
When a selected trade includes a `break_even` object, Workbench trade diagnostics SHALL display a read-only Break-even section. The frontend MUST use API-provided fields and MUST NOT recompute break-even trigger, initial risk, or moved stop values from candles.

Displayed fields SHALL include:

- `enabled`
- `triggered`
- `trigger_r`
- `trigger_price`
- `trigger_time_ms`
- `stop_moved_to`
- `initial_stop_price`
- `initial_risk`
- `instance_id`
- `active_stop_management_source`

#### Scenario: Selected trade shows break-even section
- **GIVEN** the selected trade has a `break_even` object
- **WHEN** the Chart trade diagnostics panel renders
- **THEN** it shows a Break-even section
- **AND** the section displays the API-provided break-even fields

#### Scenario: Old trade omits break-even section
- **GIVEN** the selected trade has no `break_even` object
- **WHEN** the Chart trade diagnostics panel renders
- **THEN** the Break-even section is omitted
- **AND** the panel does not crash

#### Scenario: Frontend does not recompute break-even
- **GIVEN** candles and selected trade data are loaded
- **WHEN** the Break-even section renders
- **THEN** displayed values come from `trade.break_even`
- **AND** the frontend does not compute trigger price, initial risk, or stop movement from candle OHLC data

### Requirement: Break-even diagnostics do not add chart stop overlays
This slice SHALL NOT draw break-even stop lines or add new chart overlay runtime behavior.

#### Scenario: Break-even diagnostics are display-only
- **GIVEN** a selected trade includes `break_even`
- **WHEN** the Chart tab renders
- **THEN** no new stop-line overlay is added for break-even
- **AND** chart viewport, pan, and cache behavior remain unchanged
