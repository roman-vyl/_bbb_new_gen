## ADDED Requirements

### Requirement: Closed trades include optional trade-management diagnostics
When diagnostic-only exit management is enabled and a trade is closed, the research report SHALL include a nested `trade_management` object on that closed trade record. Open trades MAY omit this object in v1.

The nested object SHALL include phase-at-exit diagnostics, max phase reached, bars-to-phase fields when reached, MFE-at-phase fields when reached, active-stop source/price at exit when available, exit-layer attribution when available, best price before exit, and giveback from best price.

Missing phase milestones SHALL be omitted or set to `null`; they MUST NOT be serialized as zero if the phase was not reached.

#### Scenario: Closed runner trade includes phase diagnostics
- **GIVEN** a diagnostic-only backtest closes a trade that reached `runner`
- **WHEN** the report builds the closed trade record
- **THEN** the trade record includes `trade_management.phase_at_exit: "runner"`
- **AND** `trade_management.max_phase_reached: "runner"`
- **AND** `trade_management.bars_to_proven`, `bars_to_protected`, and `bars_to_runner` are populated
- **AND** `trade_management.mfe_at_runner_pct` is populated

#### Scenario: Initial-risk trade does not fake later milestones
- **GIVEN** a diagnostic-only backtest closes a trade that never leaves `initial_risk`
- **WHEN** the report builds the closed trade record
- **THEN** `trade_management.phase_at_exit` is `initial_risk`
- **AND** `trade_management.max_phase_reached` is `initial_risk`
- **AND** runner-only fields are omitted or `null`
- **AND** runner-only fields are not serialized as `0`

#### Scenario: Open trades omit v1 runtime diagnostics
- **GIVEN** a diagnostic-only backtest has an open trade at report time
- **WHEN** the report builds trade records
- **THEN** the open trade omits the nested `trade_management` object in v1
- **AND** existing open-trade fields continue to serialize as before

### Requirement: Variant metrics include trade-management summary
When at least one closed trade contains trade-management diagnostics, the variant metrics SHALL include `trade_management_summary`.

The summary SHALL include:

- `by_phase_reached`
- `phase_transition_counts`
- `exit_layer_breakdown`
- `active_stop_source_breakdown`
- `runner_capture_summary`
- `protected_trade_summary`

For each phase bucket in `by_phase_reached`, the summary SHALL include trade count, share of all closed trades, PnL, profit factor, win rate, average MFE percent, p75 MFE percent, p90 MFE percent, average giveback percent, median giveback percent, average capture ratio, median capture ratio, and exit reason mix when computable.

#### Scenario: Phase reached counts sum by closed trades
- **GIVEN** a diagnostic-only report has closed trades with max phases `initial_risk`, `proven`, `protected`, and `runner`
- **WHEN** variant metrics are built
- **THEN** `trade_management_summary.by_phase_reached` contains buckets for those phases
- **AND** each bucket's `trade_count` equals the number of closed trades whose `max_phase_reached` is that phase
- **AND** each bucket's `share_of_all_trades` is computed against all closed trades in the variant

#### Scenario: Runner summary measures capture and giveback
- **GIVEN** a diagnostic-only report has closed trades that reached `runner`
- **WHEN** variant metrics are built
- **THEN** `trade_management_summary.runner_capture_summary` includes runner trade count
- **AND** it includes runner giveback metrics computed from best price before exit
- **AND** it includes runner exit-layer mix when exit-layer attribution is available

#### Scenario: No runtime diagnostics omits summary
- **GIVEN** a report was produced from a config without `exit_management`
- **WHEN** variant metrics are built
- **THEN** `trade_management_summary` is absent
- **AND** existing diagnostic sections continue to serialize as before

### Requirement: Diagnostic reports include runtime event trace
When diagnostic-only exit management is enabled, the variant payload SHALL include `trade_management_events` containing runtime events emitted for phase changes and executed exits. The event trace SHALL be ordered by bar index and event creation order within the bar.

Each event SHALL include trade id, time, bar index, side, event type, phase transition fields, rule/component identifiers when available, price/stop fields when available, MFE/MAE percent, bars in trade, and metadata.

#### Scenario: Variant includes phase transition event
- **GIVEN** a diagnostic-only trade moves from `initial_risk` to `proven`
- **WHEN** the report builds the variant payload
- **THEN** `trade_management_events` includes a `phase_changed` event for that trade
- **AND** the event identifies the triggering phase rule id

#### Scenario: Variant omits event trace when runtime disabled
- **GIVEN** a report was produced from a config without `exit_management`
- **WHEN** the report builds the variant payload
- **THEN** `trade_management_events` is absent

### Requirement: Trade-management diagnostics remain additive for report compatibility
Reports with trade-management diagnostics SHALL remain backward-compatible for existing readers that ignore unknown optional fields. Historical reports without nested trade-management diagnostics MUST load unchanged and MUST NOT be silently migrated.

#### Scenario: Historical report loads without trade-management block
- **GIVEN** a persisted report with `report_schema_version` 6 and no `trade_management_summary`
- **WHEN** result loading or candidate summary extraction reads the report
- **THEN** loading succeeds
- **AND** the payload is not mutated to add empty trade-management diagnostics

#### Scenario: New diagnostics do not break summary extraction
- **GIVEN** a new diagnostic-only report includes nested closed-trade `trade_management` blocks
- **AND** variant metrics include `trade_management_summary`
- **WHEN** batch summary extraction runs
- **THEN** extraction succeeds
- **AND** existing summary fields retain their previous meaning
