# workbench-chart-component-event-markers Specification

## Purpose

Chart component event markers derived from signal trace: generic `component_event_markers[]` contract, v1 RSI emitters (`rsi_lookback_extreme_blocker`, `rsi_signal_exit`), dense base-indexed rendering on aligned chart bars.

## Requirements

### Requirement: Signal trace exposes generic component_event_markers array

The signal trace payload returned to Workbench SHALL include `component_event_markers`: a sparse, **component-agnostic** list of per-base-bar events aligned with `times`.

Each marker record MUST include these generic fields:

- `time` — Unix seconds on the chart/base bar (`times[i]`)
- `role` — `entry_block` or `exit_signal`
- `side` — `long` or `short`
- `component_id` — catalog component id (provenance)
- `instance_id` — rule instance id from strategy spec
- `feature_family` — feature family label (v1 emitters use `rsi`)
- `source_timeframe` — resolved RSI feature timeframe (e.g. `5m`, `1h`; not the literal `base` token)
- `base_timeframe` — strategy/chart base timeframe
- `rsi_value` — aligned RSI value at the bar, or null when unavailable
- `condition` — stable condition key (e.g. `extreme_seen`, `exit_above`, `exit_below`)
- `params` — threshold and rule metadata (object)
- `label` — short text for chart marker rendering
- `tooltip` — optional longer text for inspector/tooltip (MAY be omitted)

Marker `time` MUST use the base/chart bar index only. HTF RSI MUST NOT be re-timestamped to HTF candle open times in this payload.

#### Scenario: Marker record includes generic contract fields

- **WHEN** signal trace includes any `component_event_markers` entry
- **THEN** the record includes `time`, `role`, `side`, `component_id`, `instance_id`, `feature_family`, `source_timeframe`, `base_timeframe`, `label`, `condition`, and `params`
- **AND** `feature_family` is `rsi` for v1 emitters

#### Scenario: No markers when v1 emitters not configured

- **GIVEN** a variant with no `rsi_lookback_extreme_blocker` and no `rsi_signal_exit` rules
- **WHEN** signal trace is built
- **THEN** `component_event_markers` is an empty list

### Requirement: v1 research emitters are limited to two existing RSI components

In v1, research MUST implement marker emitters only for these existing catalog components:

- `rsi_lookback_extreme_blocker` → `role: entry_block`
- `rsi_signal_exit` → `role: exit_signal`

Research MAY use component-specific trace code for those two emitters because backend owns component semantics.

Research MUST NOT add v1 emitters for other components (including future RSI variants, counter-candle blocker, EMA exits, or context gates).

Adding emitters for additional components is out of v1 scope but MUST reuse the same generic marker contract without breaking changes.

#### Scenario: rsi_lookback_extreme_blocker emits entry_block

- **GIVEN** a variant with `rsi_lookback_extreme_blocker`
- **WHEN** aligned trace has `extreme_seen[i] == true` for the long side at base index `i`
- **THEN** `component_event_markers` includes a record with `role: entry_block`, `side: long`, `component_id: rsi_lookback_extreme_blocker`, and `time == times[i]`

#### Scenario: rsi_signal_exit emits exit_signal

- **GIVEN** a variant with `rsi_signal_exit` in an exit profile bucket
- **WHEN** the long exit condition is true at base index `i` on the aligned RSI column
- **THEN** `component_event_markers` includes a record with `role: exit_signal`, `side: long`, `component_id: rsi_signal_exit`, and `time == times[i]`

#### Scenario: Non-v1 component produces no marker in v1

- **GIVEN** a variant whose only entry filter is `counter_candle_blocker`
- **WHEN** signal trace is built
- **THEN** `component_event_markers` is empty
- **AND** no placeholder marker is emitted for unsupported components

### Requirement: Component event data is always one record per blocked or active base bar

The `component_event_markers` list is the authoritative per-base-bar event set. Research MUST NOT aggregate HTF block runs to a single HTF-period record.

For a contiguous run of active events (same `side`, `instance_id`, `role`), trace MUST include **one record per base bar** in the run.

#### Scenario: HTF hour block produces twelve trace records on 5m

- **GIVEN** an 1h RSI block active across twelve consecutive 5m base bars
- **WHEN** signal trace is built
- **THEN** `component_event_markers` contains twelve `entry_block` records
- **AND** the API response does not collapse them to one record for the hour

#### Scenario: Slice preserves per-bar events in window

- **WHEN** `slice_signal_trace` returns a window covering six of twelve blocked 5m bars
- **THEN** the sliced payload contains six marker records for those bars
- **AND** no aggregation is applied during slice

### Requirement: HTF RSI markers follow feature-pipeline base-bar alignment

When `source_timeframe` is higher than `base_timeframe`, marker emission MUST use aligned per-base-bar semantics:

