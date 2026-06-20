# research-api-market-candles-window Specification

## Purpose

Windowed OHLC candles with coverage metadata for Workbench cold load and pan-prefetch. Returns display-window bars only — no bundled EMA.
## Requirements
### Requirement: Candles-window endpoint returns display candles only

The research_api BFF SHALL expose `GET /api/market/candles-window` that accepts a display window (`from_ms`, `to_ms` or `to_open_time_ms`) plus `symbol` and `timeframe`.

The endpoint MUST return **candles only** for the requested window — no EMA overlays, no warmup bars outside the window.

#### Scenario: Response contains only requested window candles

- **GIVEN** a seeded market database with candles spanning 600 000 bars
- **WHEN** client requests `candles-window` for a 50 000-bar tail window
- **THEN** response `candles.length` is at most the requested window bar count
- **AND** response does not include `ema_overlays` or indicator points
- **AND** every returned candle open time is within the resolved half-open window

#### Scenario: Window end resolution matches existing market API parity

- **GIVEN** `to_open_time_ms` equal to the last candle open time in the requested window
- **WHEN** `candles-window` is called with that param
- **THEN** returned candles include that last bar
- **AND** exclusive end equals `to_open_time_ms + timeframe_ms(timeframe)`

### Requirement: Candles-window response includes coverage metadata

The `CandlesWindowBundle` response MUST include a `coverage` object with at least:

- `requested_from_ms` / `requested_to_ms`
- `actual_from_ms` / `actual_to_ms` (may differ when DB lacks edge bars)
- `truncated` boolean when requested bounds could not be fully satisfied

#### Scenario: Truncation at data edge

- **GIVEN** requested `from_ms` precedes the earliest candle in the database
- **WHEN** `candles-window` is requested
- **THEN** `coverage.truncated` is `true`
- **AND** `coverage.actual_from_ms` reflects the earliest available bar open time
- **AND** `coverage.actual_to_ms` reflects the exclusive end of returned bars
- **AND** returned `candles` contain only available overlapping bars

#### Scenario: Requested window fully beyond available data

- **GIVEN** requested `[from_ms, to_ms)` has no overlap with any candle in the database
- **WHEN** `candles-window` is requested
- **THEN** `coverage.truncated` is `true`
- **AND** `candles` is an empty array
- **AND** `coverage.actual_from_ms` equals `coverage.actual_to_ms` (empty half-open interval)
- **AND** `coverage.requested_from_ms` and `coverage.requested_to_ms` still echo the client request

### Requirement: Candles-window service reports honest coverage at data edges

When the requested window is partially or fully outside available market data, `fetch_candles_window` MUST set `coverage.actual_from_ms`, `coverage.actual_to_ms`, and `coverage.truncated` to reflect the **returned** candle set — not the requested bounds.

When there is no overlap with available data, the service MUST return `candles=[]`, `truncated=true`, and `actual_from_ms == actual_to_ms`.

#### Scenario: Partial overlap clips actual bounds

- **GIVEN** database candles cover `[D0, D1)` and request is `[A, B)` where `A < D0 < B`
- **WHEN** `fetch_candles_window` runs
- **THEN** `truncated` is `true`
- **AND** `actual_from_ms` is `D0`
- **AND** returned candles are only those in the overlapping sub-window

### Requirement: Candles-window errors match existing market endpoints

For missing SQLite database, invalid timeframe, and conflicting `to` / `to_open_time_ms` params, `candles-window` MUST return the same HTTP status codes and error shapes as `/api/market/candles` and `/api/market/chart-bundle`.

#### Scenario: Missing database returns 503

- **GIVEN** the configured market database file does not exist
- **WHEN** `candles-window` is requested
- **THEN** BFF returns HTTP 503 with `market database not found` detail

