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
- **WHEN** client requests `ema-window` with `period=500` for a 50 000-bar tail window
- **THEN** response contains only EMA points within the resolved display window
- **AND** response does not include candles
- **AND** at most one overlay period is returned per request

### Requirement: EMA values are canonical full-series consistent

EMA points MUST be consistent with a **canonical full-series** `EMA(period)` computed from candle closes starting at `calculation_origin_ms` — not seeded from the display-window first bar.

On the first request for a given `(symbol, timeframe, period, origin_policy=canonical)` identity, the BFF MUST:

1. Read candles from `calculation_origin_ms` through the data required to cover the requested window
2. Compute the full canonical EMA series once
3. Store the series in an in-memory backend cache
4. Return only the requested window slice

On subsequent requests for the same canonical identity, the BFF MUST slice from the cached series and MUST NOT recompute from display-window start.

The frontend MUST NOT receive warmup bars or perform EMA computation.

#### Scenario: First request computes and caches canonical series

- **GIVEN** no prior canonical EMA cache entry for `BTCUSDT/5m/period=500`
- **WHEN** `ema-window` is requested for a tail display window
- **THEN** BFF computes full canonical `EMA(500)` from `calculation_origin_ms`
- **AND** response includes `coverage.cache_hit` (or equivalent) indicating a fresh computation
- **AND** returned window points match the tail slice of that canonical series

#### Scenario: Second window request slices cached series

- **GIVEN** canonical `EMA(500)` series already cached for `BTCUSDT/5m`
- **WHEN** `ema-window` is requested for a different display window within the same symbol/timeframe/period
- **THEN** BFF returns the slice from the cached series
- **AND** `coverage.cache_hit` indicates cache reuse
- **AND** overlapping window points are identical to the prior response for the same bar times

#### Scenario: Window EMA matches full-range chart-bundle EMA at same bars

- **GIVEN** a contiguous candle series in the database
- **AND** full-range `chart-bundle` EMA for `period=P` at bar time `T` inside a display window
- **WHEN** `ema-window` with `origin_policy=canonical` is called for a window containing `T`
- **THEN** the EMA value at `T` matches the chart-bundle value within floating-point tolerance

### Requirement: EMA-window response includes coverage and calculation metadata

The `EmaWindowBundle` response MUST include a `coverage` object with at least:

- `requested_from_ms` / `requested_to_ms`
- `actual_from_ms` / `actual_to_ms`
- `calculation_origin_ms` (canonical series start)
- `cache_hit` boolean (backend canonical series cache hit vs fresh compute)
- `truncated` when requested bounds exceed available data

`cache_hit` and `calculation_origin_ms` MAY be omitted from production responses when pipeline debug is disabled, but MUST be available in contract tests and debug mode.

#### Scenario: Calculation origin precedes display window

- **GIVEN** display window `[D_from, D_to)` not at dataset start
- **WHEN** first `ema-window` request for `period=200` with `origin_policy=canonical`
- **THEN** `coverage.calculation_origin_ms` is less than or equal to `D_from`
- **AND** first returned EMA point at `D_from` is not window-local seeded from `close(D_from)` alone

### Requirement: EMA-window errors match existing market endpoints

For missing database, invalid period, and conflicting window params, `ema-window` MUST return the same HTTP status patterns as existing `/api/market/indicators/ema`.

#### Scenario: Invalid period is rejected

- **GIVEN** `period=0`
- **WHEN** `ema-window` is requested
- **THEN** BFF returns HTTP 400
