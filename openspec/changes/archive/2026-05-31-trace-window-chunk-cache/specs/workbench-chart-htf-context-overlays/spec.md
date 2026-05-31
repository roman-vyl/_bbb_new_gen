## MODIFIED Requirements

### Requirement: HTF aux overlays survive trace reload and window pan

While `signalTraceStatus` is `loading` or `error`, Workbench MUST NOT strip existing `htf_*` aux overlays (avoid flicker) when displayable HTF points remain available from the **trace chunk cache** slice for the current render window.

When the render window shifts before a new chunk arrives, Workbench MAY show a stale banner (`htfAuxEmaOverlayStale`) only for **uncovered** portions of the window.

Clearing all aux overlays (`setAuxEmaOverlays([])`) MUST NOT run when HTF specs exist but BFF exit-EMA specs are empty — HTF-only variants still render context lines.

HTF aux overlay points MUST be sourced from the accumulated trace chunk cache (when available), then sliced to the **current render window** (same bounds as `chartCandles`). When the sliding render window shifts on pan and cache covers the new range, HTF overlay series MUST update from cache slice **without** waiting for a new fetch.

#### Scenario: Pan chart retains HTF lines during trace reload

- **GIVEN** HTF context EMA lines visible for the current render window
- **WHEN** user pans the chart to an uncovered range and signal trace chunk fetch starts
- **THEN** HTF lines from cached overlapping sub-range MAY remain visible until the new chunk merges
- **AND** stale banner MAY explain lag for uncovered data
- **AND** lines update when cache covers the full render window

#### Scenario: HTF overlay slice follows render window shift from cache

- **GIVEN** trace cache contains `htf_context` covering `[T0, T2]`
- **WHEN** pan shifts the render window from `[T0, T1]` to `[T1, T2]` without a new fetch
- **THEN** displayed HTF overlay points are sliced to the new window bounds from cache
- **AND** HTF lines do not retain points outside the new render window

#### Scenario: Pan back restores HTF from cache without refetch

- **GIVEN** trace cache contains HTF context for `[Ta, Tb]`
- **WHEN** user pans away and later returns to render window `[Ta, Tb]`
- **THEN** HTF context EMA lines render from cache slice
- **AND** no signal trace refetch occurs solely because the user returned to a prior window
