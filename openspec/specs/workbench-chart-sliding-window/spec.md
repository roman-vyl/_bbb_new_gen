# workbench-chart-sliding-window Specification

## Purpose

Workbench Chart keeps a **sliding render window** (default 50 000 bars) over cached market intervals. Pan near window edges shifts the slice from cache with deferred commit during active drag; pan outside cache coverage triggers split `candles-window` / `ema-window` fetches for missing ranges only.
## Requirements
### Requirement: Chart maintains a sliding render window over the cached full candle bundle

The Workbench Chart SHALL keep a **render window** — a contiguous slice of cached candles from the **covering interval** for the current target display bounds — rather than treating a one-shot trade-centric slice as the permanent data bound.

The render window MUST be managed by a dedicated frontend module (`chartDataWindowManager`) that tracks:

- `fullCandlesCount` (bars available in the covering cached interval for the current target bounds)
- `windowStartIndex` and `windowEndIndex` (half-open indices into that interval's bar array)
- `renderWindowSize` (default **50 000** bars)
- `safeZoneSize` (default **10 000** bars from each window edge)

Pan-driven window shifts inside the **covering cached interval** MUST NOT trigger market API requests; they MUST slice from that interval's in-memory array only.

When a committed pan shift or trade navigation requires display bounds **outside union cache coverage**, Workbench MUST schedule resource-specific window fetches (`candles-window` and `ema-window` per period) for `missingRange` only before applying the new render window. Candle display MUST NOT wait for overlay fetches.

#### Scenario: Full bundle larger than render window

- **GIVEN** the covering cached interval contains 120 000 bars
- **WHEN** the chart initializes for the variant
- **THEN** the chart series receives at most `renderWindowSize` bars (50 000 by default)
- **AND** the render window is a contiguous sub-range of that interval's bar array

#### Scenario: Full bundle smaller than render window

- **GIVEN** the covering cached interval contains 3 000 bars
- **WHEN** the chart renders
- **THEN** the render window equals that interval (3 000 bars)
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
- If the new render window bounds are covered by `marketResourceCache`, Workbench MUST call `setData` with the new window slice from cache
- If the new bounds are not covered, Workbench MUST fetch missing candles via `candles-window` and missing overlays via `ema-window`, merge into cache, then call `setData` for each ready resource (candles first)
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

### Requirement: Pan outside union cache coverage MUST trigger split resource window fetches

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

### Requirement: Distant trade navigation MUST fetch trade-centered window

When trade entry is outside the current render window or inside the safe zone, and the trade-centered window is not covered by union cache, Workbench MUST fetch `candles-window` and per-period `ema-window` for trade-centered bounds. Candles MUST render as soon as candle interval is available.

#### Scenario: Distant trade outside union coverage fetches split resources

- **GIVEN** trade entry time is not covered by any cached candle interval
- **WHEN** user selects that trade
- **THEN** Workbench fetches `candles-window` for trade-centered candle bounds
- **AND** Workbench fetches `ema-window` per required anchor period for the same bounds
- **AND** candle `setData` may occur before all EMA fetches complete
- **AND** previously cached intervals (e.g. tail window) are preserved

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

Workbench SHALL slice anchor-stack `ema_overlays` from the variant's market bundle (`intendedMarketCacheKey`) to the committed render window and MAY stabilize the sliced result for performance.

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

### Requirement: Lazy chart activation preserves render-window semantics

Chart-heavy IO gating SHALL NOT change sliding render-window behavior after Chart activation. Once market data is loaded, the chart MUST still initialize tail or trade-centered windows, use the 50k render window and 10k safe zone defaults, and defer active-pan swaps until commit.

#### Scenario: First chart activation initializes normal window

- **GIVEN** a run report loaded while Chart was not active
- **WHEN** the user opens Chart and market data loads
- **THEN** the render-window manager initializes from the loaded candle data
- **AND** the initial window is tail or trade-centered according to existing selection policy
- **AND** no alternate window semantics are introduced by lazy activation

### Requirement: Event display changes do not alter candle window commits

Trace display partial state, missing-range scheduling, and chart event cache updates MUST NOT trigger render-window shifts or viewport commands. Render-window shifts remain owned by the render-window controller and viewport controller.

#### Scenario: Trace merge does not move viewport

- **GIVEN** a render-window shift committed and viewport restore completed
- **WHEN** a trace display chunk later merges for the current window
- **THEN** markers and HTF overlays may update
- **AND** no additional render-window shift is committed
- **AND** no viewport focus or restore command is issued solely because trace data arrived

### Requirement: Trade navigation remains safe-zone aware

Trade navigation SHALL continue to rebuild the candle render window only when the selected trade entry is outside the current window or inside the safe zone. Trace/event scheduling changes MUST NOT force candle `setData` when an in-zone trade selection only requires viewport focus.

#### Scenario: In-zone trade selection avoids candle rebuild

- **GIVEN** the selected trade entry is within the current render window and outside both safe zones
- **WHEN** the user navigates to that trade
- **THEN** Workbench centers the viewport on the trade
- **AND** candle series data is not reset solely because trace display state changes
