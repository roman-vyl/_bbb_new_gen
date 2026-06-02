## ADDED Requirements

### Requirement: Trend strength episode entry diagnostics for configured blocker

When an `ema_pullback` run includes `trend_strength_episode_blocker`, closed trade diagnostics SHALL include optional entry-bar fields when blocker trace/state is available at the trade's `entry_idx`:

- `entry_adx_peak`
- `entry_bars_since_adx_peak`
- `entry_adx_current`
- `entry_trend_strength_active`
- `entry_trend_strength_blocked_reason`

These fields SHALL snapshot blocker state at `entry_idx`. They MUST NOT be inferred from exit-bar state or from post-hoc trade outcome.

#### Scenario: Closed trade records peak context at entry

- **GIVEN** a run uses `trend_strength_episode_blocker`
- **AND** a closed long trade enters on bar `t` while episode conditions pass with `adx_peak` 28 and `bars_since_adx_peak` 12
- **WHEN** the report builds the closed trade record
- **THEN** `entry_adx_peak` is `28`
- **AND** `entry_bars_since_adx_peak` is `12`
- **AND** `entry_trend_strength_active` is true

#### Scenario: Diagnostics absent when blocker not configured

- **GIVEN** a strategy run does not include `trend_strength_episode_blocker`
- **WHEN** closed trade records are built
- **THEN** trend strength entry diagnostic fields are absent or null
- **AND** existing report diagnostics remain valid

#### Scenario: Entry diagnostics use entry index not exit index

- **GIVEN** a trade enters while `bars_since_adx_peak` is `10`
- **AND** at exit bar `bars_since_adx_peak` would be `40`
- **WHEN** the closed trade record is built
- **THEN** `entry_bars_since_adx_peak` reflects the value at `entry_idx`
- **AND** it does not reflect the exit bar value
