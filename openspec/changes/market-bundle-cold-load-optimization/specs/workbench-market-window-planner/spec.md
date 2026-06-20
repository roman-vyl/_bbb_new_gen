## ADDED Requirements

### Requirement: Market window planner resolves target display bounds before network fetch

Workbench Chart SHALL determine a **target display window** (time bounds in milliseconds) before issuing any market network request on cold open or trade navigation.

Initial cold open MUST resolve either:

- a tail-aligned render window (default ~50 000 bars), or
- a trade-centered window when a distant trade is the navigation target (~400 bars centered on entry per sliding-window policy, expanded to render-window size when needed)

The planner MUST NOT default to the full report `data_range` for the first fetch.

#### Scenario: Cold open targets tail window not full report

- **GIVEN** a report with 120 000 bars in `data_range`
- **AND** no prior market cache for the run
- **WHEN** Chart activates and market load starts
- **THEN** the first market network request display bounds cover at most the initial render window near the report tail
- **AND** the request does not span the full 120 000-bar report range

#### Scenario: Distant trade targets window around entry

- **GIVEN** a selected trade whose entry time is far from the current cached span
- **WHEN** trade navigation requests market data
- **THEN** the planner resolves display bounds centered on the trade entry
- **AND** the fetch covers the trade-centered render window, not the full report range

### Requirement: Planner checks cache coverage before fetching

Before calling `/api/market/chart-window`, the planner MUST evaluate `marketResourceCache` span coverage for the target display bounds (candles and required anchor-stack overlays).

When coverage is complete, the planner MUST skip network and resolve display data from cache only.

#### Scenario: Cache hit avoids network

- **GIVEN** `marketResourceCache` already covers the target display bounds for candles and all required overlays
- **WHEN** the planner runs for that window
- **THEN** no `api.fetchChartWindow` call is made
- **AND** `composeRunMarketBundle` or equivalent read returns data from cache

#### Scenario: Cache miss fetches only missing bounds

- **GIVEN** candles cover `[A, B)` but target window is `[X, Y)` with `X < A`
- **WHEN** the planner evaluates missing range
- **THEN** it schedules a chart-window fetch for the missing sub-range only
- **AND** does not re-fetch the already-covered `[A, B)` span

### Requirement: Chart-window responses seed split resource caches

On successful `chart-window` response, Workbench MUST merge candles and each EMA overlay into `marketResourceCache` span storage. Seeding MUST preserve split candle vs overlay identity per `workbench-chart-market-resource-cache`.

#### Scenario: Window response merges into cache

- **GIVEN** a successful `ChartMarketWindowBundle` for display bounds `[X, Y)`
- **WHEN** seeding completes
- **THEN** `marketResourceCache.coversRange(X, Y)` is true for candles
- **AND** each required anchor-stack overlay covers `[X, Y)`
- **AND** overlay points are stored under overlay resource identity (role, period, symbol, timeframe)

### Requirement: In-flight dedupe prevents duplicate window fetches

The planner MUST dedupe concurrent fetches for the same window fetch key (symbol, timeframe, display bounds, EMA periods, reload token). Superseded or aborted responses MUST NOT update cache or UI state.

#### Scenario: Duplicate planner invocation skips in-flight fetch

- **GIVEN** a chart-window fetch is already in flight for fetch key `K`
- **WHEN** the planner runs again with the same `K` before completion
- **THEN** no second network request starts
- **AND** pipeline debug records an in-flight skip decision

### Requirement: Market window planner does not schedule chart-events or signal-trace fetches

The planner MUST only orchestrate candles and BFF anchor-stack EMA overlays. It MUST NOT invoke `/chart-events` or `/signal-trace` endpoints or share fetch keys with trace display scheduling.

#### Scenario: Market window fetch does not trigger trace fetch

- **GIVEN** a chart-window fetch completes for a new display bounds
- **WHEN** only market layer data was missing
- **THEN** signal-trace and chart-events scheduling remain governed by their own coordinators
- **AND** no trace fetch starts solely because market window data arrived
