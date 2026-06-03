## ADDED Requirements

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
