# ema-bounce-counter-setup Delta Specification

## ADDED Requirements

### Requirement: Bounce counter setup may coexist in a setup stack

`ema_bounce_counter_setup` SHALL be usable as one instance within `strategy.setups` alongside other setup components (including `untouched_anchor_setup`). Its trading semantics, params, and feature requirements MUST remain unchanged from the standalone component spec. Entry composition MUST apply bounce-counter `setup_allowed` as one factor in the aggregate AND gate, not as a replacement for other setup instances.

#### Scenario: Combined with untouched anchor

- **GIVEN** `setups` contains `untouched_anchor_setup` and `ema_bounce_counter_setup`
- **WHEN** entry signals are composed
- **THEN** entries require bounce-counter `setup_allowed` from the bounce-counter instance
- **AND** entries require untouched-anchor setup allowance from the untouched instance
- **AND** entries still require the configured trigger component

### Requirement: Bounce counter trace and events use instance_id in a stack

When `ema_bounce_counter_setup` appears in `strategy.setups`, signal trace internals, optional trade entry diagnostics, and `component_events[]` entries emitted for that component MUST include the setup instance's `instance_id` so they do not collide with another setup instance on the same strategy.

#### Scenario: Trace keyed by instance_id

- **GIVEN** a strategy whose `setups` includes instance_id `bounce_counter` with `ema_bounce_counter_setup`
- **WHEN** signal trace is built
- **THEN** bounce-counter diagnostics appear under `internals.setups.bounce_counter`
- **AND** are not stored as the sole `internals.setup` object

#### Scenario: Chart events include instance_id

- **GIVEN** a report includes `component_events` from `ema_bounce_counter_setup`
- **WHEN** the Chart renders setup-role markers
- **THEN** each event includes `instance_id` matching the setup list entry
- **AND** tooltip/metadata distinguishes instances without chart code branching on `component_id`

## MODIFIED Requirements

### Requirement: Setup component registration

The `ema_pullback` strategy family SHALL expose `ema_bounce_counter_setup` as a setup component with `role: setup` and `component_id: ema_bounce_counter_setup`. The component MUST NOT be registered or treated as a trigger, blocker, exit, direction, or risk component. Authors configure it as an element of `strategy.setups`, not as the sole `strategy.setup` object.

#### Scenario: Component catalog exposes setup role

- **GIVEN** the component catalog is built for `ema_pullback`
- **WHEN** the catalog lists setup components
- **THEN** `ema_bounce_counter_setup` appears under `role: setup`
- **AND** it does not appear under trigger, blocker, exit, direction, or risk roles

#### Scenario: Final entry composition keeps trigger separate

- **GIVEN** a strategy config uses `ema_bounce_counter_setup` in `strategy.setups`
- **AND** uses `trigger.component_id: reclaim_anchor`
- **WHEN** entry signals are composed
- **THEN** entries require `setup_allowed` from the bounce-counter setup instance as part of aggregate `setup_ok`
- **AND** entries also require the separate `reclaim_anchor` trigger signal

### Requirement: Setup configuration and feature inputs

The component SHALL accept MVP params `fast_ema`, `anchor_ema`, `slow_ema`, `max_bounces`, `raw_touch_mode`, `touch_lookback_bars`, `trend_start_confirmation_bars`, and `trend_break_confirmation_bars` on its `strategy.setups[]` entry (nested under `params` when using nested storage). For MVP, `fast_ema`, `anchor_ema`, and `slow_ema` SHALL refer to base timeframe EMA periods only; HTF EMA-stack setup evaluation is out of scope. `raw_touch_mode` MUST support `range_cross` for MVP. `max_bounces`, `touch_lookback_bars`, `trend_start_confirmation_bars`, and `trend_break_confirmation_bars` MUST be positive integers.

The component SHALL consume OHLC market data plus prepared `fast_ema`, `anchor_ema`, and `slow_ema` feature columns. It MUST request EMA features through the existing feature planning mechanism and MUST NOT compute EMA columns internally.

#### Scenario: Valid MVP config is accepted

- **GIVEN** a setup list entry with `component_id: ema_bounce_counter_setup`
- **AND** params `fast_ema: 50`, `anchor_ema: 200`, `slow_ema: 500`, `max_bounces: 3`, `raw_touch_mode: range_cross`, `touch_lookback_bars: 10`, `trend_start_confirmation_bars: 1`, and `trend_break_confirmation_bars: 1`
- **WHEN** the strategy spec is loaded and validated
- **THEN** the setup config is accepted
- **AND** those params participate in strategy identity/config id generation

#### Scenario: Feature plan requests setup EMAs

- **GIVEN** a strategy config uses `ema_bounce_counter_setup` in `setups` with fast, anchor, and slow EMA periods
- **WHEN** the feature plan is built
- **THEN** the plan includes base timeframe EMA features for the configured fast, anchor, and slow periods
- **AND** the setup component receives the corresponding prepared columns during execution

#### Scenario: HTF EMA stack is rejected in MVP

- **GIVEN** a setup list entry with `component_id: ema_bounce_counter_setup`
- **AND** the setup attempts to specify a non-base EMA timeframe for the EMA stack
- **WHEN** the strategy spec is loaded and validated
- **THEN** validation rejects the setup config
- **AND** the user must use base timeframe EMA periods for MVP

#### Scenario: Setup does not compute EMA internally

- **GIVEN** the required EMA column for the configured anchor period is missing from prepared market data
- **WHEN** the setup component is executed
- **THEN** execution fails with a clear error
- **AND** the component does not compute EMA values inline
