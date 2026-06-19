# signal-trace-request-coordinator Specification

## Purpose

Define durable, session-scoped deduplication and authorization rules for Workbench signal-trace network fetches so identical BFF resources are fetched at most once per identity generation, independent of display-only changes.

## Requirements

### Requirement: Workbench maintains a SignalTraceRequestCoordinator per chart session

The Workbench frontend SHALL construct exactly one **`SignalTraceRequestCoordinator`** per `WorkbenchProvider` (chart runtime session). The coordinator MUST survive render-window pan and strategy-instance selection changes until an explicit identity reset (run, variant, context overlay ref, session reload, or backtest rerun).

The coordinator MUST NOT be instantiated per strategy instance, per `chartWindowKey`, or per React render.

#### Scenario: Coordinator is shared across strategy instances

- **GIVEN** a run report with two strategy instances in the same variant
- **AND** both instances use the same signal-trace fetch parameters
- **WHEN** instance A triggers trace evaluation and instance B is selected before the fetch completes
- **THEN** both evaluations use the same coordinator instance
- **AND** at most one in-flight network request exists for that `traceRequestKey`

### Requirement: traceRequestKey identifies the BFF network resource

The coordinator SHALL derive **`traceRequestKey`** only from normalized parameters that are sent on `GET /api/research/runs/{run_id}/signal-trace`:

- `run_id`
- `variant`
- `from` (milliseconds, first committed candle open)
- `to_open_time_ms` (milliseconds, last committed candle open)
- `context_overlay_ref` (empty string when absent)

`traceRequestKey` MUST NOT include `selectedStrategyInstanceId`, marker display filters, `chartWindowKey`, or display-cache revision counters unless the BFF endpoint adds a matching query parameter.

#### Scenario: Instance switch does not change traceRequestKey

- **GIVEN** committed fetch parameters produce key `K1`
- **WHEN** the user changes `selectedStrategyInstanceId` without changing run, variant, committed ms bounds, or context overlay ref
- **THEN** `traceRequestKey` remains `K1`

#### Scenario: Key matches fetchSignalTrace query set

- **GIVEN** Workbench calls `fetchSignalTrace` with `fromMs`, `toOpenTimeMs`, `runId`, `variant`, and `contextOverlayRef`
- **WHEN** `buildTraceRequestKey` runs with the same normalized values
- **THEN** the key uniquely identifies the same URL resource the client requests

### Requirement: Coordinator is the sole durable network fetch authorizer

Only **`SignalTraceRequestCoordinator.evaluate`** SHALL authorize a new `api.fetchSignalTrace` for a `traceRequestKey`.

`signalTraceLoadPolicy`, `SignalTraceDisplayCache.coversRange`, `signalTraceStatus`, and WorkbenchContext local refs MUST NOT authorize durable duplicate fetches for the same `traceRequestKey`.

Coordinator decisions MUST include at least:

- `fetch` — start or continue exactly one network request for the key
- `skip` with reason `cache_hit`, `in_flight`, `already_merged`, `failed_same_key`, or `superseded`

#### Scenario: already_merged blocks identical URL after merge

- **GIVEN** a successful fetch and merge for `traceRequestKey` `K1`
- **AND** `SignalTraceDisplayCache.coversRange` is still false for the full committed window (truncated chunk)
- **WHEN** the signal-trace orchestration effect runs again with the same fetch parameters
- **THEN** `evaluate(K1)` returns `skip` with reason `already_merged`
- **AND** no second `api.fetchSignalTrace` starts for `K1`

#### Scenario: in_flight blocks concurrent duplicate

- **GIVEN** a fetch for `K1` is in flight
- **WHEN** a second evaluation requests `K1` before the first completes
- **THEN** `evaluate(K1)` returns `skip` with reason `in_flight`
- **AND** only one HTTP GET is active for `K1`

#### Scenario: failed_same_key prevents retry storm

- **GIVEN** the fetch for `K1` failed and `markFailed(K1)` was recorded
- **WHEN** the orchestration effect re-runs without changing fetch parameters or calling `reset()`
- **THEN** `evaluate(K1)` returns `skip` with reason `failed_same_key`
- **AND** no automatic retry occurs

#### Scenario: Superseded response is ignored

- **GIVEN** fetch for `K1` started at generation `G1`
- **AND** a newer generation or key supersession occurred before the response arrived
- **WHEN** the HTTP response returns
- **THEN** Workbench ignores the body for merge and coordinator state
- **AND** `evaluate` does not treat the stale response as `markMerged`

### Requirement: Coordinator reset follows identity boundaries only

`SignalTraceRequestCoordinator.reset()` MUST clear in-flight, merged, and failed ledgers when:

