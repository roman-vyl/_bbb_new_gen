## MODIFIED Requirements

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
- For wheel/touchpad interactions or missing `pointerup`, Workbench MUST commit via idle debounce fallback (300-500ms)

After commit:

- Workbench MUST apply at most one committed shift for the latest pending intent
- Workbench MUST call `setData` with the new window slice
- Workbench MUST restore viewport using a time-based anchor (pre-swap visible-time center, or cursor-time anchor when available) within tolerance of one bar
- Workbench MUST NOT restore using pre-swap logical index as primary anchor

#### Scenario: Active drag at right boundary queues shift without immediate swap
- **GIVEN** a render window of 50,000 bars with `safeZoneSize` 10,000
- **AND** pointer drag is active
- **WHEN** `visible.to` becomes greater than 40,000
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
- **GIVEN** `visible.from` >= `safeZoneSize` and `visible.to` <= `(windowLength - safeZoneSize)`
- **WHEN** the user pans within the chart
- **THEN** no pending shift is recorded
- **AND** render-window indices remain unchanged

### Requirement: chartWindowKey reflects committed render window state for signal trace
`chartWindowKey` used for trace session identity and diagnostics MUST be derived from the currently committed render window bounds (`firstTime`, `lastTime`) plus `context_overlay_ref`.

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
