## ADDED Requirements

### Requirement: Setup component registration

The `ema_pullback` strategy family SHALL expose `anchor_stack_width_setup` as a setup component with `role: setup` and `component_id: anchor_stack_width_setup`. The component MUST NOT be registered or usable as a trigger, blocker, exit, direction, or risk component. Authors configure it only as an element of `strategy.setups[]`.

#### Scenario: Component catalog exposes setup role

- **GIVEN** the component catalog is built for `ema_pullback`
- **WHEN** the catalog lists setup components
- **THEN** `anchor_stack_width_setup` appears under `role: setup`
- **AND** it does not appear under trigger, blocker, exit, direction, or risk roles

#### Scenario: Entry composition keeps direction and trigger separate

- **GIVEN** a strategy uses `anchor_stack_width_setup` in `strategy.setups`
- **AND** uses `direction.component_id: ema_anchor_stack_trend` and a trigger such as `reclaim_anchor`
- **WHEN** entry signals are composed
- **THEN** aggregate `setup_ok` requires `setup_allowed` from this setup instance (AND with other setups)
- **AND** entries still require direction and trigger signals unchanged

### Requirement: Configuration and validation

The component SHALL accept params `atr_timeframe`, `atr_period`, `min_current_width_atr`, `min_recent_width_atr`, and `width_lookback_bars` on its `strategy.setups[]` entry (nested under `params` when using nested storage). For MVP, `atr_timeframe` MUST be `base`. `atr_period`, `min_current_width_atr`, `min_recent_width_atr`, and `width_lookback_bars` MUST be positive numbers/integers as applicable. Config identity generation MUST include these params.

Validation MUST NOT compare `min_recent_width_atr` to `min_current_width_atr` (no warning, hard reject, or special rule). Any positive pair is valid.

#### Scenario: Valid MVP config accepted

- **GIVEN** a setup entry with `component_id: anchor_stack_width_setup` and `instance_id: anchor_stack_width`
- **AND** params `atr_timeframe: base`, `atr_period: 14`, `min_current_width_atr: 2.0`, `min_recent_width_atr: 4.0`, `width_lookback_bars: 80`
- **WHEN** the strategy spec is loaded and validated
- **THEN** the setup config is accepted
- **AND** params participate in strategy/config identity

#### Scenario: Non-base ATR timeframe rejected in MVP

- **GIVEN** a setup entry with `component_id: anchor_stack_width_setup`
- **AND** `atr_timeframe` is not `base`
- **WHEN** the strategy spec is validated
- **THEN** validation rejects the config

#### Scenario: Non-positive params rejected

- **GIVEN** a setup entry with `component_id: anchor_stack_width_setup`
- **AND** any of `atr_period`, `min_current_width_atr`, `min_recent_width_atr`, or `width_lookback_bars` is zero or negative
- **WHEN** the strategy spec is validated
- **THEN** validation rejects the config

#### Scenario: min_recent below min_current is accepted

- **GIVEN** a setup entry with `min_current_width_atr: 4.0` and `min_recent_width_atr: 1.0`
- **WHEN** the strategy spec is validated
- **THEN** the setup config is accepted
- **AND** no cross-field ordering validation runs

### Requirement: Feature inputs from anchor stack and planned ATR

The component SHALL consume prepared columns for `fast_ema`, `anchor_ema`, and `slow_ema` derived from `strategy.anchor_stack` (not from per-setup EMA period params). It SHALL consume a prepared ATR column for the configured `atr_timeframe` and `atr_period`. The feature plan MUST request ATR for this setup instance. The component MUST NOT compute EMA or ATR internally.

#### Scenario: Feature plan includes ATR dependency

- **GIVEN** a strategy config includes `anchor_stack_width_setup` in `setups`
- **WHEN** the feature plan is built
- **THEN** the plan includes an ATR feature for `atr_timeframe` and `atr_period`
- **AND** setup column mapping includes fast, anchor, slow EMA ids from `strategy.anchor_stack`

#### Scenario: Missing prepared column fails clearly

- **GIVEN** a required EMA or ATR column is absent from prepared market data
- **WHEN** the setup component executes
- **THEN** execution fails with a clear error
- **AND** the component does not compute indicators inline

### Requirement: Width gate semantics

For each bar at index `t`, the component SHALL compute `width = abs(fast_ema - slow_ema)`, `width_atr = width / atr_value`, and `current_width_atr` as `width_atr` on bar `t`.

For MVP, `recent_max_width_atr` SHALL be the maximum of `width_atr` over an **inclusive** rolling window ending at the evaluated bar:

```text
window(t) = [t - width_lookback_bars + 1, t]   # both endpoints inclusive
recent_max_width_atr(t) = max(width_atr[i] for i in window(t))
```

