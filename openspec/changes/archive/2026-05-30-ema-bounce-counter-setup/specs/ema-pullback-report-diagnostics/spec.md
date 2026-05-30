## ADDED Requirements

### Requirement: Bounce counter entry diagnostics are available for configured setup

When an `ema_pullback` run uses `ema_bounce_counter_setup`, closed trade diagnostics SHALL include optional entry-bar bounce counter fields when the setup trace/state is available:

- `entry_trend_episode_id`
- `entry_effective_bounce_number`
- `entry_completed_bounce_count`
- `entry_bounce_counter_side`

These fields SHALL snapshot the setup component state at the trade's `entry_idx`. They MUST NOT be inferred from the number of trades, from later exit state, or from post-hoc raw-touch counting.

#### Scenario: Closed trade records bounce state at entry

- **GIVEN** a strategy run uses `ema_bounce_counter_setup`
- **AND** a closed long trade enters while `trend_episode_id` is `7`, `effective_bounce_number` is `2`, and `completed_bounce_count` is `1`
- **WHEN** the report builds the closed trade record
- **THEN** the record includes `entry_trend_episode_id: 7`
- **AND** `entry_effective_bounce_number: 2`
- **AND** `entry_completed_bounce_count: 1`
- **AND** `entry_bounce_counter_side: long`

#### Scenario: Diagnostics absent when setup is not configured

- **GIVEN** a strategy run uses a setup component other than `ema_bounce_counter_setup`
- **WHEN** the report builds closed trade records
- **THEN** bounce counter entry diagnostic fields are absent or `null`
- **AND** existing report diagnostics remain valid

#### Scenario: Entry diagnostics use entry index not exit index

- **GIVEN** a trade enters during bounce number `1`
- **AND** exits after the setup counter has advanced to a later bounce number
- **WHEN** the report builds the closed trade record
- **THEN** `entry_effective_bounce_number` reflects the setup state at `entry_idx`
- **AND** it does not reflect setup state at the exit bar

### Requirement: Bounce counter breakdowns can group variant performance

When bounce counter entry diagnostics are present, variant metrics MAY include bounce-level breakdowns keyed by side and entry effective bounce number. Any such breakdown SHALL be computed from closed `trade_records` only and SHALL preserve additive trade counts.

#### Scenario: Bounce breakdown counts closed trades

- **GIVEN** a variant has closed trade records with `entry_effective_bounce_number` values `1`, `2`, and `3`
- **WHEN** bounce counter breakdown metrics are computed
- **THEN** the sum of breakdown trade counts equals the number of closed trades with bounce counter diagnostics
- **AND** open trades are excluded from the breakdown

#### Scenario: Breakdown separates side

- **GIVEN** a variant has long and short closed trades with the same `entry_effective_bounce_number`
- **WHEN** bounce counter breakdown metrics are computed by side
- **THEN** long and short trades are not merged into the same side-specific bucket
