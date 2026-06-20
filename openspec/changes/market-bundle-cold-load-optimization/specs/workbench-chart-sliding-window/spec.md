## MODIFIED Requirements

### Requirement: Chart maintains a sliding render window over the cached full candle bundle

The Workbench Chart SHALL keep a **render window** — a contiguous slice of cached candles from the **covering interval** for the current target display bounds — rather than treating a one-shot trade-centric slice as the permanent data bound.

The render window MUST be managed by a dedicated frontend module (`chartDataWindowManager`) that tracks:

- `fullCandlesCount` (bars available in the covering cached interval for the current target bounds)
- `windowStartIndex` and `windowEndIndex` (half-open indices into that interval's bar array)
- `renderWindowSize` (default **50 000** bars)
- `safeZoneSize` (default **10 000** bars from each window edge)

Pan-driven window shifts inside the **covering cached interval** MUST NOT trigger market API requests; they MUST slice from that interval's in-memory array only.

When a committed pan shift or trade navigation requires display bounds **outside union cache coverage**, Workbench MUST schedule resource-specific window fetches (`candles-window` and `ema-window` per period) for `missingRange` only before applying the new render window. Candle display MUST NOT wait for overlay fetches.

#### Scenario: Full bundle larger than render window

- **GIVEN** the covering cached interval contains 120 000 bars
- **WHEN** the chart initializes for the variant
- **THEN** the chart series receives at most `renderWindowSize` bars (50 000 by default)
- **AND** the render window is a contiguous sub-range of that interval's bar array

#### Scenario: Full bundle smaller than render window

- **GIVEN** the covering cached interval contains 3 000 bars
- **WHEN** the chart renders
- **THEN** the render window equals that interval (3 000 bars)
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
- If the new bounds are not covered, Workbench MUST fetch missing candles via `candles-window` and missing overlays via `ema-window`, merge into cache, then call `setData` for each ready resource (candles first)
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
- **AND** the target bounds are within union cache coverage (a covering interval exists)
- **WHEN** pan becomes idle per configured debounce
- **THEN** Workbench swaps render window once from cache and calls `setData` once
- **AND** viewport is restored to preserve user continuity around anchor time

#### Scenario: Pointerup commit applies queued shift

- **GIVEN** pointer drag lifecycle is active and pending shift exists
- **AND** the target bounds are within union cache coverage (a covering interval exists)
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

### Requirement: Pan outside union cache coverage triggers split resource window fetches

When a committed render-window shift or trade navigation requires candle times outside **union** cache coverage, Workbench MUST fetch candle `missingRange` via `/api/market/candles-window` and overlay `missingRange` via `/api/market/ema-window` per period before updating respective series. Candle `setData` MUST NOT wait for overlay fetches.

#### Scenario: Left pan beyond covering interval triggers fetch

- **GIVEN** the covering cached interval covers `[5000, 10000)` in bar-time units
- **AND** user pans left until committed render window requires bars before time 5000
- **WHEN** pan commit occurs
- **THEN** Workbench schedules `candles-window` for candle `missingRange` of the left edge only
- **AND** does not request the full report range or any gap between unrelated intervals

#### Scenario: Pan inside covering interval remains zero network

- **GIVEN** union cache coverage fully includes the committed render window after pan
- **WHEN** pan commit applies the new window slice
- **THEN** no `candles-window` or `ema-window` or `chart-bundle` network request occurs
- **AND** candles and overlays update from the covering interval slice only

#### Scenario: Distant trade jump does not load gap

- **GIVEN** tail interval cached for 2026 and user jumps to trade in 2017
- **WHEN** trade-centered window fetch completes and render window updates
- **THEN** only the 2017 trade window interval is fetched
- **AND** the 2026 interval remains in cache unchanged
- **AND** no fetch spans the 2017–2026 gap

### Requirement: Distant trade navigation fetches trade-centered window

When trade entry is outside the current render window or inside the safe zone, and the trade-centered window is not covered by union cache, Workbench MUST fetch `candles-window` and per-period `ema-window` for trade-centered bounds. Candles MUST render as soon as candle interval is available.

#### Scenario: Distant trade outside union coverage fetches split resources

- **GIVEN** trade entry time is not covered by any cached candle interval
- **WHEN** user selects that trade
- **THEN** Workbench fetches `candles-window` for trade-centered candle bounds
- **AND** Workbench fetches `ema-window` per required anchor period for the same bounds
- **AND** candle `setData` may occur before all EMA fetches complete
- **AND** previously cached intervals (e.g. tail window) are preserved