The current bar `t` MUST be included in the window (standard inclusive rolling max). The gate MUST NOT use a past-only window `[t - width_lookback_bars, t - 1]` in MVP.

`setup_allowed` SHALL be true when indicators are ready and `current_width_atr >= min_current_width_atr` and `recent_max_width_atr >= min_recent_width_atr`. The formula MUST be side-neutral (same for long and short evaluation paths).

MVP MUST NOT require `recent_max_width_atr > current_width_atr` or any mandatory stack compression. A bar MAY be allowed when current width already equals or exceeds the recent window maximum (e.g. sustained wide stack in a strong trend).

#### Scenario: Inclusive lookback includes current bar in recent max

- **GIVEN** `width_lookback_bars` is `3` and bar `t` has `width_atr` values `1.0, 2.0, 5.0` at indices `t-2, t-1, t`
- **WHEN** `recent_max_width_atr` is computed on bar `t`
- **THEN** `recent_max_width_atr` is `5.0` (max over `[t-2, t]`, not past-only)

#### Scenario: Bar allowed when current and recent width thresholds met

- **GIVEN** prepared EMA and ATR values where `width_atr` on the bar is `2.5`
- **AND** `min_current_width_atr` is `2.0`
- **AND** `recent_max_width_atr` over the inclusive lookback is `4.2`
- **AND** `min_recent_width_atr` is `4.0`
- **WHEN** the setup is evaluated on that bar
- **THEN** `setup_allowed` is true

#### Scenario: Bar allowed when current width is the recent maximum

- **GIVEN** `current_width_atr` is `4.5` and `recent_max_width_atr` is `4.5` on the same bar
- **AND** `min_current_width_atr` is `2.0` and `min_recent_width_atr` is `4.0`
- **WHEN** the setup is evaluated
- **THEN** `setup_allowed` is true
- **AND** no compression between recent max and current is required

#### Scenario: Bar blocked when current width too narrow

- **GIVEN** `current_width_atr` is `1.5` and `min_current_width_atr` is `2.0`
- **AND** recent max would otherwise pass
- **WHEN** the setup is evaluated
- **THEN** `setup_allowed` is false
- **AND** `blocked_reason` is `current_width_too_narrow`

#### Scenario: Bar blocked when recent expansion insufficient

- **GIVEN** `current_width_atr` meets `min_current_width_atr`
- **AND** `recent_max_width_atr` is `3.0` with `min_recent_width_atr` `4.0`
- **WHEN** the setup is evaluated
- **THEN** `setup_allowed` is false
- **AND** `blocked_reason` is `recent_width_never_expanded`

#### Scenario: Bar blocked when indicators not ready

- **GIVEN** fast, slow, or ATR is NaN or unavailable for the bar
- **WHEN** the setup is evaluated
- **THEN** `setup_allowed` is false
- **AND** `blocked_reason` is `indicator_not_ready`

### Requirement: Trace diagnostics and component counters

Signal trace for this setup instance SHALL expose diagnostics including `setup_allowed`, `blocked_reason`, `current_width_atr`, `recent_max_width_atr`, `width_lookback_bars`, `min_current_width_atr`, `min_recent_width_atr`, `current_width_ok`, `recent_width_ok`, `fast_ema`, `anchor_ema`, `slow_ema`, and `atr_value`.

Each backtest/trace run variant using this setup SHALL include component counters with `allowed_count`, `blocked_count`, and `blocked_reason_breakdown` keyed by blocked reason strings.

#### Scenario: Trace exposes width diagnostics by instance_id

- **GIVEN** a variant with `anchor_stack_width_setup` instance `anchor_stack_width`
- **WHEN** signal trace is built
- **THEN** setup internals for `anchor_stack_width` include the documented diagnostic fields

#### Scenario: Counters summarize allowed and blocked bars

- **GIVEN** a trace where 10 bars are `setup_allowed` and 5 bars blocked with reason `current_width_too_narrow`
- **WHEN** component counters are aggregated for the setup instance
- **THEN** `allowed_count` is 10
- **AND** `blocked_count` is 5
- **AND** `blocked_reason_breakdown` includes `current_width_too_narrow: 5`

### Requirement: Multi-setup AND composition

When `anchor_stack_width_setup` is configured together with other setup components (e.g. `untouched_anchor_setup`, `ema_bounce_counter_setup`), aggregate setup permission SHALL require all configured setup instances to allow the bar.

#### Scenario: Width setup ANDs with another setup

- **GIVEN** `anchor_stack_width_setup` allows a bar
- **AND** another setup instance blocks the same bar
- **WHEN** aggregate `setup_ok` is computed
- **THEN** the bar is not setup-ok
