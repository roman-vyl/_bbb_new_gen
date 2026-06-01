## MODIFIED Requirements

### Requirement: Chart renders events from event_type role and side without component_id branching

The frontend MUST map `component_events` to chart markers using only:

- **`event_type`** — marker shape/size class (`source`, span boundary, `point`)
- **`role`** — layer toggle and color family (`entry_block`, `exit_signal`, `setup`)
- **`side`** — marker position relative to bar (`long` / `short`)
- **`time`** — bar placement
- **`label`** and optional **`tooltip`** / `metadata` for text

The frontend MUST NOT use `component_id` as a hardcoded rendering branch for **marker color, shape, or position** (no `switch (component_id)` or equivalent for styling).

The frontend MAY apply **registered component presentation formatters** that override display `label` and `tooltip` text when `component_id` matches a known emitter (v1: `ema_bounce_counter_setup`). Formatters MUST NOT read candles, recompute indicators, or alter event timing.

`component_id` MAY appear in tooltip or metadata for forensics.

The frontend MUST NOT compute component conditions (blockers, exits, regimes, indicators) from candles.

The frontend MUST NOT branch on feature family or catalog ids for marker **styling**.

The frontend MUST NOT expand, collapse, or re-time HTF events in trace data.

#### Scenario: Entry block styling is role and event_type based

- **WHEN** the chart renders an event with `role: entry_block`, `event_type: span_start`, and `side: long`
- **THEN** styling is determined by `role`, `event_type`, and `side`
- **AND** styling does not depend on `component_id`

#### Scenario: Exit signal point styling is role based

- **WHEN** the chart renders an event with `event_type: point` and `role: exit_signal`
- **THEN** styling is determined by `role`, `event_type`, and `side` only

#### Scenario: component_id appears in tooltip only

- **WHEN** the user inspects a component event with `component_id: rsi_lookback_extreme_blocker`
- **THEN** `component_id` MAY appear in tooltip or metadata
- **AND** marker color/shape/position are unchanged if `component_id` were a different supported value with the same `role` and `event_type`

#### Scenario: Layer toggles filter by role

- **WHEN** the user disables the entry-block event layer
- **THEN** events with `role: entry_block` are hidden
- **AND** events with `role: exit_signal` remain visible when that layer is enabled

#### Scenario: Setup layer toggle filters setup role

- **WHEN** the user disables the setup event layer
- **THEN** events with `role: setup` are hidden
- **AND** events with `role: entry_block` or `role: exit_signal` remain visible when those layers are enabled

#### Scenario: Trace not loaded hides component events

- **WHEN** signal trace status is `idle` or `error`
- **THEN** component events are not rendered
- **AND** trade markers behavior is unchanged

#### Scenario: EMA bounce counter uses presentation formatter for text only

- **GIVEN** a `component_events` record with `component_id: ema_bounce_counter_setup`, `role: setup`, and `metadata.event_name: pending_bounce_start`
- **WHEN** the chart builds marker text
- **THEN** the displayed label reflects bounce-specific formatting (e.g. `B{n}▶` from `metadata.effective_bounce_number`)
- **AND** marker color/shape/position match other `role: setup` events with the same `event_type` and `side`
- **AND** the chart does not compute bounce windows from candles

### Requirement: Chart provides legend and toggles for component event layers

The Chart UI SHALL provide:

- Legend entries keyed by **`role`** (v1: `entry_block`, `exit_signal`, `setup`)
- Toggles to show/hide each role independently (default: visible roles when trace is ready)
- Legend copy describing **`event_type`** semantics (`source`, span start/end, `point`) — MUST NOT reference RSI or specific catalog components

#### Scenario: Semantic event types explained in UI

- **WHEN** component events are visible on chart
- **THEN** the chart hint or legend describes `source`, span start/end, and `point` markers
- **AND** states HTF spans use backend-aligned base-bar boundaries

#### Scenario: Setup role toggle in legend

- **WHEN** the chart legend shows component event layers
- **THEN** a **Show setup** toggle is available alongside entry_block and exit_signal toggles
- **AND** disabling it hides all events with `role: setup`

### Requirement: EMA bounce counter setup events use generic chart event semantics

The `ema_bounce_counter_setup` event emitter SHALL derive Chart events from backend setup trace diagnostics and SHALL use the generic `component_events[]` contract. The emitter MUST use `role: setup`, `component_id: ema_bounce_counter_setup`, `feature_family: ema`, and the evaluated `side`.

The event mapping SHALL be:

- `source` for the eligible raw-touch bar that opens a bounce opportunity.
- `span_start` for pending bounce window start.
- `span_end` for pending bounce window end, placed on the last active pending/lookback bar. With `touch_lookback_bars = N` and a start index `i0`, this is index `i0 + N - 1`.
- Optional `point` events for trend start and trend break.

Component-specific details SHALL live in `metadata`, including at minimum on every bounce/trend event at the event bar: `event_name`, `trend_active`, `trend_episode_id`, `armed`, `raw_touch`, `pending_bounce`, `in_touch_lookback`, `setup_allowed`, `touch_lookback_bars`, `touch_lookback_left`, `completed_bounce_count`, `effective_bounce_number`, `max_bounces`, `price_side_of_anchor`, `fast_ema`, `anchor_ema`, and `slow_ema`.

Trend point events MUST set `metadata.event_name` to `trend_start` or `trend_break` (not a generic `Trend` label dependency).

