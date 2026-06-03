## MODIFIED Requirements

### Requirement: Setup configuration and feature inputs

The component SHALL accept bounce params `max_bounces`, `raw_touch_mode`, `touch_lookback_bars`, `trend_start_confirmation_bars`, and `trend_break_confirmation_bars` on its `strategy.setups[]` entry (nested under `params` when using nested storage). It MUST NOT accept or persist setup-level EMA period params (`fast_ema`, `anchor_ema`, `slow_ema`) in new configs, catalog schemas, or Composer-authored saves.

The component SHALL consume OHLC market data plus prepared `fast`, `anchor`, and `slow` EMA columns derived from `strategy.anchor_stack` (same ownership model as `anchor_stack_width_setup`). It MUST NOT plan additional EMA features from setup params. It MUST NOT compute EMA columns internally.

EMA columns SHALL be whatever `strategy.anchor_stack` resolves to in the feature plan. The bounce setup MUST NOT add its own timeframe or source validation; base-timeframe MVP limits apply only via existing global `strategy.anchor_stack` validation (same pattern as `anchor_stack_width_setup`). `raw_touch_mode` MUST support `range_cross` for MVP. `max_bounces`, `touch_lookback_bars`, `trend_start_confirmation_bars`, and `trend_break_confirmation_bars` MUST be positive integers.

#### Scenario: Valid new config without setup-level EMA params

- **GIVEN** `strategy.anchor_stack` defines fast period 100, anchor 200, slow 496
- **AND** a setup list entry with `component_id: ema_bounce_counter_setup` and params `max_bounces: 3`, `raw_touch_mode: range_cross`, `touch_lookback_bars: 10`, `trend_start_confirmation_bars: 1`, `trend_break_confirmation_bars: 1` only
- **WHEN** the strategy spec is loaded and validated
- **THEN** the setup config is accepted
- **AND** bounce params participate in strategy identity/config id generation
- **AND** setup-level EMA periods are not part of identity for this setup instance

#### Scenario: Legacy config with matching setup-level EMA params accepted

- **GIVEN** `strategy.anchor_stack` periods 100 / 200 / 496
- **AND** a setup entry includes legacy params `fast_ema: 100`, `anchor_ema: 200`, `slow_ema: 496` matching the anchor stack
- **WHEN** the external config loader parses the strategy
- **THEN** the setup config is accepted
- **AND** runtime and feature planning use `strategy.anchor_stack` columns, not a separate stack

#### Scenario: Legacy config with mismatched setup-level EMA params rejected

- **GIVEN** `strategy.anchor_stack` periods 100 / 200 / 496
- **AND** a setup entry includes `fast_ema: 50`, `anchor_ema: 200`, `slow_ema: 500`
- **WHEN** the external config loader parses the strategy
- **THEN** validation rejects the config with a clear error referencing the mismatch
- **AND** behavior does not silently fall back to the mismatched setup periods

#### Scenario: Feature plan maps anchor stack columns

- **GIVEN** a strategy config uses `ema_bounce_counter_setup` in `setups` and `strategy.anchor_stack` defines the EMA periods
- **WHEN** the feature plan is built
- **THEN** `setup_columns_by_instance_id[instance_id]` maps `fast`, `anchor`, and `slow` to feature ids from `strategy.anchor_stack`
- **AND** the plan does not add EMA `PlannedFeature` entries solely from bounce setup params
- **AND** multiple setup instances sharing the same anchor stack do not duplicate EMA feature planning beyond global anchor-stack materialization

#### Scenario: Non-base anchor stack rejected at strategy level only

- **GIVEN** a strategy with `ema_bounce_counter_setup` in `setups`
- **AND** `strategy.anchor_stack` uses a non-base EMA timeframe disallowed by existing MVP rules
- **WHEN** the strategy spec is loaded and validated
- **THEN** validation rejects the config via existing `strategy.anchor_stack` validation
- **AND** bounce setup does not perform an additional timeframe check

#### Scenario: Setup does not compute EMA internally

- **GIVEN** required anchor-stack EMA columns are missing from prepared market data
- **WHEN** the setup component is executed
- **THEN** execution fails with a clear error
- **AND** the component does not compute EMA values inline

### Requirement: Bounce counter setup may coexist in a setup stack

`ema_bounce_counter_setup` SHALL be usable as one instance within `strategy.setups` alongside other setup components (including `untouched_anchor_setup` and `anchor_stack_width_setup`). Its bounce counting semantics and bounce params MUST remain unchanged from the standalone bounce rules. Entry composition MUST apply bounce-counter `setup_allowed` as one factor in the aggregate AND gate, not as a replacement for other setup instances. Bounce counter MUST NOT measure stack width; that remains `anchor_stack_width_setup`.

#### Scenario: Combined with untouched anchor

- **GIVEN** `setups` contains `untouched_anchor_setup` and `ema_bounce_counter_setup`
- **WHEN** entry signals are composed
- **THEN** entries require bounce-counter `setup_allowed` from the bounce-counter instance
- **AND** entries require untouched-anchor setup allowance from the untouched instance
- **AND** entries still require the configured trigger component

#### Scenario: Combined with anchor stack width

