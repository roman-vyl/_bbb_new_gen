# workbench-chart-component-event-markers Specification

## Purpose

Chart component semantic events derived from signal trace: generic `component_events[]` contract with `event_type` vocabulary (`point`, `span_start`, `span_end`, `source`), extensible `role`, top-level alignment fields, component-specific data in `metadata`. v1 RSI emitters (`rsi_lookback_extreme_blocker`, `rsi_signal_exit`); frontend renders by `event_type` + `role` + `side` only.

## Requirements

### Requirement: Signal trace exposes component_events with event_type vocabulary

The signal trace payload returned to Workbench SHALL include `component_events`: a sparse, **component-agnostic** list of semantic events aligned with chart/base bar times (`trace.times`).

Each event record MUST include:

- `time` — Unix seconds on the chart/base bar (`times[i]`)
- `event_type` — one of `point`, `span_start`, `span_end`, `source`
- `role` — semantic category for styling and layer toggles (v1: `entry_block`, `exit_signal`)
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

Research MUST use component-specific trace code per emitter because backend owns component semantics.

Research MUST NOT add emitters for other components until follow-up changes (counter-candle blocker, EMA exits, context gates, setup/trigger).

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

#### Scenario: Non-implemented component produces no events

- **GIVEN** a variant whose only entry filter is `counter_candle_blocker`
- **WHEN** signal trace is built before a counter-candle emitter exists
- **THEN** `component_events` is empty
- **AND** no placeholder event is emitted

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
- **`role`** — layer toggle and color family (`entry_block`, `exit_signal`)
- **`side`** — marker position relative to bar (`long` / `short`)
- **`time`** — bar placement
- **`label`** and optional **`tooltip`** / `metadata` for text

The frontend MUST NOT use `component_id` as a hardcoded rendering branch (no `switch (component_id)` or equivalent for color, shape, or position).

`component_id` MAY be shown in tooltip or metadata for forensics.

The frontend MUST NOT compute component conditions (blockers, exits, regimes, indicators) from candles.

The frontend MUST NOT branch on feature family or catalog ids (`component_id`, `rsi`, `ema`) for marker styling.

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

#### Scenario: Trace not loaded hides component events

- **WHEN** signal trace status is `idle` or `error`
- **THEN** component events are not rendered
- **AND** trade markers behavior is unchanged

### Requirement: Chart provides legend and toggles for component event layers

The Chart UI SHALL provide:

- Legend entries keyed by **`role`** (v1: `entry_block`, `exit_signal`)
- Toggles to show/hide each role independently (default: visible roles when trace is ready)
- Legend copy describing **`event_type`** semantics (`source`, span start/end, `point`) — MUST NOT reference RSI or specific catalog components

#### Scenario: Semantic event types explained in UI

- **WHEN** component events are visible on chart
- **THEN** the chart hint or legend describes `source`, span start/end, and `point` markers
- **AND** states HTF spans use backend-aligned base-bar boundaries

### Requirement: Component events respect visible chart window

Component events MUST be filtered to the same visible candle time range as trade markers and chart candles.

Partial spans are acceptable: when the visible window intersects the middle or end of a blocked run, only `span_end` (or only `span_start`) MAY appear — this is expected and MUST NOT be treated as a data bug.

#### Scenario: Events outside view are omitted

- **WHEN** an event `time` is outside the first/last visible chart candle
- **THEN** that event is not passed to the chart marker plugin

#### Scenario: Partial span visible at window start

- **GIVEN** a blocked run whose `span_start` is before the first visible chart candle
- **AND** `span_end` falls inside the visible range
- **WHEN** component events are rendered
- **THEN** only `span_end` (and any in-window `source` or mid-run events) are shown
- **AND** the chart does not synthesize a fake `span_start` at the window edge

### Requirement: Chart HTF hint uses top-level timeframes

When any visible component event has top-level `source_timeframe` different from `base_timeframe`, the chart hint or legend MUST state that spans use backend-aligned base-bar boundaries. The frontend MUST NOT read timeframes from `metadata` for this hint.

#### Scenario: HTF alignment hint from top-level fields

- **WHEN** a visible event has `source_timeframe: 1h` and `base_timeframe: 5m` at top level
- **THEN** the chart hint explains HTF-aligned base-bar span boundaries
- **AND** the hint does not require `metadata.source_timeframe`
