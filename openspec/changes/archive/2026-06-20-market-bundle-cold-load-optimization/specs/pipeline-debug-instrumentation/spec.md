## MODIFIED Requirements

### Requirement: Chart load diagnostics cover heavy IO and render mutations

Pipeline debug instrumentation SHALL record timing and decision markers for Workbench Chart heavy IO and imperative render mutations.

Instrumentation MUST cover:

- `api.fetchCandlesWindow` and `api.fetchEmaWindow` (per period) and legacy `api.fetchChartMarketBundle`
- Split planner decisions for candles vs EMA (`wb.market_candles_decision`, `wb.market_ema_decision`, or equivalent with `resourceKind`)
- Readiness transitions: `marketCandlesReady`, `marketOverlaysReady`
- Trace fetch, display cache coverage, candle/EMA `setData`, marker `setMarkers`

#### Scenario: Cold chart open produces split-resource baseline events

- **GIVEN** Workbench loads a run and user opens Chart with pipeline debug enabled
- **WHEN** windowed cold load runs
- **THEN** debug output includes `api.fetchCandlesWindow` timing before or without waiting for all EMA fetches
- **AND** debug output includes one or more `api.fetchEmaWindow` entries per anchor period
- **AND** debug output records candle `setData` before final overlay `setData` when overlays are slower

## ADDED Requirements

### Requirement: Split window fetches SHALL be timed per resource

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, pipeline debug instrumentation SHALL record:

- `api.fetchCandlesWindow` MUST be recorded via `dbgTimed` with `barCount` and display bounds
- `api.fetchEmaWindow` MUST be recorded via `dbgTimed` with `period`, `barCount` (point count), `cacheHit` when available from response coverage

Legacy `api.fetchChartMarketBundle` timing MUST remain for fallback path.

#### Scenario: Cold open uses candles-window without chart-bundle

- **GIVEN** windowed cold load active and debug enabled
- **WHEN** Chart cold open completes
- **THEN** `api.fetchCandlesWindow` count is at least 1
- **AND** `api.fetchChartMarketBundle` count is 0
- **AND** `api.fetchEmaWindow` count equals the number of required anchor-stack periods with cache miss

### Requirement: Split planner decisions are visible in pipeline debug

When debug enabled, Workbench MUST emit resource-specific decision marks with at least:

- `resourceKind` (`candles` | `ema`)
- `decisionReason` (`cache_hit`, `cache_miss`, `in_flight_skip`, `fetch`, `stale_response`, `abort`)
- `displayFromMs` / `displayToMs`
- `period` for EMA decisions
- `cacheCoverage` (`hit` | `miss`)
- `fetchKey`

#### Scenario: Candle cache hit skips candles-window

- **GIVEN** candle intervals cover target bounds
- **WHEN** planner evaluates candles
- **THEN** `wb.market_candles_decision` shows `cache_hit`
- **AND** no `api.fetchCandlesWindow` entry for that invocation

#### Scenario: EMA cache miss per period

- **GIVEN** candles covered but `EMA(200)` overlay interval missing
- **WHEN** planner evaluates overlays
- **THEN** `wb.market_ema_decision` for period 200 shows `cache_miss` then `fetch`
- **AND** other covered periods show `cache_hit`

### Requirement: Perf comparison report includes split-resource metrics

Phase 7 verification MUST compare monolithic `chart-bundle` baseline vs split-resource cold open:

- Time to `marketCandlesReady` (candles visible)
- Time to `marketOverlaysReady` (all anchor EMA visible)
- Payload sizes: candles-window vs sum of ema-window responses vs chart-bundle
- Bar/point counts per resource

#### Scenario: Comparison documents candles-first improvement

- **WHEN** migration verification is reported
- **THEN** report includes time-to-first-candle-render vs time-to-all-overlays
- **AND** report includes per-resource payload breakdown
- **AND** report states EMA value consistency vs chart-bundle baseline
