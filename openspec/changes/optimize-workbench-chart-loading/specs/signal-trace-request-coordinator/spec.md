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

### Requirement: Coordinator tracks normalized range identity
The signal trace request coordinator SHALL track request identity using run id, variant, context overlay ref, and normalized range bounds for trace display chunks.

In-flight, merged, failed, and superseded ledgers MUST use the normalized request key for missing-range scheduling.

#### Scenario: Duplicate normalized chunk is skipped
- **GIVEN** a normalized trace chunk request is already in flight
- **WHEN** another scheduling pass requests the same run, variant, context ref, and normalized range
- **THEN** the coordinator skips the duplicate request
- **AND** debug output records the duplicate or in-flight decision

#### Scenario: Different context ref is a distinct request
- **GIVEN** a trace chunk is cached or in flight for `context_overlay_ref=htf_1`
- **WHEN** Workbench requests the same normalized range for `context_overlay_ref=htf_2`
- **THEN** the coordinator treats it as a distinct request
