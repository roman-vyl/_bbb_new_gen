# workbench-chart-component-event-markers Specification

## Purpose

Chart component semantic events derived from signal trace: generic `component_events[]` contract with `event_type` vocabulary (`point`, `span_start`, `span_end`, `source`), extensible `role`, top-level alignment fields, component-specific data in `metadata`. v1 emitters include RSI blockers/exits, `ema_bounce_counter_setup`, and `anchor_stack_width_setup` (allowed-episode spans with presentation formatters); frontend renders marker styling by `event_type` + `role` + `side` only.

**Same trace payload** also carries `htf_context` for HTF EMA dashed overlays — see `workbench-chart-htf-context-overlays`. Changes to signal trace loading, display cache, or caching MUST regression-check both features. See also `workbench-trace-window-chunk-cache`.
## Requirements
### Requirement: Signal trace exposes component_events with event_type vocabulary

The signal trace payload returned to Workbench SHALL include `component_events`: a sparse, **component-agnostic** list of semantic events aligned with chart/base bar times (`trace.times`).

Each event record MUST include:

- `time` — Unix seconds on the chart/base bar (`times[i]`)
- `event_type` — one of `point`, `span_start`, `span_end`, `source`
- `role` — semantic category for styling and layer toggles (v1: `entry_block`, `exit_signal`, `setup`)
- `side` — `long` or `short`
- `component_id` — catalog component id (provenance only)
- `instance_id` — rule instance id from strategy spec
- `label` — short text for chart rendering
- `tooltip` — optional longer text (MAY be omitted)
- `span_id` — optional string linking `source`, `span_start`, and `span_end` of the same run (MAY be null)
- `feature_family` — optional generic label such as `rsi`, `ema`, `context` (MAY be null; not a render key)
- `source_timeframe` — optional resolved feature timeframe (e.g. `5m`, `1h`; MAY be null)
- `base_timeframe` — optional strategy/chart base timeframe (MAY be null)
- `metadata` — object for **component-specific** fields only (MAY include `rsi_value`, `condition`, `params`, `threshold`, `lookback`, `profile`, `regime`, `ema_period`, …)

Top-level MUST NOT include indicator values or rule thresholds (`rsi_value`, `threshold`, …). Frontend HTF alignment hints MUST read `source_timeframe` and `base_timeframe` from top-level fields, not from `metadata`.

Event `time` MUST use the base/chart bar index only. HTF features MUST NOT be re-timestamped to HTF candle open times in this payload.

#### Scenario: Event record includes generic contract fields

- **WHEN** signal trace includes any `component_events` entry
- **THEN** the record includes `time`, `event_type`, `role`, `side`, `component_id`, `instance_id`, `label`, and `metadata`
- **AND** `event_type` is one of `point`, `span_start`, `span_end`, `source`
- **AND** `span_id`, `feature_family`, `source_timeframe`, and `base_timeframe` are present as top-level fields (nullable when unused)

#### Scenario: Component-specific detail lives in metadata only

- **WHEN** an RSI emitter serializes threshold and indicator values
- **THEN** `rsi_value`, `threshold`, `lookback`, and similar keys appear under `metadata`
- **AND** `source_timeframe` and `base_timeframe` appear at top level when the emitter knows them
- **AND** a future EMA emitter MAY use the same top-level shape with EMA-specific keys only in `metadata`

#### Scenario: span_id links span events at top level

- **WHEN** an emitter emits `source`, `span_start`, and `span_end` for one blocked run
- **THEN** all three records share the same non-null top-level `span_id`
- **AND** `span_id` is not required under `metadata`

#### Scenario: No events when no emitters configured for variant

- **GIVEN** a variant with no configured component event emitters
- **WHEN** signal trace is built
- **THEN** `component_events` is an empty list

#### Scenario: event_type source marks causal bar

- **WHEN** an emitter emits a causal triggering bar for a blocker span
- **THEN** the record has `event_type: source`
- **AND** `role` reflects the semantic category (e.g. `entry_block`)

#### Scenario: event_type span_start and span_end bound a contiguous regime

- **WHEN** a blocker or regime is active across a contiguous run of base bars from index `i0` through `i1`
- **THEN** the trace includes one `span_start` at `times[i0]` (first active/blocked bar)
- **AND** one `span_end` at `times[i1]` (**last active/blocked bar — NOT the first inactive bar after the run**)
- **AND** both records share the same `role`, `side`, `instance_id`, and `span_id`

