## ADDED Requirements

### Requirement: Signal trace coordinator decisions are visible in pipeline debug

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, Workbench SHALL emit **`wb.signal_trace_decision`** and **`wb.signal_trace.fetch_start`** (or equivalent fetch-start mark) with metadata sufficient to prove coordinator ownership and multi-instance behavior.

Each decision mark MUST include at least:

- `traceRequestKey`
- `decisionReason` (`fetch`, `cache_hit`, `in_flight`, `already_merged`, `failed_same_key`, `superseded`, or policy gate reason when blocked before coordinator)
- `skipReason` when action is skip
- `cacheCoverage` (`hit` | `miss`) from synchronous `coversRange` read
- `requestedFrom` / `requestedTo` (committed ms or sec bounds used for fetch)
- `coverageFrom` / `coverageTo` when available from display cache
- `inFlightKey` or `inFlightKeysCount`
- `mergedKeysHit` (`true` | `false`)
- `failedKeysHit` (`true` | `false`)
- `effectTriggerReason` when known (primitive dep label)
- `selectedStrategyInstanceId` **only** as display meta, documented as not part of `traceRequestKey` unless BFF uses it as query param

#### Scenario: After merge next decision is already_merged

- **GIVEN** debug enabled and first fetch for `K1` merged successfully
- **WHEN** the operator flushes pipeline debug after the orchestration effect runs again with same fetch parameters
- **THEN** the latest `wb.signal_trace_decision` for `K1` shows `decisionReason` `already_merged` or `cache_hit`
- **AND** `api.fetchSignalTrace` count for `K1` is at most 1

#### Scenario: Second instance same key shows coordinator skip

- **GIVEN** debug enabled and fetch for `K1` already merged
- **WHEN** user switches strategy instance without changing fetch parameters
- **THEN** `wb.signal_trace_decision` shows skip with `already_merged` or `cache_hit`
- **AND** `selectedStrategyInstanceId` in meta differs from prior mark while `traceRequestKey` is unchanged
- **AND** no new `api.fetchSignalTrace` row appears for `K1`

## MODIFIED Requirements

### Requirement: Frontend pipeline debug traces Workbench network and load policy

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, the Workbench SHALL record timings for backtest and primary GET helpers, SHALL log signal-trace **coordinator and policy gate** decisions separately, and SHALL record in-browser Workbench and Chart pipeline timings as specified in the added requirements for load, trade select, pan, display cache, and chart updates.

#### Scenario: API backtest is timed

- **WHEN** the user runs backtest from Composer with debug enabled
- **THEN** the browser console includes a `[pipeline] api.runBacktest` entry with duration metadata

#### Scenario: Signal trace skip is visible

- **WHEN** signal trace load is skipped because coordinator reports `already_merged` for the current `traceRequestKey`
- **THEN** the console includes `wb.signal_trace_decision` with `decisionReason` equal to `already_merged` (or `cache_hit` / `in_flight`)
- **AND** no new timed `api.fetchSignalTrace` entry starts for that key

#### Scenario: Developer can flush browser summary

- **WHEN** debug is enabled and `window.__pipelineDebugFlush()` is called
- **THEN** the console prints a grouped table of accumulated frontend step counts and timings

#### Scenario: In-browser steps appear alongside API timings

- **WHEN** debug is enabled and the user completes a chart interaction that triggers render-window slicing
- **THEN** the flush table lists both `api.*` network steps (if any) and `wb.*` / `chart.*` in-browser steps in the same summary

### Requirement: Signal trace display cache hit and miss are distinguishable

When `VITE_EMA_PIPELINE_DEBUG` is `"true"`, signal-trace display-cache usage SHALL emit debug marks or timed steps that distinguish display cache covers current render window (hit) versus display cache partial miss.

Network fetch authorization MUST be reflected in `wb.signal_trace_decision` coordinator fields, not inferred solely from `wb.trace_display.cache_miss`.

#### Scenario: Display cache miss without network refetch is visible

- **WHEN** display cache does not cover the full window but coordinator skips fetch with `already_merged`
- **THEN** debug may include `wb.trace_display.cache_miss`
- **AND** `wb.signal_trace_decision` shows `decisionReason` `already_merged`
- **AND** `api.fetchSignalTrace` count does not increase for that `traceRequestKey`

#### Scenario: Display cache miss triggers fetch and merge

- **WHEN** the render window is not covered and coordinator authorizes `fetch`
- **THEN** debug output includes cache-miss visibility, `wb.signal_trace.fetch_start` with `traceRequestKey`, `wb.trace_display.merge_chunk` timing, and slice timings for events and HTF context for the active window
