# workbench-market-window-planner Specification

## Purpose

Resolve target display windows and plan split-resource fetches (`candles-window`, `ema-window` per period) before Workbench network IO. Separates candle readiness from overlay readiness for progressive chart render.

## Requirements

### Requirement: Market window planner resolves target display bounds before network fetch

Workbench Chart SHALL determine a **target display window** (time bounds in milliseconds) before issuing any market network request on cold open or trade navigation.

Initial cold open MUST resolve either:

- a tail-aligned render window (default ~25 000 bars), or
- a trade-centered window when a distant trade is the navigation target (~400 bars centered on entry per sliding-window policy, expanded to render-window size when needed)

The planner MUST NOT default to the full report `data_range` for the first fetch.

#### Scenario: Cold open targets tail window not full report

- **GIVEN** a report with 120 000 bars in `data_range`
- **AND** no prior market cache for the run
- **WHEN** Chart activates and market load starts
- **THEN** the first candles network request covers at most the initial render window near the report tail
- **AND** no request spans the full 120 000-bar report range

#### Scenario: Distant trade targets window around entry

- **GIVEN** a selected trade whose entry time is outside all cached intervals (or only inside a gap between intervals)
- **WHEN** trade navigation requests market data
- **THEN** the planner resolves display bounds centered on the trade entry
- **AND** resource fetches cover the trade-centered render window only, not the full report range

### Requirement: Planner schedules candles and EMA overlays independently

The planner MUST evaluate `marketResourceCache` union interval coverage separately for candles and for each required anchor-stack overlay.

Candles fetches MUST use `/api/market/candles-window` when candle `missingRange` is non-null.

Each missing overlay MUST use a separate `/api/market/ema-window` request for its `period` (and role identity). The planner MUST NOT bundle multiple periods into one network call in v1.

#### Scenario: Candles fetch does not wait for EMA

- **GIVEN** target display bounds `[X, Y)` with no cached candles
- **AND** no cached EMA overlays
- **WHEN** planner runs
- **THEN** it schedules `candles-window` for candle `missingRange`
- **AND** may schedule `ema-window` fetches in parallel or after candles plan
- **AND** candles fetch is not blocked on EMA fetch completion

#### Scenario: Cache hit avoids network per resource

- **GIVEN** candle intervals cover `[X, Y)` but overlay `EMA(200)` does not
- **WHEN** planner runs for bounds `[X, Y)`
- **THEN** no `candles-window` fetch occurs
- **AND** exactly one `ema-window` fetch occurs for period 200
- **AND** other covered overlay periods produce no fetch

#### Scenario: Distant trade fetches only trade window not gap

- **GIVEN** tail candle interval A cached for 2026
- **AND** user selects a trade in 2017 outside interval A
- **WHEN** planner resolves trade-centered bounds `[T_from, T_to)`
- **THEN** `candles-window` fetch covers only candle `missingRange` within `[T_from, T_to)`
- **AND** no fetch spans the gap between 2017 and 2026
- **AND** after seeding, two separate candle intervals exist in cache

### Requirement: Split market readiness gates chart layers independently

Workbench MUST expose separate readiness for candles and overlays:

- `marketCandlesReady`: union candle intervals cover current target display bounds
- `marketOverlaysReady`: every required anchor-stack overlay interval covers current target display bounds

ChartPanel (or chart runtime) MUST render candle `setData` when `marketCandlesReady` is true.

ChartPanel MUST render each anchor EMA overlay `setData` when that overlay's interval covers the display bounds — overlays MAY arrive and render after candles.

Workbench MUST NOT delay candle render until `marketOverlaysReady`.

#### Scenario: Candles render before EMA arrives

- **GIVEN** `candles-window` response merged into cache for bounds `[X, Y)`
- **AND** `ema-window` requests for fast/anchor/slow are still in flight
- **WHEN** `marketCandlesReady` becomes true
- **THEN** candle series `setData` runs
- **AND** chart displays OHLC without anchor EMA lines
- **AND** EMA lines appear individually as each `ema-window` completes

#### Scenario: All overlays ready after staggered arrival

- **GIVEN** three `ema-window` fetches complete in arbitrary order
- **WHEN** the last required overlay interval covers `[X, Y)`
- **THEN** `marketOverlaysReady` becomes true
- **AND** all three anchor EMA series are visible

### Requirement: Window responses seed split resource caches

On successful response, Workbench MUST merge:

- `candles-window` → candle interval chunks via `mergeCandlesChunk`
- each `ema-window` → overlay interval chunk for that period/role via `mergeOverlayChunk`

#### Scenario: Candles-window seeds candle cache only

- **GIVEN** a successful `CandlesWindowBundle` for `[X, Y)`
- **WHEN** seeding completes
- **THEN** `marketResourceCache` candle `coversRange(X, Y)` is true
- **AND** no overlay intervals are created or modified by that response alone

#### Scenario: Ema-window seeds one overlay cache entry

- **GIVEN** a successful `EmaWindowBundle` for `period=500` and bounds `[X, Y)`
- **WHEN** seeding completes
- **THEN** overlay cache for role/period 500 covers `[X, Y)`
- **AND** candle intervals are unchanged

### Requirement: In-flight dedupe prevents duplicate window fetches per resource

The planner MUST dedupe concurrent fetches per resource fetch key:

- Candles: `(symbol, timeframe, bounds, reloadToken)`
- EMA: `(symbol, timeframe, period, bounds, reloadToken)`

Superseded or aborted responses MUST NOT update cache or UI state.

#### Scenario: Duplicate candles fetch skipped

- **GIVEN** a `candles-window` fetch is in flight for key `K`
- **WHEN** planner runs again with the same `K`
- **THEN** no second candles request starts

### Requirement: Market window planner does not schedule chart-events or signal-trace fetches

The planner MUST only orchestrate candles and BFF anchor-stack EMA overlays. It MUST NOT invoke `/chart-events` or `/signal-trace`.

#### Scenario: Candles-window fetch does not trigger trace fetch

- **GIVEN** a `candles-window` fetch completes
- **WHEN** only candle layer data was missing
- **THEN** signal-trace and chart-events scheduling remain unchanged
- **AND** no trace fetch starts solely because candles arrived