#### Scenario: Source is one rising edge per raw threshold episode

- **GIVEN** raw threshold booleans `F T T T F F T T` on consecutive base bars
- **WHEN** the blocker emitter serializes `source` events from raw threshold **before** lookback rolling
- **THEN** exactly two `source` events are emitted at the first `T` of each contiguous raw-true episode
- **AND** no `source` is emitted on the second or third `T` of the same raw-true run

#### Scenario: event_type point marks isolated events

- **WHEN** an exit or one-shot condition fires on a single bar without a span
- **THEN** the trace includes a record with `event_type: point`

### Requirement: Extensible role axis for future non-RSI components

`role` SHALL be a string semantic category used for styling and layer toggles. v1 uses `entry_block` and `exit_signal`. The contract MUST allow additional roles without breaking changes, including at minimum:

- `setup`, `trigger` — one-shot detection/firing (`event_type: point`)
- `context_regime` — HTF or strategy context spans (`span_start` / `span_end`)

Research emitters for new catalog components MUST map to an existing or newly added `role`; they MUST NOT introduce frontend rendering keyed on `component_id`.

#### Scenario: Counter-candle blocker uses entry_block role without RSI metadata

- **GIVEN** a future emitter for `counter_candle_blocker`
- **WHEN** a block span is serialized
- **THEN** events use `role: entry_block` with `source`, `span_start`, and `span_end`
- **AND** `metadata` describes the candle violation, not RSI fields
- **AND** frontend styling matches other `entry_block` spans

#### Scenario: Context gate uses context_regime role

- **GIVEN** a future emitter for an HTF context gate
- **WHEN** aligned regime spans base bars `i0`–`i1`
- **THEN** events use `role: context_regime` with `span_start` and `span_end`
- **AND** frontend renders from `role` and `event_type` without knowing the gate `component_id`

### Requirement: Catalog components map to universal event_type patterns

Research MAY add emitters for any catalog component in follow-up changes. Each emitter MUST map component semantics to the universal `event_type` set without changing frontend render keys:

| Pattern | `event_type` sequence | Typical `role` |
|---------|------------------------|----------------|
| Blocker with cause + blocked range | `source`, `span_start`, `span_end` | `entry_block` |
| Isolated exit / cross | `point` | `exit_signal` |
| Setup / trigger fired | `point` | `setup` / `trigger` |
| Regime gate | `span_start`, `span_end` (optional `source`) | `context_regime` |

The frontend MUST remain unaware of catalog component ids for rendering.

#### Scenario: EMA cross exit maps to point only

- **GIVEN** a future emitter for an EMA cross exit component
- **WHEN** the cross fires on base bar `i`
- **THEN** the trace includes one `component_events` record with `event_type: point` and `role: exit_signal`
- **AND** no `span_start` or `span_end` records are required for that component
- **AND** `metadata` MAY include EMA periods, not RSI fields

#### Scenario: Setup and trigger map to point events

- **GIVEN** future emitters for setup and trigger components
- **WHEN** setup is detected or trigger fires on base bar `i`
- **THEN** each emits `event_type: point` with `role: setup` or `role: trigger` respectively

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

### Requirement: HTF aligned feature events follow base-bar semantics

When top-level `source_timeframe` is higher than top-level `base_timeframe`, event emission MUST use aligned per-base-bar semantics (any feature family—RSI, EMA, context, etc.):

1. Feature columns from `add_feature_columns_from_plan` with `_align_completed_feature_to_base`.
2. Emitter trace booleans computed on aligned base-index series.
3. Span boundaries use first/last base index where the aligned condition defines the blocked run.
4. One HTF blocking period MUST produce one span pair (and associated `source`) on the base chart — not one event per HTF open.
5. Frontend MUST NOT expand HTF events; backend emits semantic span boundaries on base index.

#### Scenario: HTF blocker span covers aligned 5m run

- **GIVEN** base timeframe `5m` and `rsi_lookback_extreme_blocker` with `source_timeframe: 1h`
- **AND** aligned pipeline marks the block active on every 5m bar from 10:00 through 10:55 for the long side
- **WHEN** signal trace is built
- **THEN** `component_events` includes `span_start` at 10:00 and `span_end` at 10:55 for that run
- **AND** does not include twelve separate `span_start` records for each 5m bar

#### Scenario: HTF emitter uses aligned feature column

