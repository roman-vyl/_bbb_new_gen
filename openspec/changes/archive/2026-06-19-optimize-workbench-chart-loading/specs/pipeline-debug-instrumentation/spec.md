## ADDED Requirements

### Requirement: Chart load diagnostics cover heavy IO and render mutations
Pipeline debug instrumentation SHALL record timing and decision markers for Workbench Chart heavy IO and imperative render mutations.

Instrumentation MUST cover market fetch start/end/cache hit, trace fetch start/end/cache hit/cache miss, display cache `coversRange` and `missingRange` results, candle/EMA `setData`, marker `setMarkers`, and duplicate or superseded trace request decisions.

#### Scenario: Cold chart open produces baseline events
- **GIVEN** Workbench loads a run report and the user opens Chart for the first time
- **WHEN** market and trace requests run
- **THEN** debug output includes market fetch start/end or cache hit
- **AND** debug output includes trace fetch start/end or cache hit/miss
- **AND** debug output includes chart `setData` and marker `setMarkers` timings

#### Scenario: Duplicate trace request is observable
- **GIVEN** trace scheduling evaluates a request whose identity is already in flight or already merged
- **WHEN** the coordinator skips the request
- **THEN** debug output records the trace request key
- **AND** debug output records whether the skip was duplicate, cache hit, in-flight, merged, failed, or superseded

### Requirement: Debug scenarios are named for review
The implementation SHALL provide a way to measure the named review scenarios: cold chart open, tab switch to Chart, long pan across a render-window boundary, and distant trade navigation.

#### Scenario: Review captures required measurements
- **WHEN** PR 1 verification is reported
- **THEN** the report includes debug evidence for cold chart open
- **AND** the report includes debug evidence for tab switch, long pan, and distant trade navigation
