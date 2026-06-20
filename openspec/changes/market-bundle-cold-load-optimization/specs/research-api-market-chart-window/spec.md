## ADDED Requirements

### Requirement: Chart-window endpoint returns display-only candles and EMA overlays

The research_api BFF SHALL expose `GET /api/market/chart-window` that accepts a **display window** (`display_from`, `display_to` or `display_to_open_time_ms`) plus anchor-stack EMA periods (`ema_fast`, `ema_anchor`, `ema_slow`).

The endpoint MUST read candles from SQLite for an extended range `[warmup_from_ms, display_to_ms)` but MUST return:

- `candles`: only bars whose open time falls within the display window
- `ema_overlays`: only indicator points within the display window, each with `kind: chart_overlay_ema`

The endpoint MUST NOT require or return the full report/run range.

#### Scenario: Response contains only display window bars

- **GIVEN** a seeded market database with candles spanning 100 000 bars
- **WHEN** client requests `chart-window` with a display window of 50 000 bars near the report tail
- **THEN** response `candles.length` is at most the display window bar count
- **AND** every returned candle open time is within `[display_from_ms, display_to_ms)`

#### Scenario: Invalid anchor stack order is rejected

- **GIVEN** `ema_fast >= ema_anchor` or `ema_anchor >= ema_slow`
- **WHEN** client requests `chart-window`
- **THEN** BFF returns HTTP 400 with a clear validation error

### Requirement: EMA overlays are computed with mandatory warmup before display from

The BFF MUST compute anchor-stack EMA from candle closes over `[warmup_from_ms, display_to_ms)` where `warmup_from_ms` is derived from `display_from_ms` minus at least `max(ema_slow) + 5` bars (or an explicit `warmup_bars` query override), clamped to `0`.

EMA points returned MUST be filtered to the display window only. Warmup bars MUST NOT appear in the response payload.

#### Scenario: Windowed EMA matches full-range EMA at display start

- **GIVEN** a contiguous candle series in the database
- **AND** a display window `[D_from, D_to)` fully inside the series
- **WHEN** `chart-window` is called for that display window
- **AND** full-range `chart-bundle` is called for `[report.from, report.to)` covering the same data
- **THEN** the first EMA point at `D_from` from `chart-window` matches the corresponding EMA point from `chart-bundle` within floating-point tolerance

#### Scenario: Warmup metadata is reported

- **GIVEN** a valid chart-window request with default warmup policy
- **WHEN** the response is returned
- **THEN** `coverage.warmup_from_ms` is less than or equal to `coverage.requested_display_from_ms`
- **AND** `coverage.warmup_bars_used` is a positive integer

### Requirement: Coverage metadata describes requested vs actual bounds

The `ChartMarketWindowBundle` response MUST include a `coverage` object with at least:

- `requested_display_from_ms` / `requested_display_to_ms`
- `actual_display_from_ms` / `actual_display_to_ms` (may differ when DB lacks edge bars)
- `warmup_from_ms` and `warmup_bars_used`
- `truncated` boolean when requested display bounds could not be fully satisfied

#### Scenario: Truncation at data edge

- **GIVEN** display `from` precedes the earliest candle in the database
- **WHEN** `chart-window` is requested
- **THEN** `coverage.truncated` is `true`
- **AND** `coverage.actual_display_from_ms` reflects the earliest available bar
- **AND** returned candles start at the earliest available bar

### Requirement: Window end resolution matches existing market API parity

`display_to` resolution MUST use `resolve_exclusive_to_ms` and half-open `TimeWindow` semantics — parity with `/api/market/chart-bundle`, `/api/market/candles`, and signal-trace window resolution.

#### Scenario: display_to_open_time_ms includes last bar

- **GIVEN** `display_to_open_time_ms` equal to the last candle open time in the requested display window
- **WHEN** `chart-window` is called with that param
- **THEN** returned candles include that last bar
- **AND** exclusive end equals `display_to_open_time_ms + timeframe_ms(timeframe)`

### Requirement: Market-not-found and param errors match chart-bundle behavior

For missing SQLite database, invalid timeframe, and conflicting `display_to` / `display_to_open_time_ms` params, `chart-window` MUST return the same HTTP status codes and error shapes as existing `/api/market/chart-bundle`.

#### Scenario: Missing database returns 503

- **GIVEN** the configured market database file does not exist
- **WHEN** `chart-window` is requested
- **THEN** BFF returns HTTP 503 with `market database not found` detail
