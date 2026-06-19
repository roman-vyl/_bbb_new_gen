# pipeline-debug-instrumentation Specification (delta)

## ADDED Requirements

### Requirement: Chart-events fetch and fallback are observable in pipeline debug

When frontend pipeline debug is enabled, Workbench MUST emit distinguishable events for chart-events display fetches and fallbacks. Chart-events failures MUST NOT be silently swallowed when fallback to signal-trace occurs.

Required debug event names:

- `wb.chart_events_fetch_fail` — includes HTTP status or error detail, run id, and display request key
- `wb.chart_events_fallback` — includes reason enum: `endpoint_404`, `http_error`, `flag_disabled`, `parse_error`
- `wb.chart_events_merge` — parallel to `wb.signal_trace_merge`; includes `source: "chart-events" | "signal-trace-fallback"`, truncation, requested vs actual bounds

#### Scenario: Chart-events HTTP error triggers observable fallback

- **GIVEN** `VITE_CHART_EVENTS_API=1` and pipeline debug enabled
- **AND** chart-events returns HTTP 500 for a display chunk request
- **WHEN** Workbench applies fallback policy and loads display data from signal-trace
- **THEN** debug log includes `wb.chart_events_fetch_fail` with status 500
- **AND** debug log includes `wb.chart_events_fallback` with reason `http_error`
- **AND** debug log includes `wb.chart_events_merge` with `source: "signal-trace-fallback"`

#### Scenario: Flag disabled emits fallback reason once per session

- **GIVEN** `VITE_CHART_EVENTS_API` is not enabled
- **AND** pipeline debug enabled
- **WHEN** Workbench uses signal-trace for display fetch
- **THEN** debug log includes `wb.chart_events_fallback` with reason `flag_disabled` at most once per browser session

#### Scenario: Successful chart-events merge is distinguishable

- **GIVEN** chart-events returns a valid bundle
- **AND** pipeline debug enabled
- **WHEN** display cache merges the chunk
- **THEN** debug log includes `wb.chart_events_merge` with `source: "chart-events"`

### Requirement: Chart-events debug imposes no work when debug is disabled

Chart-events debug marks MUST follow the same zero-overhead-when-disabled rule as existing pipeline debug helpers.

#### Scenario: Debug off skips chart-events marks

- **GIVEN** frontend pipeline debug is disabled
- **WHEN** chart-events fetch and merge run
- **THEN** no chart-events debug string formatting or console output occurs
