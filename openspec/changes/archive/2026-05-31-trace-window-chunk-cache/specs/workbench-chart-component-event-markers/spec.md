## MODIFIED Requirements

### Requirement: Component events respect visible chart window

Component events MUST be filtered to the same **current render window** candle time range as trade markers and chart candles — the sliding window managed by `chartDataWindowManager`, not a fixed trade-selection slice that does not move on pan.

Component events for display MUST be sourced from the **accumulated signal trace chunk cache** (when available), then sliced to the render window — not from the latest single-window trace response alone.

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
