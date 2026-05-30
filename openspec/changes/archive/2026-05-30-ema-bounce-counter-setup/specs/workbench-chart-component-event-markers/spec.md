## MODIFIED Requirements

### Requirement: v1 research emitters are limited to two existing RSI components

Research MUST implement event emitters for these catalog components:

- `rsi_lookback_extreme_blocker` → `role: entry_block` with `source`, `span_start`, and `span_end` per blocked run
- `rsi_signal_exit` → `role: exit_signal` with `event_type: point` when exit fires
- `ema_bounce_counter_setup` → `role: setup` with `source` for bounce opportunity start, `span_start`/`span_end` for pending bounce windows, and optional `point` events for trend start/break

Research MUST use component-specific trace code per emitter because backend owns component semantics.

Research MUST NOT add emitters for other components until follow-up changes (counter-candle blocker, EMA exits, context gates, other setup/trigger components).

Follow-up changes add emitters for additional components by reusing the same `component_events` contract without breaking changes.

#### Scenario: rsi_lookback_extreme_blocker emits semantic block span

- **GIVEN** a variant with `rsi_lookback_extreme_blocker`
- **AND** aligned trace has a contiguous blocked run for the long side from base index `i0` through `i1`
- **WHEN** signal trace is built
- **THEN** `component_events` includes `span_start` at `times[i0]` and `span_end` at `times[i1]` with `role: entry_block` and `side: long`
- **AND** includes a `source` event at the bar where the RSI threshold crossing triggered the block episode

#### Scenario: rsi_signal_exit emits exit point

- **GIVEN** a variant with `rsi_signal_exit` in an exit profile bucket
- **WHEN** the long exit condition is true at base index `i` on the aligned RSI column
- **THEN** `component_events` includes one record with `event_type: point`, `role: exit_signal`, `side: long`, and `time == times[i]`

#### Scenario: ema_bounce_counter_setup emits setup bounce events

- **GIVEN** a variant with `ema_bounce_counter_setup`
- **AND** a raw touch opens a pending bounce window for the long side at base index `i0`
- **AND** that pending bounce window completes at base index `i1`
- **WHEN** signal trace is built
- **THEN** `component_events` includes a `source` event at `times[i0]` with `role: setup`, `side: long`, and `component_id: ema_bounce_counter_setup`
- **AND** includes `span_start` at `times[i0]` and `span_end` at `times[i1]` for the pending bounce window
- **AND** the related `source`, `span_start`, and `span_end` events share a non-null `span_id`

#### Scenario: Non-implemented component produces no events

- **GIVEN** a variant whose only entry filter is `counter_candle_blocker`
- **WHEN** signal trace is built before a counter-candle emitter exists
- **THEN** `component_events` is empty
- **AND** no placeholder event is emitted

## ADDED Requirements

### Requirement: EMA bounce counter setup events use generic chart event semantics

The `ema_bounce_counter_setup` event emitter SHALL derive Chart events from backend setup trace diagnostics and SHALL use the generic `component_events[]` contract. The emitter MUST use `role: setup`, `component_id: ema_bounce_counter_setup`, `feature_family: ema`, and the evaluated `side`.

The event mapping SHALL be:

- `source` for the eligible raw-touch bar that opens a bounce opportunity.
- `span_start` for pending bounce window start.
- `span_end` for pending bounce window end, placed on the last active pending/lookback bar. With `touch_lookback_bars = N` and a start index `i0`, this is index `i0 + N - 1`.
- Optional `point` events for trend start and trend break.

Component-specific details SHALL live in `metadata`, including `event_name`, EMA periods, `trend_episode_id`, `completed_bounce_count`, `effective_bounce_number`, `max_bounces`, `touch_lookback_bars`, and `price_side_of_anchor` when available.

#### Scenario: Bounce opportunity source event

- **GIVEN** `ema_bounce_counter_setup` trace has `raw_touch: true`
- **AND** that bar satisfies the conditions to open a new pending bounce
- **WHEN** component events are serialized
- **THEN** a `source` event is emitted at that bar's base time
- **AND** the event has `role: setup`, `feature_family: ema`, and `metadata.event_name: bounce_opportunity_start`

#### Scenario: Pending bounce span events

- **GIVEN** a pending bounce window starts at base index `i0`
- **AND** `touch_lookback_bars` is `N`
- **WHEN** component events are serialized
- **THEN** `span_start` is emitted at `times[i0]`
- **AND** `span_end` is emitted at `times[i0 + N - 1]`
- **AND** `span_end` is not emitted at the first inactive bar after the window

#### Scenario: Final active lookback touch does not create a second span

- **GIVEN** a pending bounce window starts at base index `i0`
- **AND** `touch_lookback_bars` is `N`
- **AND** `raw_touch` is also true on base index `i0 + N - 1`
- **WHEN** component events are serialized
- **THEN** the emitter produces `span_end` for the original window at `times[i0 + N - 1]`
- **AND** it does not emit a new `source` or `span_start` for that final active lookback bar
- **AND** a following pending bounce can only be emitted from index `i0 + N` or later

#### Scenario: Trend point events are optional but generic

- **GIVEN** trend point emission is enabled for `ema_bounce_counter_setup`
- **WHEN** a trend episode starts or breaks
- **THEN** the emitter serializes `event_type: point` with `role: setup`
- **AND** `metadata.event_name` is `trend_start` or `trend_break`
- **AND** frontend rendering does not require a branch on `component_id`

#### Scenario: Frontend does not synthesize EMA setup events

- **GIVEN** signal trace contains setup internals for `ema_bounce_counter_setup`
- **WHEN** Chart renders component events
- **THEN** Chart renders only events already present in `component_events[]`
- **AND** Chart does not compute raw touches, pending windows, trend episodes, or bounce counts from candles or EMA values
