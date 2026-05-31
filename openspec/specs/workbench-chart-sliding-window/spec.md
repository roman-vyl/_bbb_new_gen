# workbench-chart-sliding-window Specification

## Purpose

Workbench Chart keeps a **sliding render window** (default 50 000 bars) over the full in-memory market bundle. Pan near window edges shifts the slice from cache with deferred commit during active drag. Controller-owned pan lifecycle is specified in `workbench-chart-controller-orchestration`.
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

When the user pans the chart and the visible logical range approaches the edge of the current render window, the Workbench MUST evaluate shift intent from in-memory `cachedBundle.candles` and MUST defer the actual render-window swap while active drag is in progress.

The chart MUST subscribe to visible logical range changes (`timeScale().subscribeVisibleLogicalRangeChange`).

Shift intent triggers:

- **Shift right intent** when `visible.to` exceeds `(windowLength - safeZoneSize)`
- **Shift left intent** when `visible.from` is less than `safeZoneSize`

During active pan:

- Workbench MUST record pending shift intent and anchor context
- Workbench MUST NOT call `setData` for a new render window solely due to active drag boundary crossing

Commit policy:

- For pointer drag lifecycle, Workbench MUST commit accepted pending shift on `pointerup`
- For wheel/touchpad interactions or missing `pointerup`, Workbench MUST commit via idle debounce fallback (300–500 ms)

After commit:

- Workbench MUST apply at most one committed shift for the latest pending intent
- Workbench MUST call `setData` with the new window slice
- Workbench MUST restore viewport using a time-based anchor (pre-swap visible-time center, or cursor-time anchor when available) within tolerance of one bar
- Workbench MUST NOT restore using pre-swap logical index as primary anchor

#### Scenario: Active drag at right boundary queues shift without immediate swap

- **GIVEN** a render window of 50 000 bars with `safeZoneSize` 10 000
- **AND** pointer drag is active
- **WHEN** `visible.to` becomes greater than 40 000
- **THEN** a right-shift intent is recorded
- **AND** `setData` is not called until pan idle commit

#### Scenario: Idle commit applies one queued shift

- **GIVEN** a pending right-shift intent exists after active pan
- **WHEN** pan becomes idle per configured debounce
- **THEN** Workbench swaps render window once from cache and calls `setData` once
- **AND** viewport is restored to preserve user continuity around anchor time

#### Scenario: Pointerup commit applies queued shift

- **GIVEN** pointer drag lifecycle is active and pending shift exists
- **WHEN** `pointerup` event is received
- **THEN** Workbench commits one accepted shift without waiting for additional idle delay
- **AND** fallback debounce is not required for that commit

#### Scenario: Restore anchor uses time, not logical index

- **GIVEN** pre-swap window and post-swap window have different logical index frames
- **WHEN** window swap commits
- **THEN** restore uses pre-swap time anchor (visible center or cursor time)
- **AND** restore is not derived from pre-swap logical index identity

#### Scenario: Pan inside safe zone does not enqueue shifts

- **GIVEN** `visible.from` ≥ `safeZoneSize` and `visible.to` ≤ `(windowLength - safeZoneSize)`
- **WHEN** the user pans within the chart
- **THEN** no pending shift is recorded
- **AND** render-window indices remain unchanged

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

### Requirement: chartWindowKey reflects committed render window state for signal trace

`chartWindowKey` used for trace session identity and diagnostics MUST be derived from the currently **committed** render window bounds (`firstTime`, `lastTime`) plus `context_overlay_ref`.

While a shift is only pending during active pan and not yet committed, Workbench MUST NOT publish a new committed `chartWindowKey`.

When a shift commits:

- Workbench MUST emit one new committed `chartWindowKey`
- Workbench MUST evaluate trace cache coverage for that committed window
- If covered, trace display MUST update from cache without fetch
- If uncovered, Workbench MUST fetch missing/current range and merge into cache

When trade selection only re-centers viewport inside current safe zone, `chartWindowKey` MUST remain unchanged.

#### Scenario: Pending shift during active pan does not churn key

- **GIVEN** user drags near window edge and shift intent is pending
- **WHEN** no window commit has occurred yet
- **THEN** `chartWindowKey` remains bound to the pre-shift committed window
- **AND** trace orchestration does not start a new fetch solely from pending state

#### Scenario: Committed shift emits one new key

- **GIVEN** pending shift exists and pan becomes idle
- **WHEN** render-window swap commits
- **THEN** exactly one new committed `chartWindowKey` is produced for the new bounds
- **AND** trace coverage check/fetch decision runs for that key

#### Scenario: Pan shift within cached trace range does not refetch

- **GIVEN** trace chunk cache covers the committed window after shift
- **WHEN** `chartWindowKey` changes to reflect new committed bounds inside cached span
- **THEN** display updates from cache slice
- **AND** no new signal trace fetch starts solely due to the key change

#### Scenario: In-zone trade select preserves trace window key

- **GIVEN** trace cache covers the current render window
- **WHEN** user selects another trade whose entry is inside the safe zone of the same render window
- **THEN** `chartWindowKey` remains unchanged
- **AND** signal trace is not re-fetched solely due to trade selection

### Requirement: Anchor-stack EMA render-window stabilize cache MUST invalidate when overlay content or variant market key changes

Workbench slices anchor-stack `ema_overlays` from the variant's market bundle (`intendedMarketCacheKey`) to the committed render window and MAY stabilize the sliced result for performance.

When render-window bounds are unchanged but anchor overlay point sets change — for example after variant switch when the new instance's market bundle arrives — the stabilize cache key MUST incorporate the market cache identity and an overlay content fingerprint (e.g. per-line `role:period:points.length`) via `buildEmaOverlaysStabilizeKey`.

Workbench MUST NOT return a prior empty anchor slice from stabilize when the intended variant bundle now provides displayable anchor-stack points for the same bounds.

#### Scenario: Variant switch at same render window shows anchor stack

- **GIVEN** user switches report variant (e.g. `instance_1` → `instance_2`) without panning
- **AND** render-window bounds remain unchanged
- **AND** the new variant's market bundle includes anchor-stack EMA overlays
- **WHEN** Workbench recomputes `chartWindowSlice` after bundle load
- **THEN** chart renders solid fast/anchor/slow EMA lines
- **AND** Bar Inspector shows EMA values at the selected bar (not `— / — / —`)

#### Scenario: Stabilize does not resurrect stale empty anchor slice

- **GIVEN** `chartWindowSlice` initially stabilized an empty anchor slice for bounds `B` and market key `K2`
- **WHEN** market bundle for `K2` later provides non-empty anchor overlays at the same bounds `B`
- **THEN** stabilized output updates to the new overlay series

