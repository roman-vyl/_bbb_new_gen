## ADDED Requirements

### Requirement: Sparse chart events endpoint serves display data
The research API SHALL provide a sparse chart-events product for chart display data independent from dense signal trace diagnostics. The endpoint MUST be scoped by run, variant, requested time range, and optional context overlay ref.

The chart-events payload MUST include component events, HTF display points or context states when requested, and coverage metadata. It MUST NOT include dense long/short per-bar arrays, per-bar internals, or full context consumption traces.

#### Scenario: Chart requests sparse event window
- **GIVEN** a selected run, variant, render-window time range, and context overlay ref
- **WHEN** Workbench requests chart events for that range
- **THEN** the API returns component events for the requested range
- **AND** the API returns coverage metadata for the returned data
- **AND** the payload excludes dense signal trace internals

### Requirement: Dense signal trace remains diagnostics-only
Dense `/api/research/runs/{run_id}/signal-trace` SHALL remain available for lanes, bar inspector, and deep diagnostics over focused windows while chart markers and HTF display migrate to sparse chart events.

#### Scenario: Bar inspector still uses dense trace
- **GIVEN** chart markers are loaded from sparse chart events
- **WHEN** the user opens a bar inspector or signal timeline view requiring dense internals
- **THEN** Workbench may request `/signal-trace` for the focused diagnostic window
- **AND** existing dense trace consumers continue to receive `long`, `short`, `context_consumption_trace`, and internals

### Requirement: Materialized chart event chunks are optional but reusable
The backend MAY materialize sparse chart event chunks beside run artifacts. When materialized chunks exist and match run, variant, context ref, and range identity, the API MUST be able to serve them without recomputing dense trace for the same display data.

#### Scenario: Repeated chart event request uses materialized chunk
- **GIVEN** a chart event chunk was materialized for a run, variant, context ref, and normalized time range
- **WHEN** Workbench requests the same chart event range again
- **THEN** the API serves the materialized sparse chunk
- **AND** the API does not rebuild dense signal trace solely for chart marker display
