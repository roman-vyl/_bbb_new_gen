# workbench-chart-sliding-window Specification

## Purpose
TBD - created by archiving change chart-sliding-render-window. Update Purpose after archive.
## Requirements
### Requirement: Chart maintains a sliding render window over the cached full candle bundle

The Workbench Chart SHALL keep a **render window** — a contiguous slice of `cachedBundle.candles` already loaded in memory — rather than treating a one-shot trade-centric slice as the permanent data bound.

The render window MUST be managed by a dedicated frontend module (`chartDataWindowManager`) that tracks:

- `fullCandlesCount`
- `windowStartIndex` and `windowEndIndex` (half-open indices into the full cached array)
- `renderWindowSize` (default **50 000** bars)
- `safeZoneSize` (default **10 000** bars from each window edge)

Pan-driven window shifts MUST NOT trigger new market API requests; they MUST slice from the in-memory cached array only.

#### Scenario: Full bundle larger than render window

- **GIVEN** `cachedBundle.candles` contains 120 000 bars
- **WHEN** the chart initializes for the variant
- **THEN** the chart series receives at most `renderWindowSize` bars (50 000 by default)
- **AND** the render window is a contiguous sub-range of the full cached array

#### Scenario: Full bundle smaller than render window

- **GIVEN** `cachedBundle.candles` contains 3 000 bars
- **WHEN** the chart renders
- **THEN** the render window equals the full cached array (3 000 bars)
- **AND** no pan shift is attempted beyond global array bounds

### Requirement: Pan near window edge shifts the render window from cache

When the user pans the chart and the visible logical range approaches the edge of the current render window, the Workbench MUST shift the render window by slicing a new contiguous range from `cachedBundle.candles`, call `setData` with the new slice, and restore the visible logical range so the screen does not visually jump.

The chart MUST subscribe to visible logical range changes (`timeScale().subscribeVisibleLogicalRangeChange`).

Shift triggers:

- **Shift right** when `visible.to` exceeds `(windowLength - safeZoneSize)`
- **Shift left** when `visible.from` is less than `safeZoneSize`

After shift, the viewport anchor bar (by time) MUST remain at the same on-screen position within tolerance of one bar.

#### Scenario: Pan right across safe zone boundary

- **GIVEN** a render window of 50 000 bars with `safeZoneSize` 10 000
- **AND** the user has panned so `visible.to` is greater than 40 000 (window-relative)
- **WHEN** the pan handler evaluates the visible range
- **THEN** the render window shifts right within the full cached array
- **AND** `setData` receives the new candle slice
- **AND** the visible candles on screen remain continuous (no jump to unrelated time)

#### Scenario: Pan left across safe zone boundary

- **GIVEN** the user has panned so `visible.from` is less than 10 000 (window-relative)
- **WHEN** the pan handler evaluates the visible range
- **THEN** the render window shifts left within the full cached array
- **AND** visible range is restored after `setData`

#### Scenario: Pan inside safe zone does not shift window

- **GIVEN** `visible.from` ≥ `safeZoneSize` and `visible.to` ≤ `(windowLength - safeZoneSize)`
- **WHEN** the user pans within the chart
- **THEN** the render window indices do not change
- **AND** `setData` is not called solely due to pan

### Requirement: Trade selection minimizes unnecessary setData

When the user selects a trade, the Workbench MUST center the viewport on the trade entry bar. If the entry bar index is already inside the current render window and not within `safeZoneSize` of either window edge, the Workbench MUST NOT rebuild the render window or call `setData`; it MUST only adjust the visible range.

If the entry is outside the current window or within `safeZoneSize` of an edge, the Workbench MUST rebuild the render window centered on the entry index and call `setData` before centering the viewport.

Trade-focus visible range MUST show approximately **400** bars centered on entry (configurable constant; replaces prior ~120-bar default).

#### Scenario: Adjacent trade inside current window safe zone

- **GIVEN** render window already contains trade B entry index
- **AND** entry index is at least `safeZoneSize` bars from both window edges
- **WHEN** user selects trade B
- **THEN** chart visible range centers on trade B entry
- **AND** candle series data is unchanged (no `setData`)

#### Scenario: Distant trade requires window rebuild

- **GIVEN** trade C entry index is outside the current render window
- **WHEN** user selects trade C
- **THEN** render window rebuilds centered on trade C entry index
- **AND** `setData` updates candles and overlays to the new window
- **AND** visible range centers on trade C entry (~400 bars)

### Requirement: All chart layers slice to the current render window

Candles, anchor EMA overlays, auxiliary EMA overlays (including HTF context), trade markers, and component event markers MUST all be derived from the **current render window** time range — not from a stale trade-selection slice.

When the render window shifts on pan, all layers MUST update to match the new window bounds.

#### Scenario: Markers track panned window

- **GIVEN** trade markers and component events visible for the current render window
- **WHEN** user pans until the render window shifts
- **THEN** trade markers outside the new window are removed
- **AND** component events outside the new window are removed
- **AND** events inside the new window appear if present in trace data

#### Scenario: EMA overlays track panned window

- **GIVEN** anchor and aux EMA series rendered for the current window
- **WHEN** the render window shifts on pan
- **THEN** EMA line series receive points filtered to the new window time range only

### Requirement: chartWindowKey reflects current render window for signal trace

`chartWindowKey` used for signal trace load and cache alignment MUST be derived from the current render window bounds (`firstTime`, `lastTime` of render window candles), including `context_overlay_ref`.

When the render window shifts on pan, `chartWindowKey` MUST update and MAY trigger signal trace reload for the new range per existing trace-loading rules.

When trade selection recenters viewport without window rebuild, `chartWindowKey` MUST NOT change.

#### Scenario: Pan shift updates trace window key

- **GIVEN** signal trace loaded for window `[T0, T1]`
- **WHEN** pan shifts render window to `[T0', T1']` where bounds differ
- **THEN** `chartWindowKey` reflects the new bounds
- **AND** signal trace reload is requested for the new window per existing Workbench rules

#### Scenario: In-zone trade select preserves trace window key

- **GIVEN** signal trace loaded for window `[T0, T1]`
- **WHEN** user selects another trade whose entry is inside the safe zone of the same render window
- **THEN** `chartWindowKey` remains unchanged
- **AND** signal trace is not re-fetched solely due to trade selection

