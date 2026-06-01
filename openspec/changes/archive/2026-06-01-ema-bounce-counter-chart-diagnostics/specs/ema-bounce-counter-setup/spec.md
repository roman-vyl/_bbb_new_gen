## MODIFIED Requirements

### Requirement: Per-bar diagnostics are exposed

The component SHALL expose per-bar diagnostics for at least: `trend_active`, `trend_episode_id`, `armed`, `raw_touch`, `pending_bounce`, `in_touch_lookback`, `touch_lookback_left`, `completed_bounce_count`, `effective_bounce_number`, `setup_allowed`, and `price_side_of_anchor`.

Optional diagnostics MAY include `trend_start_event`, `trend_break_event`, `pending_bounce_start_time`, `last_completed_bounce_time`, `bars_since_pending_bounce_start`, and `bars_since_last_completed_bounce`.

The diagnostics SHALL be sufficient for backend emitters to derive Chart `component_events[]` without recomputing EMA/counter semantics in the frontend.

#### Scenario: Signal trace includes required diagnostics

- **GIVEN** signal trace is built for a strategy using `ema_bounce_counter_setup`
- **WHEN** the trace includes setup internals
- **THEN** each required diagnostic field is present as a per-bar series aligned to the OHLCV index

#### Scenario: Diagnostics do not change final entries

- **GIVEN** two otherwise identical runs use `ema_bounce_counter_setup`
- **AND** one run emits setup diagnostics while the other only computes runtime masks
- **WHEN** final entry signals are compared
- **THEN** the entry masks are identical

#### Scenario: Diagnostics identify event boundaries

- **GIVEN** signal trace is built for a strategy using `ema_bounce_counter_setup`
- **WHEN** a raw touch opens a pending bounce window and the window later completes
- **THEN** diagnostics identify the bounce opportunity start bar
- **AND** diagnostics identify the pending window start and end bars
- **AND** no frontend candle or EMA computation is required to derive those event boundaries

## ADDED Requirements

### Requirement: Component event metadata carries bounce diagnostic snapshot

For each `component_events[]` record emitted for `ema_bounce_counter_setup`, `metadata` SHALL include the diagnostic snapshot at the event bar index sufficient for Chart tooltips without reading trace internals:

- `event_name`
- `trend_active`, `trend_episode_id`
- `armed`, `raw_touch`, `pending_bounce`, `in_touch_lookback`, `setup_allowed`
- `touch_lookback_bars`, `touch_lookback_left`
- `completed_bounce_count`, `effective_bounce_number`, `max_bounces`
- `price_side_of_anchor`
- `fast_ema`, `anchor_ema`, `slow_ema` (period integers)

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

#### Scenario: Enriched metadata does not alter trading outputs

- **GIVEN** two identical strategy configs and market data
- **WHEN** one run uses the enriched metadata emitter and entries are compared
- **THEN** `signal_entry`, `setup_allowed`, and backtest trade lists are unchanged
