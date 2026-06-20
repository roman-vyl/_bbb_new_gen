## MODIFIED Requirements

### Requirement: Chart load diagnostics cover heavy IO and render mutations

Pipeline debug instrumentation SHALL record timing and decision markers for Workbench Chart heavy IO and imperative render mutations.

Instrumentation MUST cover market fetch start/end/cache hit (including `api.fetchChartWindow` and legacy `api.fetchChartMarketBundle`), market window planner decisions (`cache_hit`, `cache_miss`, `in_flight_skip`), trace fetch start/end/cache hit/cache miss, display cache `coversRange` and `missingRange` results, candle/EMA `setData`, marker `setMarkers`, and duplicate or superseded trace request decisions.

#### Scenario: Cold chart open produces baseline events

- **GIVEN** Workbench loads a run report and the user opens Chart for the first time
- **WHEN** market and trace requests run
- **THEN** debug output includes market fetch start/end or cache hit
- **AND** debug output includes `api.fetchChartWindow` timing when windowed cold load is active
- **AND** debug output includes trace fetch start/end or cache hit/miss
- **AND** debug output includes chart `setData` and marker `setMarkers` timings

#### Scenario: Duplicate trace request is observable

- **GIVEN** trace scheduling evaluates a request whose identity is already in flight or already merged
- **WHEN** the coordinator skips the request
- **THEN** debug output records the trace request key
- **AND** debug output records whether the skip was duplicate, cache hit, in-flight, merged, failed, or superseded

## ADDED Requirements

### Requirement: Chart-window fetch is timed and attributed separately from chart-bundle

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, Workbench MUST record `api.fetchChartWindow` via `dbgTimed` with metadata including display bounds, bar count, overlay count, and estimated payload size.

Legacy `api.fetchChartMarketBundle` timing MUST remain when the fallback path is used.

#### Scenario: Cold open uses chart-window timing

- **GIVEN** pipeline debug enabled and windowed cold load active
- **WHEN** Chart cold open completes market load
- **THEN** console includes `[pipeline] api.fetchChartWindow` with duration
- **AND** metadata includes `barCount` for display window only
- **AND** `api.fetchChartMarketBundle` count is zero for that cold open

#### Scenario: Legacy fallback still timed

- **GIVEN** pipeline debug enabled and full-range chart-bundle fallback is invoked
- **WHEN** the fetch completes
- **THEN** console includes `[pipeline] api.fetchChartMarketBundle` with duration
- **AND** metadata includes full-range `barCount`

### Requirement: Market window planner decisions are visible in pipeline debug

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, Workbench MUST emit `wb.market_window_decision` marks with at least:

- `decisionReason` (`cache_hit`, `cache_miss`, `in_flight_skip`, `fetch`, `stale_response`, `abort`)
- `displayFromMs` / `displayToMs`
- `missingFromMs` / `missingToMs` when applicable
- `cacheCoverage` (`hit` | `miss`)
- `fetchKey`
- `barCount` and `overlayCount` on fetch end

#### Scenario: Cache miss triggers observable fetch decision

- **GIVEN** debug enabled and target display window is not covered by cache
- **WHEN** market window planner schedules a fetch
- **THEN** `wb.market_window_decision` shows `decisionReason` `cache_miss` then `fetch`
- **AND** subsequent `wb.market_window_decision` or fetch-end mark includes `barCount`

#### Scenario: Cache hit skips network

- **GIVEN** debug enabled and cache fully covers target display window
- **WHEN** planner runs
- **THEN** `wb.market_window_decision` shows `decisionReason` `cache_hit`
- **AND** no `api.fetchChartWindow` entry appears for that planner invocation

### Requirement: Perf comparison report includes old vs new market load metrics

Phase 6 verification MUST capture side-by-side metrics for the same run: full-range `chart-bundle` baseline vs windowed `chart-window` cold open (duration, payload size estimate, candles count, EMA points count, rendered window size).

#### Scenario: Comparison report documents improvement

- **WHEN** migration verification is reported
- **THEN** the report includes cold-open duration for chart-bundle baseline and chart-window implementation
- **AND** the report includes display-window bar count vs full-range bar count
- **AND** the report states whether EMA overlay display regressed