#### Scenario: Bounce opportunity source event

- **GIVEN** `ema_bounce_counter_setup` trace has `raw_touch: true`
- **AND** that bar satisfies the conditions to open a new pending bounce
- **WHEN** component events are serialized
- **THEN** a `source` event is emitted at that bar's base time
- **AND** the event has `role: setup`, `feature_family: ema`, and `metadata.event_name: bounce_opportunity_start`
- **AND** `metadata` includes `raw_touch`, `armed`, `pending_bounce`, `setup_allowed`, `trend_active`, and `in_touch_lookback` for that bar

#### Scenario: Pending bounce span events

- **GIVEN** a pending bounce window starts at base index `i0`
- **AND** `touch_lookback_bars` is `N`
- **WHEN** component events are serialized
- **THEN** `span_start` is emitted at `times[i0]` with `metadata.event_name: pending_bounce_start`
- **AND** `span_end` is emitted at `times[i0 + N - 1]` with `metadata.event_name: pending_bounce_end`
- **AND** `span_end` is not emitted at the first inactive bar after the window
- **AND** span metadata includes `touch_lookback_left` at each emitted bar index

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
- **AND** frontend presentation maps them to distinct labels (`T+` / `T-`) via the bounce-counter formatter without changing marker styling keys

#### Scenario: Frontend does not synthesize EMA setup events

- **GIVEN** signal trace contains setup internals for `ema_bounce_counter_setup`
- **WHEN** Chart renders component events
- **THEN** Chart renders only events already present in `component_events[]`
- **AND** Chart does not compute raw touches, pending windows, trend episodes, or bounce counts from candles or EMA values

### Requirement: Multiple setup instances disambiguate component events by instance_id

When a report's `component_events[]` includes events with `role: setup` from more than one setup instance, each event MUST carry the emitting setup's `instance_id` in addition to `component_id`. The Chart marker layer MUST render setup events using existing generic rules (`event_type`, `role`, `side`) for styling and MUST use `instance_id` in labels/tooltips/metadata. Component-specific label formatting applies only to `component_id: ema_bounce_counter_setup`; other setup components keep generic labels until a formatter is added.

#### Scenario: Two setup sources on one chart

- **GIVEN** `component_events` contains setup events for `instance_id` `untouched_anchor` and `bounce_counter`
- **WHEN** the Chart displays markers
- **THEN** both event groups appear when the setup layer is enabled
- **AND** tooltips distinguish `instance_id` values
- **AND** bounce-counter events show bounce-specific labels while other setup events keep generic setup labels

#### Scenario: Setup event tooltip shows instance

- **GIVEN** a setup `span_start` event with `component_id`, `instance_id`, and `role: setup`
- **WHEN** the user inspects the marker tooltip
- **THEN** the tooltip includes `instance_id`

## ADDED Requirements

### Requirement: EMA bounce counter chart presentation labels

When the Workbench renders `component_events` with `component_id: ema_bounce_counter_setup` and `role: setup`, the presentation formatter SHALL map `metadata.event_name` to short chart labels:

- `bounce_opportunity_start` on `source` → `B{n} touch` where `n` is `metadata.effective_bounce_number`
- `pending_bounce_start` on `span_start` → `B{n}▶`
- `pending_bounce_end` on `span_end` → `B{n}■`
- `trend_start` on `point` → `T+`
- `trend_break` on `point` → `T-`

#### Scenario: Pending bounce start shows bounce number

- **GIVEN** a setup event with `metadata.event_name: pending_bounce_start` and `metadata.effective_bounce_number: 2`
- **WHEN** the chart builds the marker label
- **THEN** the label is `B2▶`

#### Scenario: Trend break is distinct from trend start

- **GIVEN** setup point events with `metadata.event_name: trend_start` and `trend_break` on the same side
- **WHEN** the chart builds marker labels
- **THEN** labels are `T+` and `T-` respectively

### Requirement: EMA bounce counter chart presentation tooltips

The bounce-counter presentation formatter SHALL build a human-readable tooltip from `metadata` and top-level `instance_id`, including when available:

- Bounce progress: effective bounce number and `max_bounces`
- `completed_bounce_count`
- Trend: `trend_active`, `trend_episode_id`
- Lookback: `touch_lookback_bars`, `touch_lookback_left`, and `in_touch_lookback`
- Flags: `armed`, `raw_touch`, `pending_bounce`, `setup_allowed`
- EMA stack: `fast_ema`, `anchor_ema`, `slow_ema`

#### Scenario: Tooltip explains gate state at raw touch

- **GIVEN** a `source` event with `metadata.event_name: bounce_opportunity_start`, `metadata.raw_touch: true`, and `metadata.setup_allowed: false`
- **WHEN** the user inspects the marker tooltip
- **THEN** the tooltip states bounce progress and includes `raw_touch` and `setup_allowed` values
- **AND** the tooltip includes `trend_active` when present in metadata

#### Scenario: Tooltip distinguishes raw_touch from in_touch_lookback

- **GIVEN** a bounce event with `metadata.raw_touch: false` and `metadata.in_touch_lookback: true`
- **WHEN** the user inspects the marker tooltip
- **THEN** the tooltip shows both `raw_touch` and `in_touch_lookback` explicitly
- **AND** the user can tell the bar is inside the lookback collapse window without a new raw touch
