## ADDED Requirements

### Requirement: Signal trace coordinator decision metadata in pipeline debug

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, Workbench SHALL include the following fields on **`wb.signal_trace_decision`** marks (and on fetch-start marks when a fetch is authorized):

- `traceRequestKey` — deterministic key matching factual BFF query params (`from`, `to_open_time_ms`, `variant`, `context_overlay_ref`, run id)
- `decisionReason` — high-level outcome (`fetch`, `skip`, `restore_session`, etc.)
- `cacheCoverage` — `"hit"` or `"miss"` for display cache vs committed window
- `coverageFrom` / `coverageTo` — display cache coverage bounds in seconds when known
- `requestedFrom` / `requestedTo` — committed window bounds requested for trace (seconds)
- `inFlightKey` — `traceRequestKey` currently in flight, or null
- `lastMergedKey` — most recently merged `traceRequestKey`, or null
- `skipReason` — when skipping fetch: `in_flight`, `cache_hit`, `already_merged`, `failed_same_key`, `superseded` (coordinator only; not policy dedupe actions)
- `effectTriggerReason` — why the orchestration effect ran (e.g. committed window revision, market ready, variant change)

#### Scenario: Skip after merge shows already_merged

- **GIVEN** debug enabled and a truncated trace response was merged for `traceRequestKey` `K1`
- **WHEN** the signal-trace orchestration effect evaluates again with the same `K1`
- **THEN** `wb.signal_trace_decision` includes `skipReason` `already_merged` and `traceRequestKey` `K1`
- **AND** no new `api.fetchSignalTrace` timed entry appears for `K1`

#### Scenario: In-flight skip is visible

- **GIVEN** `fetchSignalTrace` for `K1` is in progress
- **WHEN** orchestration evaluates again for `K1`
- **THEN** `wb.signal_trace_decision` includes `skipReason` `in_flight` and `inFlightKey` `K1`

#### Scenario: One backtest click produces bounded fetch count in flush table

- **GIVEN** debug enabled and the user completes one backtest then waits for chart load
- **WHEN** `window.__pipelineDebugFlush("workbench-after-signal-trace")` runs
- **THEN** `api.fetchSignalTrace` count is at most **1** per distinct `traceRequestKey` in `last_meta`
- **AND** `wb.trace_display.cache_miss` and `wb.trace_display.merge_chunk` do not repeat hundreds of times for the same key

## MODIFIED Requirements

### Requirement: Frontend pipeline debug traces Workbench network and load policy

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, the Workbench SHALL record timings for backtest and primary GET helpers, SHALL log signal-trace load policy decisions **including coordinator fields** (`traceRequestKey`, `skipReason`, coverage vs requested bounds), and SHALL record in-browser Workbench and Chart pipeline timings as specified in the added requirements for load, trade select, pan, display cache, and chart updates.

#### Scenario: Signal trace skip is visible

- **WHEN** signal trace load is skipped by the coordinator (display cache covers window, in flight, or key already merged)
- **THEN** the console includes `wb.signal_trace_decision` with `decisionReason` / `skipReason` from the coordinator (`cache_hit`, `in_flight`, `already_merged`, `superseded`)
- **AND** skip reasons are not attributed to `decideSignalTraceLoad` network-dedupe actions (those branches removed)

#### Scenario: Developer can flush browser summary

- **WHEN** debug is enabled and `window.__pipelineDebugFlush()` is called
- **THEN** the console prints a grouped table of accumulated frontend step counts and timings

#### Scenario: In-browser steps appear alongside API timings

- **WHEN** debug is enabled and the user completes a chart interaction that triggers render-window slicing
- **THEN** the flush table lists both `api.*` network steps (if any) and `wb.*` / `chart.*` in-browser steps in the same summary