1. RSI columns from `add_feature_columns_from_plan` with `_align_completed_feature_to_base`.
2. v1 emitter trace booleans computed on aligned base-index series.
3. One marker per base index `i` where the condition is true (`time == times[i]`).
4. One HTF blocking period MUST produce a contiguous run of base/chart markers (e.g. twelve 5m markers for one 1h block).
5. Frontend MUST NOT expand HTF events; backend emits the full base-indexed run.

#### Scenario: HTF blocker spans all aligned 5m bars in the hour

- **GIVEN** base timeframe `5m` and `rsi_lookback_extreme_blocker` with `source_timeframe: 1h`
- **AND** aligned pipeline marks the block active on every 5m bar from 10:00 through 10:55 for the long side
- **WHEN** signal trace is built
- **THEN** `component_event_markers` includes twelve `entry_block` records at those `times`
- **AND** no record uses a timestamp absent from `times`

#### Scenario: HTF emitter uses aligned RSI column

- **GIVEN** a blocker with `source_timeframe` higher than `base_timeframe`
- **WHEN** the v1 emitter runs
- **THEN** it reads RSI from `plan.rsi_columns` produced via `_align_completed_feature_to_base`
- **AND** emits markers only from base-index booleans

### Requirement: Chart v1 uses dense rendering mode

In v1, Chart MUST render markers in **`dense`** mode: one visible chart marker per trace event in the visible window (1:1 after filters/toggles).

Future **`compressed`** rendering is out of v1 scope and MUST NOT alter trace data.

#### Scenario: Dense mode shows marker on every blocked 5m bar

- **GIVEN** twelve `entry_block` trace events for one 1h blocked hour on a 5m chart
- **WHEN** entry-block layer is enabled and bars are visible
- **THEN** the chart displays twelve markers

#### Scenario: Compressed rendering mode is not in v1

- **WHEN** Chart v1 renders component event markers
- **THEN** there is no user-facing compressed mode that shows only the first bar of a segment

### Requirement: Chart renders markers from generic fields without component_id branching

The frontend MUST map `component_event_markers` to chart markers using only generic rendering inputs:

- **`role`** — marker kind (layer toggle, default color/shape class)
- **`side`** — marker position relative to bar
- **`time`** — bar placement
- **`label`** and optional **`tooltip`** / metadata for text

The frontend MUST NOT use `component_id` as a hardcoded rendering branch (no `switch (component_id)` or equivalent for color, shape, or position).

`component_id` MAY be shown in tooltip or metadata for forensics.

The frontend MUST NOT compute RSI, blocker, or exit conditions from candles.

The frontend MUST NOT expand, collapse, or re-time HTF events in trace data.

#### Scenario: Entry block styling is role-based

- **WHEN** the chart renders a marker with `role: entry_block` and `side: long`
- **THEN** styling is determined by `role` and `side`
- **AND** styling does not depend on `component_id`

#### Scenario: Exit signal styling is role-based

- **WHEN** the chart renders a marker with `role: exit_signal`
- **THEN** styling is determined by `role` and `side` only

#### Scenario: component_id appears in tooltip only

- **WHEN** the user inspects a component event marker with `component_id: rsi_lookback_extreme_blocker`
- **THEN** `component_id` MAY appear in tooltip or metadata
- **AND** marker color/shape/position are unchanged if `component_id` were a different supported v1 value with the same `role`

#### Scenario: Layer toggles filter by role

- **WHEN** the user disables the entry-block marker toggle
- **THEN** markers with `role: entry_block` are hidden
- **AND** markers with `role: exit_signal` remain visible when that layer is enabled

#### Scenario: Trace not loaded hides component markers

- **WHEN** signal trace status is `idle` or `error`
- **THEN** component event markers are not rendered
- **AND** trade markers behavior is unchanged

### Requirement: Chart provides legend and toggles for component event marker layers

The Chart UI SHALL provide:

- Legend entries keyed by **`role`** (`entry_block`, `exit_signal`)
- Toggles to show/hide each role independently (default: both visible when trace is ready)

The legend or hint MUST state that HTF events use backend-aligned per-base-bar data (a blocking HTF period appears as consecutive chart-bar markers).

#### Scenario: HTF alignment explained in UI

- **WHEN** a visible marker has `source_timeframe` different from `base_timeframe`
- **THEN** the chart hint or legend states markers repeat on each chart bar while the aligned HTF state persists

### Requirement: Component event markers respect visible chart window

Component event markers MUST be filtered to the same visible candle time range as trade markers and chart candles.

#### Scenario: Markers outside view are omitted

- **WHEN** a marker `time` is outside the first/last visible chart candle
- **THEN** that marker is not passed to the chart marker plugin