- **GIVEN** an emitter whose feature uses `source_timeframe` higher than `base_timeframe`
- **WHEN** the emitter runs
- **THEN** it reads aligned columns produced via `_align_completed_feature_to_base`
- **AND** emits events only from base-index booleans

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

### Requirement: Component events respect visible chart window

Component events MUST be filtered to the same **current render window** candle time range as trade markers and chart candles — the sliding window managed by `chartDataWindowManager`, not a fixed trade-selection slice that does not move on pan.

Component events for display MUST be sourced from the **accumulated signal trace display cache** (when available), then sliced to the render window — not from the latest single-window trace response alone.

When the user pans and the render window shifts, component events MUST be re-sliced from cache to the new window bounds before passing to the chart marker plugin. If the new window is already covered by cache, this MUST occur without a network fetch.

Partial spans are acceptable: when the visible window intersects the middle or end of a blocked run, only `span_end` (or only `span_start`) MAY appear — this is expected and MUST NOT be treated as a data bug.

#### Scenario: Events outside view are omitted

- **WHEN** an event `time` is outside the first/last candle of the **current render window**
- **THEN** that event is not passed to the chart marker plugin

#### Scenario: Partial span visible at window start

- **GIVEN** a blocked run whose `span_start` is before the first candle of the **current render window**
- **AND** `span_end` falls inside the render window range
- **WHEN** component events are rendered
- **THEN** only `span_end` (and any in-window `source` or mid-run events) are shown
- **AND** the chart does not synthesize a fake `span_start` at the window edge

#### Scenario: Events update after pan shifts render window

- **GIVEN** component events visible for render window `[T0, T1]`
- **WHEN** user pans until the render window shifts to `[T0', T1']`
- **THEN** events with `time` outside `[T0', T1']` are removed from the marker plugin
- **AND** events with `time` inside `[T0', T1']` are shown from trace cache slice when covered

#### Scenario: Pan back shows cached events without refetch

- **GIVEN** trace cache previously loaded events for `[Ta, Tb]`
- **WHEN** user pans away and later pans back to render window `[Ta, Tb]`
- **THEN** component events for that window appear from cache slice
- **AND** no signal trace refetch occurs solely because the user returned to a prior window

### Requirement: Chart HTF hint uses top-level timeframes

When any visible component event has top-level `source_timeframe` different from `base_timeframe`, the chart hint or legend MUST state that spans use backend-aligned base-bar boundaries. The frontend MUST NOT read timeframes from `metadata` for this hint.

#### Scenario: HTF alignment hint from top-level fields

- **WHEN** a visible event has `source_timeframe: 1h` and `base_timeframe: 5m` at top level
- **THEN** the chart hint explains HTF-aligned base-bar span boundaries
- **AND** the hint does not require `metadata.source_timeframe`

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

### Requirement: Anchor stack width allowed episodes on chart

When signal trace is built for a variant that includes `anchor_stack_width_setup`, the backend SHALL emit `component_events[]` only for **allowed episodes**—contiguous runs where `setup_allowed` is true. The chart MUST NOT visualize blocked spans or per-bar blocked state; blocked bars remain in signal trace setup internals only.

The emitter SHALL emit events **only on `setup_allowed` transitions**, not on every allowed bar:

| Transition | `event_type` | `label` |
|------------|--------------|---------|
| `false → true` | `span_start` | `Width ok` |
| `true → false` | `span_end` | `Width end` |

Each continuous allowed run of length N bars MUST produce exactly two chart events (`span_start` at the first allowed bar, `span_end` at the first disallowed bar after the run). A run of 300 allowed bars MUST NOT produce 300 markers.

Every event record MUST include:

- `role: setup`
- `component_id: anchor_stack_width_setup`
- `instance_id` — from the configured setup rule
- `event_type` — `span_start` or `span_end`
- `label` — `Width ok` or `Width end` as above
- `tooltip` — formatted per transition rules below
- `metadata` — width diagnostics and, on span end, `blocked_reason`
- `span_id` — shared between the `span_start` and matching `span_end` of one episode (same pattern as other span emitters)

The emitter MUST NOT emit `point` or `source` markers for this component in MVP. The emitter MUST NOT emit events while `setup_allowed` stays unchanged.

#### Scenario: Allowed episode starts on false to true

- **GIVEN** `setup_allowed` is false on bar `t-1` and true on bar `t`
- **WHEN** component events are built
- **THEN** exactly one `span_start` event is emitted at `time` for bar `t`
- **AND** `label` is `Width ok`
- **AND** `role` is `setup` and `component_id` is `anchor_stack_width_setup`

