## MODIFIED Requirements

### Requirement: Chart maintains a sliding render window over the cached full candle bundle

The Workbench Chart SHALL keep a **render window** — a contiguous slice of cached candles for the current display span — rather than treating a one-shot trade-centric slice as the permanent data bound.

The render window MUST be managed by a dedicated frontend module (`chartDataWindowManager`) that tracks:

- `fullCandlesCount` (bars available in cache for the current composed span)
- `windowStartIndex` and `windowEndIndex` (half-open indices into the cached span array)
- `renderWindowSize` (default **50 000** bars)
- `safeZoneSize` (default **10 000** bars from each window edge)

Pan-driven window shifts inside cached span coverage MUST NOT trigger market API requests; they MUST slice from the in-memory cached array only.

When a committed pan shift or trade navigation requires display bounds **outside** cached span coverage, Workbench MUST schedule a chart-window fetch for the missing range before applying the new render window.

#### Scenario: Full bundle larger than render window

- **GIVEN** cached candle span contains 120 000 bars
- **WHEN** the chart initializes for the variant
- **THEN** the chart series receives at most `renderWindowSize` bars (50 000 by default)
- **AND** the render window is a contiguous sub-range of the cached span array

#### Scenario: Full bundle smaller than render window

- **GIVEN** cached candle span contains 3 000 bars
- **WHEN** the chart renders
- **THEN** the render window equals the full cached span (3 000 bars)
- **AND** no pan shift is attempted beyond global array bounds

### Requirement: Pan near window edge shifts the render window from cache

When the user pans the chart and the visible logical range approaches the edge of the current render window, the Workbench MUST evaluate shift intent from in-memory cached candles and MUST defer the actual render-window swap while active drag is in progress.

The chart MUST subscribe to visible logical range changes (`timeScale().subscribeVisibleLogicalRangeChange`).

Shift intent triggers:

- **Shift right intent** when `visible.to` exceeds `(windowLength - safeZoneSize)`
- **Shift left intent** when `visible.from` is less than `safeZoneSize`

During active pan:

- Workbench MUST record pending shift intent and anchor context
- Workbench MUST NOT call `setData` for a new render window solely due to active drag boundary crossing

Commit policy:

- For pointer drag lifecycle, Workbench MUST commit accepted pending shift on `pointerup`
- For wheel/touchpad interactions or missing `pointerup`, Workbench MUST commit via idle debounce fallback (300–500 ms)

After commit:

- Workbench MUST apply at most one committed shift for the latest pending intent
- If the new render window bounds are covered by `marketResourceCache`, Workbench MUST call `setData` with the new window slice from cache
- If the new bounds are not covered, Workbench MUST fetch the missing chart-window chunk, merge into cache, then call `setData`
- Workbench MUST restore viewport using a time-based anchor (pre-swap visible-time center, or cursor-time anchor when available) within tolerance of one bar
- Workbench MUST NOT restore using pre-swap logical index as primary anchor

#### Scenario: Active drag at right boundary queues shift without immediate swap

- **GIVEN** a render window of 50 000 bars with `safeZoneSize` 10 000
- **AND** pointer drag is active
- **WHEN** `visible.to` becomes greater than 40 000
- **THEN** a right-shift intent is recorded
- **AND** `setData` is not called until pan idle commit

#### Scenario: Idle commit applies one queued shift

- **GIVEN** a pending right-shift intent exists after active pan
- **AND** the target bounds are within cached span coverage
- **WHEN** pan becomes idle per configured debounce
- **THEN** Workbench swaps render window once from cache and calls `setData` once
- **AND** viewport is restored to preserve user continuity around anchor time

#### Scenario: Pointerup commit applies queued shift

- **GIVEN** pointer drag lifecycle is active and pending shift exists
- **AND** the target bounds are within cached span coverage
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

## ADDED Requirements

### Requirement: Pan outside cached span triggers chart-window fetch

When a committed render-window shift or trade navigation requires candle times outside the current `marketResourceCache` span, Workbench MUST fetch the missing range via `/api/market/chart-window` before updating candle series data.

#### Scenario: Left pan beyond cache triggers fetch

- **GIVEN** cached candle span covers `[5000, 10000)` in bar-time units
- **AND** user pans left until committed render window requires bars before time 5000
- **WHEN** pan commit occurs
- **THEN** Workbench schedules a chart-window fetch for the missing left range
- **AND** does not request the full report range

#### Scenario: Pan inside cached span remains zero network

- **GIVEN** cached candle span fully covers the committed render window after pan
- **WHEN** pan commit applies the new window slice
- **THEN** no chart-window or chart-bundle network request occurs
- **AND** candles and overlays update from cache slice only

### Requirement: Distant trade navigation fetches trade-centered window

When trade entry is outside the current render window or inside the safe zone, and the trade-centered window is not covered by cache, Workbench MUST fetch a chart-window centered on the trade entry before `setData`.

#### Scenario: Distant trade outside cache fetches window

- **GIVEN** trade entry time is outside the cached candle span
- **WHEN** user selects that trade
- **THEN** Workbench fetches chart-window for trade-centered display bounds
- **AND** rebuilds render window from merged cache
- **AND** visible range centers on trade entry (~400 bars)
