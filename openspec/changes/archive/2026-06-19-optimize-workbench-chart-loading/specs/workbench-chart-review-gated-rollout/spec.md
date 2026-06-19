## ADDED Requirements

### Requirement: Implementation proceeds through review-gated PR slices
The change SHALL be implemented in ordered PR-sized slices. After each slice, implementation MUST stop for user review before starting the next slice.

The required order is:

1. Instrumentation, lazy chart activation, and abortable client foundation.
2. WorkbenchContext responsibility split without behavior changes.
3. Anti-flicker partial event display state.
4. Missing-range scheduling without active-pan prefetch.
5. Split market resource cache.

Sparse/materialized chart events are future work and MUST require a separate review/OpenSpec before backend implementation.

#### Scenario: PR slice stops for review
- **GIVEN** an implementation slice is completed
- **WHEN** verification for that slice is reported
- **THEN** the agent stops before starting the next slice
- **AND** the next slice starts only after explicit user approval

#### Scenario: Later slice does not start early
- **GIVEN** PR 1 is not reviewed yet
- **WHEN** implementation work continues
- **THEN** the agent does not start PR 2 context splitting
- **AND** the agent limits follow-up changes to PR 1 review fixes

#### Scenario: Future chart events require separate OpenSpec
- **GIVEN** PR 5 is complete and reviewed
- **WHEN** the team wants to implement sparse or materialized chart events
- **THEN** the agent creates or updates a separate OpenSpec for that backend/API work
- **AND** the agent does not implement chart-events API as part of this active change

### Requirement: Each slice preserves rollback boundaries
Each PR slice SHALL be independently reviewable and revertible. A slice MUST NOT include behavior changes reserved for a later slice.

#### Scenario: Context split avoids semantic changes
- **GIVEN** PR 2 is implementing the context split
- **WHEN** the diff is reviewed
- **THEN** it does not change `/signal-trace` contract
- **AND** it does not add chunked backend behavior or prefetch
- **AND** it preserves existing render-window and trace semantics
