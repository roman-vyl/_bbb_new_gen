# research-api-chart-events Specification (delta)

## Purpose

Lightweight BFF product for Workbench Chart **display**: sparse component events, HTF EMA overlay series, bar grid, and coverage metadata. Dense per-bar diagnostics remain on `/signal-trace`.

## ADDED Requirements

### Requirement: Chart-events endpoint returns sparse display bundle

The BFF SHALL expose `GET /api/research/runs/{run_id}/chart-events` for `ema_pullback` runs.

The response MUST be a `ChartEventsBundle` containing:

- `times` — Unix seconds per bar (aligned with chart candles)
- `component_events` — same schema as signal-trace `ComponentEvent`
- `htf_context` — `ChartEventsHtfContext` with `fast`, `anchor`, `slow`, `meta` only (no `state`)
- `meta` — `SignalTraceMeta` for marker formatters
- `coverage` — span metadata including `schema_version`, actual bounds, truncation flag

The response MUST NOT include `long`, `short`, `context_consumption_trace`, or per-bar `internals`.

#### Scenario: Sparse response excludes dense trace fields

- **GIVEN** a valid chart-events request for an `ema_pullback` run variant
- **WHEN** the BFF returns `ChartEventsBundle`
- **THEN** the JSON body has no `long`, `short`, or `context_consumption_trace` keys
- **AND** `htf_context` has no `state` field

#### Scenario: Display fields match signal-trace projection for same window

- **GIVEN** the same run, variant, window, and `context_overlay_ref`
- **WHEN** chart-events and signal-trace are requested for that window
- **THEN** `times`, `component_events`, and `htf_context.{fast,anchor,slow,meta}` equal the signal-trace values for the same slice

### Requirement: Chart-events query params match signal-trace window semantics

Chart-events MUST accept the same query parameters as signal-trace:

- `variant` (required)
- `from` (required, milliseconds)
- exactly one of `to` (exclusive end ms) OR `to_open_time_ms` (last bar open ms)
- optional `context_overlay_ref`

Window resolution MUST use `resolve_exclusive_to_ms` and `parse_time_range_ms` — parity with signal-trace and market bundle endpoints.

#### Scenario: to_open_time_ms exclusive end includes last bar

- **GIVEN** render window with last candle open time `T_last_ms` at timeframe `5m`
- **WHEN** chart-events is requested with `from=T_first_ms` and `to_open_time_ms=T_last_ms`
- **THEN** `times[-1]` equals `T_last_ms / 1000` (seconds)
- **AND** OHLCV load uses the same exclusive end as market bundle for that window

#### Scenario: Both to and to_open_time_ms returns 422

- **GIVEN** a chart-events request includes both `to` and `to_open_time_ms`
- **WHEN** the BFF handles the request
- **THEN** HTTP 422 is returned with detail indicating mutual exclusion
- **AND** no chart-events cache entry is written

#### Scenario: Neither to nor to_open_time_ms returns 400

- **GIVEN** a chart-events request omits both `to` and `to_open_time_ms`
- **WHEN** the BFF handles the request
- **THEN** HTTP 400 is returned

### Requirement: Chart-events HTTP errors mirror signal-trace

For the same `run_id`, `variant`, and window query parameters, chart-events MUST return the **same HTTP status code** and semantically equivalent error `detail` as signal-trace. Invalid or conflicting window params, unsupported family, missing run/variant, and market-not-found cases MUST NOT diverge between the two endpoints.

Implementation note (Phase 4): reuse the same router exception mapping as `get_signal_trace`; do not introduce chart-events-specific status codes for equivalent failures.

#### Scenario: Invalid window params match signal-trace status

- **GIVEN** a request with both `to` and `to_open_time_ms` set
- **WHEN** chart-events and signal-trace are called with identical query params
- **THEN** both endpoints return the same HTTP status code
- **AND** both return detail indicating mutual exclusion of `to` and `to_open_time_ms`

#### Scenario: Missing run matches signal-trace 404

- **GIVEN** an unknown `run_id`
- **WHEN** chart-events and signal-trace are called with otherwise valid params
- **THEN** both endpoints return HTTP 404

### Requirement: Chart-events coverage metadata describes actual returned span

`coverage` MUST include:

- `schema_version` — matches `CHART_EVENTS_BUNDLE_SCHEMA_VERSION`
- `from_sec`, `to_sec` — from actual `times[0]` and `times[-1]` when non-empty
- `bar_count` — `len(times)`
- `requested_from_sec`, `requested_to_sec` — from resolved request window
- `truncated` — true when tail-cap removed bars beyond `max_bars`
- `max_bars` — cap applied (default 50_000)

#### Scenario: Truncated window sets coverage.truncated

- **GIVEN** requested window exceeds `max_bars` bars
- **WHEN** chart-events returns a tail-capped slice
- **THEN** `coverage.truncated` is true
- **AND** `coverage.bar_count` equals `max_bars`
- **AND** `coverage.to_sec` reflects the last returned bar, not the full requested end

### Requirement: Chart-events cache-on-demand with versioned keys

The BFF SHALL maintain `_CHART_EVENTS_CACHE` separate from `_TRACE_CACHE`.

Cache key format:

```text
{schema_version}:{run_id}:{variant}:{from_ms}:{exclusive_end_ms}:{context_overlay_ref_or_empty}
```

On cache miss, the service MAY compute via existing signal-trace pipeline and project to `ChartEventsBundle`. On cache hit, the service MUST return the cached bundle without recomputing.

Eviction: FIFO, max 32 entries (match signal-trace).

#### Scenario: Cache key includes schema version and context ref

- **GIVEN** cache key helper is called with schema version 1, run `R`, variant `V`, bounds, and `context_overlay_ref=htf_1`
- **WHEN** the key is formatted
- **THEN** the key starts with `1:`
- **AND** the key ends with `:htf_1`
- **AND** a request with `context_overlay_ref=""` produces a different key

#### Scenario: Schema version bump ignores old cache entries

- **GIVEN** `CHART_EVENTS_BUNDLE_SCHEMA_VERSION` is 2
- **AND** a v1-format key exists in cache from a prior deployment
- **WHEN** an identical window is requested under version 2
- **THEN** the service treats it as cache miss
- **AND** recomputes and stores under a version-2 key

#### Scenario: Duplicate GET does not recompute

- **GIVEN** chart-events was fetched once for a window key
- **WHEN** an identical chart-events GET is issued
- **THEN** the internal trace compute function is invoked at most once across both requests
- **AND** both responses have equal `times`, `component_events`, and `htf_context` values

### Requirement: Chart-events htf_context excludes regime state

`ChartEventsHtfContext` MUST NOT include per-bar HTF regime `state`. Regime for bar inspector remains available only from dense `/signal-trace`.

Spec language: **Regime/state series is diagnostics-only; chart-events does not supply per-bar HTF regime for bar inspector.**

#### Scenario: No state field in chart-events response

- **GIVEN** chart-events requested with valid `context_overlay_ref`
- **WHEN** the response is serialized
- **THEN** `htf_context` contains `fast`, `anchor`, `slow`, and `meta`
- **AND** `htf_context.state` is absent

### Requirement: Signal trace endpoint remains unchanged

This capability MUST NOT modify `/signal-trace` route, response schema, or existing test expectations.

#### Scenario: Signal trace consumers unaffected

- **GIVEN** chart-events is deployed
- **WHEN** existing signal-trace pytest suite runs
- **THEN** all tests pass without modification to signal-trace contracts