#### Scenario: Allowed episode ends on true to false

- **GIVEN** `setup_allowed` is true on bar `t-1` and false on bar `t`
- **WHEN** component events are built
- **THEN** exactly one `span_end` event is emitted at `time` for bar `t`
- **AND** `label` is `Width end`
- **AND** the event shares `span_id` with the preceding `span_start` of that episode

#### Scenario: Long allowed run emits only start and end

- **GIVEN** `setup_allowed` is true for 300 consecutive bars
- **WHEN** component events are built
- **THEN** exactly two events are emitted for that episode (`span_start` then `span_end`)
- **AND** no per-bar markers are emitted inside the run

#### Scenario: Blocked bars emit no chart events

- **GIVEN** `setup_allowed` is false for 100 consecutive bars with no transition into allowed
- **WHEN** component events are built
- **THEN** zero component events are emitted for those bars
- **AND** width/block diagnostics remain available in setup trace internals

### Requirement: Anchor stack width setup event tooltips

`span_start` tooltips SHALL identify the episode and include width diagnostics at episode open. `span_end` tooltips SHALL identify episode close and include last-bar width diagnostics plus `blocked_reason`.

**`span_start` tooltip** (title line `Anchor stack width setup`, then fields):

- `current_width_atr`
- `recent_max_width_atr`
- `min_current_width_atr`
- `min_recent_width_atr`
- `width_lookback_bars`
- `fast_ema`, `anchor_ema`, `slow_ema`, `atr_value`

**`span_end` tooltip** (title line `Anchor stack width ended`, then fields):

- `last_current_width_atr` (width on the last allowed bar, i.e. bar before transition)
- `last_recent_max_width_atr`
- `blocked_reason` — one of `current_width_too_narrow`, `recent_width_never_expanded`, `indicator_not_ready`

Threshold params (`min_current_width_atr`, `min_recent_width_atr`, `width_lookback_bars`) MAY also appear in `metadata` for frontend formatters but MUST be present in tooltip text or `metadata` such that Workbench can render them without recomputing indicators.

#### Scenario: Span start tooltip includes width diagnostics

- **GIVEN** a `span_start` event at the open of an allowed episode
- **WHEN** the user opens the chart tooltip
- **THEN** the tooltip title or first line references anchor stack width setup
- **AND** the tooltip includes `current_width_atr`, `recent_max_width_atr`, min thresholds, lookback, EMA values, and `atr_value`

#### Scenario: Span end tooltip includes blocked reason

- **GIVEN** a `span_end` event where the bar after the last allowed bar has `blocked_reason: current_width_too_narrow`
- **WHEN** the user opens the chart tooltip
- **THEN** the tooltip title or first line references anchor stack width ended
- **AND** the tooltip includes `last_current_width_atr`, `last_recent_max_width_atr`, and `blocked_reason`

### Requirement: Chart acceptance without runtime changes

Chart visualization for this component SHALL use existing setup-role component event toggles and rendering. It MUST NOT add a subchart, change viewport/pan/zoom behavior, or alter chart controller architecture.

#### Scenario: Setup role toggle controls visibility

- **GIVEN** Workbench chart with setup component events enabled
- **WHEN** trace includes `anchor_stack_width_setup` allowed episodes
- **THEN** `Width ok` / `Width end` markers are visible under existing setup event layer rules
- **AND** disabling setup events hides them

#### Scenario: Chart runtime unchanged

- **GIVEN** a variant with `anchor_stack_width_setup` episodes
- **WHEN** the chart loads and the user pans or zooms
- **THEN** viewport/pan/zoom behavior matches variants without this component
- **AND** no additional chart pane or subchart is created

### Requirement: Frontend presentation for anchor stack width setup events

The Workbench chart layer SHALL render `anchor_stack_width_setup` events using existing `event_type` + `role: setup` styling. A dedicated presentation formatter MAY map `label` `Width ok` / `Width end` to setup span styling; it MUST NOT introduce per-bar rendering.

#### Scenario: Generic setup styling applies when no dedicated formatter

- **GIVEN** a `component_events` record with `role: setup`, `event_type: span_start`, and `component_id: anchor_stack_width_setup`
- **WHEN** the chart renders component events
- **THEN** the marker is visible under setup role toggles
- **AND** the provided `tooltip` string is shown