- selected run / report identity changes
- selected variant identity changes
- `effectiveContextOverlayRef` changes in a way that changes fetch parameters
- explicit session / trace cache reset or backtest rerun identity reset

`reset()` MUST NOT run when:

- committed render window changes by pan alone (`K1` → `K2`)
- `selectedStrategyInstanceId` changes without fetch parameter change
- display-only filters or marker layer toggles change

#### Scenario: Pan K1 K2 K1 does not refetch K1

- **GIVEN** fetch for `K1` completed and `markMerged(K1)` was called
- **WHEN** the user pans to window `K2` and back to `K1` without run/variant/context reset
- **THEN** `evaluate(K1)` returns `skip` with reason `already_merged`
- **AND** no network fetch starts for `K1`

### Requirement: Session restore registers merged state on coordinator

When Workbench restores a `SignalTraceBundle` from `SignalTraceBundleSessionCache` for a `traceRequestKey` without network I/O, it MUST call `markMerged(key, "session_restore")` before or atomically with display merge.

Subsequent `evaluate(key)` MUST skip network fetch (`already_merged` or `cache_hit`).

#### Scenario: Session hit does not refetch

- **GIVEN** session cache holds bundle for current committed fetch parameters key `K1`
- **WHEN** orchestration chooses session restore
- **THEN** `markMerged(K1, "session_restore")` runs
- **AND** no `api.fetchSignalTrace` timed entry starts for `K1`

### Requirement: Strategy instance filtering is display-only

When the signal-trace response contains events for multiple `instance_id` values, Workbench MUST filter or highlight by `selectedStrategyInstanceId` only in display / marker / lanes presentation layers after cache merge and slice.

Changing `selectedStrategyInstanceId` MUST NOT call `coordinator.reset()` and MUST NOT change `traceRequestKey` when fetch parameters are unchanged.

#### Scenario: Second instance switch reuses network result

- **GIVEN** run has instances `inst_1` and `inst_2`
- **AND** fetch for `K1` completed once
- **WHEN** user switches selected instance from `inst_1` to `inst_2` without changing fetch parameters
- **THEN** coordinator does not authorize a new fetch for `K1`
- **AND** markers or lanes may re-filter by `instance_id` without network I/O

### Requirement: Trace requests support abort and stale-response suppression

Trace request coordination SHALL support aborting superseded frontend requests and suppressing stale responses when run, variant, context overlay ref, or render-window identity changes.

Abort handling MUST be treated as frontend/network cancellation and stale-response protection only. It MUST NOT be assumed to stop CPU-bound backend trace computation.

#### Scenario: Superseded trace response is ignored

- **GIVEN** a trace request is in flight for window A
- **WHEN** the user selects a different run, variant, context overlay ref, or committed window B
- **THEN** the prior frontend request is aborted when possible
- **AND** a later response for window A is not applied to window B display state

#### Scenario: Abort is not reported as backend cancellation

- **GIVEN** a trace request is aborted on the frontend
- **WHEN** debug or review output reports the abort
- **THEN** the output identifies it as frontend stale-response protection
- **AND** it does not claim that `signal_trace_service.py` stopped CPU work

### Requirement: Coordinator distinguishes request and display chunk identity

The signal trace request coordinator SHALL distinguish `traceRequestKey` from `traceDisplayChunkKey`.

`traceRequestKey` MUST identify the real `/signal-trace` network request parameters. `traceDisplayChunkKey` MUST identify a normalized display chunk for planning/debug and MUST NOT replace `traceRequestKey` unless the same normalized bounds are actually sent in the network request.

In-flight, merged, failed, and superseded ledgers for network fetches MUST use `traceRequestKey`. Display cache coverage remains interval-based (`coversRange`, `missingRange`); `traceDisplayChunkKey` is not the cache address key in PR 4.

#### Scenario: Duplicate network request is skipped

- **GIVEN** a `/signal-trace` request with a specific `traceRequestKey` is already in flight
- **WHEN** another scheduling pass requests the same real network parameters
- **THEN** the coordinator skips the duplicate network request
- **AND** debug output records the duplicate or in-flight decision

#### Scenario: Display chunk key does not suppress different network request

- **GIVEN** two display chunks share the same normalized `traceDisplayChunkKey`
- **AND** Workbench chooses different exact `/signal-trace` network ranges for them
- **WHEN** the second network request is scheduled
- **THEN** the coordinator evaluates it using its own `traceRequestKey`
- **AND** the shared display chunk key alone does not suppress the different network request

#### Scenario: Different context ref is a distinct request

- **GIVEN** a trace chunk is cached or in flight for `context_overlay_ref=htf_1`
- **WHEN** Workbench requests the same normalized range for `context_overlay_ref=htf_2`
- **THEN** the coordinator treats it as a distinct request
