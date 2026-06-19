## ADDED Requirements

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

`traceRequestKey` MUST identify the real `/signal-trace` network request parameters. `traceDisplayChunkKey` MUST identify frontend display/cache chunk coverage and MUST NOT replace `traceRequestKey` unless the same normalized bounds are actually sent in the network request.

In-flight, merged, failed, and superseded ledgers for network fetches MUST use `traceRequestKey`. Display coverage ledgers MAY use `traceDisplayChunkKey`.

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
