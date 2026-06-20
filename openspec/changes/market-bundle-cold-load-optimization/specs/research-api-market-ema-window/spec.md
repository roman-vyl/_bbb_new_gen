## ADDED Requirements

### Requirement: EMA-window endpoint returns display EMA points only

The research_api BFF SHALL expose `GET /api/market/ema-window` that accepts:

- `symbol`, `timeframe`
- `period` (single EMA period per request)
- `from_ms`, `to_ms` or `to_open_time_ms` (requested display window)
- `origin_policy=canonical` (required in v1 for chart overlay EMA)

The endpoint MUST return **EMA indicator points only** for the requested window — no candles, no bundled overlays.

Each point MUST have `kind: chart_overlay_ema`.

#### Scenario: Response contains only requested window EMA points

- **GIVEN** a seeded market database with a long candle history
- **WHEN** client requests `ema-window` with `period=500` for a 50 000-bar tail window
- **THEN** response contains only EMA points within the resolved display window
- **AND** response does not include candles
- **AND** at most one overlay period is returned per request

### Requirement: Canonical EMA cache entry is extendable and keyed by market data identity

The backend canonical EMA cache MUST store per entry:

- `calculation_origin_ms` — earliest candle open used to seed the series
- `coverage_to_ms` (or `computed_to_ms`) — extent through which EMA points are materialized
- `points` — sorted `IndicatorPoint[]` covering `[calculation_origin_ms, coverage_to_ms)`

Cache key MUST include market data identity (symbol, timeframe, period, `origin_policy`, and a documented market-data revision token such as DB path/mtime) so entries invalidate on market DB refresh.

On **first request** (cache miss) for a key, the BFF MUST compute EMA from `calculation_origin_ms` through at least `requested_to_ms`, store the entry, and return only the requested window slice.

On a **later request** whose `requested_to_ms` exceeds `coverage_to_ms`, the BFF MUST **extend** the cached series from the last computed EMA state and appended candles — NOT recompute from the display-window start.

On a **later request** within `coverage_to_ms`, the BFF MUST slice cached points only.

The frontend MUST NOT receive warmup bars or perform EMA computation.

#### Scenario: First request computes from origin through requested_to

- **GIVEN** no canonical EMA cache entry for `BTCUSDT/5m/period=500`
- **WHEN** `ema-window` is requested for tail bounds with `requested_to_ms = T`
- **THEN** BFF computes from `calculation_origin_ms` through at least `T`
- **AND** `coverage.cache_hit` is `false`
- **AND** `coverage.coverage_to_ms` is at least `T`
- **AND** returned points are a slice of the stored series for the display window only

#### Scenario: Extension request continues from cached EMA state

- **GIVEN** cache entry for `EMA(500)` with `coverage_to_ms = T1`
- **WHEN** `ema-window` is requested with `requested_to_ms = T2` where `T2 > T1`
- **THEN** BFF extends computation from existing series terminus and new candles only
- **AND** overlapping bar times match pre-extension cached values
- **AND** response returns only the newly requested display window slice

#### Scenario: In-coverage request slices without recompute

- **GIVEN** cache entry covers through `coverage_to_ms = T2`
- **WHEN** `ema-window` is requested for a window within `[origin, T2)`
- **THEN** `coverage.cache_hit` is `true`
- **AND** returned points match the cached series slice

#### Scenario: Window EMA matches full-range chart-bundle EMA at same bars

- **GIVEN** a contiguous candle series in the database
- **AND** full-range `chart-bundle` EMA for `period=P` at bar time `T`
- **WHEN** `ema-window` with `origin_policy=canonical` is called for a window containing `T`
- **THEN** the EMA value at `T` matches the chart-bundle value within floating-point tolerance

### Requirement: EMA-window response always includes coverage and calculation metadata

The `EmaWindowBundle` response MUST always include a `coverage` object with at least:

- `requested_from_ms` / `requested_to_ms`
- `actual_from_ms` / `actual_to_ms`
- `calculation_origin_ms`
- `coverage_to_ms` (or `computed_to_ms`)
- `cache_hit` boolean (`true` = slice/extension from cache; `false` = fresh compute or extension compute)
- `truncated` when requested bounds exceed available data

`cache_hit` and `calculation_origin_ms` MUST NOT be debug-only in v1 — they are always present in API responses.

#### Scenario: Calculation origin precedes display window

- **GIVEN** display window `[D_from, D_to)` not at dataset start
- **WHEN** first `ema-window` request for `period=200` with `origin_policy=canonical`
- **THEN** `coverage.calculation_origin_ms` is less than or equal to `D_from`
- **AND** first returned EMA point at `D_from` is not window-local seeded from `close(D_from)` alone

#### Scenario: Market data refresh invalidates cache

- **GIVEN** a cached canonical EMA entry for symbol/timeframe/period
- **WHEN** market data identity changes (documented DB refresh)
- **THEN** subsequent `ema-window` requests miss cache and recompute from new `calculation_origin_ms`

### Requirement: EMA-window errors match existing market endpoints

For missing database, invalid period, and conflicting window params, `ema-window` MUST return the same HTTP status patterns as existing `/api/market/indicators/ema`.

#### Scenario: Invalid period is rejected

- **GIVEN** `period=0`
- **WHEN** `ema-window` is requested
- **THEN** BFF returns HTTP 400