- **GIVEN** `setups` contains `ema_bounce_counter_setup` and `anchor_stack_width_setup`
- **WHEN** entry signals are composed on a bar where bounce `setup_allowed` is true and width `setup_allowed` is false
- **THEN** aggregate `setup_ok` is false
- **WHEN** on a bar where width allows and bounce blocks
- **THEN** aggregate `setup_ok` is false
- **WHEN** on a bar where both allow
- **THEN** aggregate `setup_ok` can be true subject to other setups and trigger/direction

### Requirement: Component event metadata carries bounce diagnostic snapshot

For each `component_events[]` record emitted for `ema_bounce_counter_setup`, `metadata` SHALL include the diagnostic snapshot at the event bar index sufficient for Chart tooltips without reading trace internals:

- `event_name`
- `trend_active`, `trend_episode_id`
- `armed`, `raw_touch`, `pending_bounce`, `in_touch_lookback`, `setup_allowed`
- `touch_lookback_bars`, `touch_lookback_left`
- `completed_bounce_count`, `effective_bounce_number`, `max_bounces`
- `price_side_of_anchor`
- `fast_ema`, `anchor_ema`, `slow_ema` (period integers from `strategy.anchor_stack`, not from setup params)

Trend point events MUST use `metadata.event_name` of `trend_start` or `trend_break`.

#### Scenario: Bounce span start metadata includes lookback left

- **GIVEN** a pending bounce window starts at base index `i0` with `touch_lookback_bars: N`
- **WHEN** `span_start` is serialized at `times[i0]`
- **THEN** `metadata.touch_lookback_left` equals the trace value at `i0`
- **AND** `metadata.pending_bounce` is true at that bar

#### Scenario: Source metadata includes raw touch and setup_allowed

- **GIVEN** a bounce opportunity `source` event at bar index `i`
- **WHEN** component events are serialized
- **THEN** `metadata.raw_touch` matches trace `raw_touch` at `i`
- **AND** `metadata.setup_allowed` matches trace `setup_allowed` at `i`
- **AND** `metadata.armed` matches trace `armed` at `i`
- **AND** `metadata.trend_active` matches trace `trend_active` at `i`

#### Scenario: Span metadata includes in_touch_lookback

- **GIVEN** a bar inside a pending bounce lookback window where `raw_touch` is false and `in_touch_lookback` is true
- **WHEN** a bounce `span_start`, `span_end`, or related event is serialized at that bar index
- **THEN** `metadata.in_touch_lookback` is true
- **AND** `metadata.raw_touch` reflects the trace value at that bar (MAY be false)

#### Scenario: EMA period metadata reflects anchor stack

- **GIVEN** `strategy.anchor_stack` periods 100 / 200 / 496
- **AND** bounce component events are emitted
- **WHEN** event metadata includes `fast_ema`, `anchor_ema`, `slow_ema`
- **THEN** those integers are 100, 200, and 496 from `strategy.anchor_stack`
- **AND** they are not read from removed setup-level EMA params

#### Scenario: Enriched metadata does not alter trading outputs

- **GIVEN** two identical strategy configs and market data
- **WHEN** one run uses the enriched metadata emitter and entries are compared
- **THEN** `signal_entry`, `setup_allowed`, and backtest trade lists are unchanged

## ADDED Requirements

### Requirement: Catalog and Composer contract for anchor stack EMAs

The research component catalog for `ema_bounce_counter_setup` SHALL expose only bounce-related params (including `max_bounces`, `raw_touch_mode`, `touch_lookback_bars`, `trend_start_confirmation_bars`, `trend_break_confirmation_bars`, and other existing non-EMA bounce fields). It MUST NOT expose setup-level EMA period fields. Description or help text MUST state that the component uses `strategy.anchor_stack` EMAs and does not define its own EMA periods.

The Workbench Composer SHALL render and save bounce params without EMA period fields for new edits. When loading a legacy config that still contains setup-level EMA keys matching `anchor_stack`, the UI MUST NOT re-author those keys on save.

#### Scenario: Catalog omits setup-level EMA period fields

- **GIVEN** the component catalog is built for `ema_pullback`
- **WHEN** the schema for `ema_bounce_counter_setup` is returned
- **THEN** `fast_ema`, `anchor_ema`, and `slow_ema` are not in `params_schema`
- **AND** help or description references `strategy.anchor_stack`

#### Scenario: Composer save omits legacy setup EMA keys

- **GIVEN** a draft strategy loaded from API with legacy bounce setup EMA keys matching `anchor_stack`
- **WHEN** the user saves from Composer without changing bounce params
- **THEN** the saved setup params contain bounce fields only
- **AND** setup-level EMA period keys are not written back

### Requirement: Architectural alignment with anchor stack width setup

`ema_bounce_counter_setup` SHALL follow the same EMA ownership pattern as `anchor_stack_width_setup`: `role: setup`, lives in `strategy.setups[]`, uses `strategy.anchor_stack` prepared columns via `setup_columns_by_instance_id`, trace and component_events keyed by `instance_id`, catalog-driven params, and no `data_engine/` changes. Internal logic remains a stateful bounce episode counter (not a stateless width gate).

#### Scenario: Same column resolution pattern as width setup

- **GIVEN** a strategy with both `anchor_stack_width_setup` and `ema_bounce_counter_setup`
- **WHEN** the feature plan is built
- **THEN** both instances map `fast`, `anchor`, and `slow` to the same anchor-stack feature ids
- **AND** neither setup plans EMA periods from its own params
