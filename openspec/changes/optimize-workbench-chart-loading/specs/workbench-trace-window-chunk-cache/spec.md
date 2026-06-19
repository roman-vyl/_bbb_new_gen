## ADDED Requirements

### Requirement: Trace display exposes partial coverage state
Workbench SHALL represent trace display state as more than loaded/loading. The display state MUST distinguish current, partial, stale, loading missing range, and empty states, and MUST expose covered ranges and missing range for the committed render window.

#### Scenario: Partial coverage is visible to display logic
- **GIVEN** the committed render window spans `[T0, T3]`
- **AND** trace display cache covers `[T0, T1]` and `[T2, T3]`
- **WHEN** display state is derived for the render window
- **THEN** status is `partial` or `loading_missing`
- **AND** covered ranges include `[T0, T1]` and `[T2, T3]`
- **AND** missing range includes `[T1, T2]`

### Requirement: Cache miss does not clear all component events
When a committed render window is not fully covered by trace display cache, Workbench MUST NOT clear all component event markers solely because the exact window is uncovered.

Workbench MUST display cached events for covered portions when available and mark uncovered portions stale or loading until missing data arrives.

#### Scenario: Window shift preserves covered events
- **GIVEN** component events are displayed for a render window
- **WHEN** pan commits a shift to a window that is only partially covered by trace display cache
- **THEN** Workbench keeps displayable events from covered ranges
- **AND** Workbench does not call the display pipeline with an unconditional empty event list solely due to the cache miss

### Requirement: Missing-range scheduling uses normalized trace display chunks
When trace display cache does not cover the committed render window, Workbench SHALL compute the missing range and plan one or more normalized trace display chunks. The display/cache chunk identity (`traceDisplayChunkKey`) MUST include run, variant, context overlay ref, and normalized range bounds.

The network request identity (`traceRequestKey`) MUST remain the identity of the real `/signal-trace` request. If normalized bounds are actually sent to `/signal-trace`, then `traceRequestKey` MAY include those normalized bounds. If normalized chunks are only a frontend planning concept, `traceDisplayChunkKey` MUST NOT replace `traceRequestKey`.

While dense `/signal-trace` remains the source, normalized chunks MUST be coarse enough to avoid many small recomputations. Active-pan prefetch MUST NOT be introduced in the first missing-range scheduling slice.

#### Scenario: Uncovered window schedules normalized chunk
- **GIVEN** a committed render window is not fully covered by trace display cache
- **WHEN** trace scheduling evaluates the window
- **THEN** Workbench computes missing coverage
- **AND** Workbench maps the missing coverage to normalized chunk bounds
- **AND** Workbench records those bounds in `traceDisplayChunkKey`
- **AND** `traceRequestKey` continues to match the actual network request parameters

#### Scenario: Frontend-only normalized chunk does not replace network key
- **GIVEN** Workbench plans a normalized display chunk for cache coverage
- **AND** Workbench chooses to send a different exact range to `/signal-trace`
- **WHEN** the network request is scheduled
- **THEN** `traceDisplayChunkKey` uses the normalized display chunk bounds
- **AND** `traceRequestKey` uses the exact range sent over the network

#### Scenario: Active pan does not prefetch missing trace
- **GIVEN** the user is actively panning near a safe-zone boundary
- **AND** a pending shift points to an uncovered trace range
- **WHEN** trace scheduling evaluates active-pan state
- **THEN** Workbench does not start active-pan prefetch
- **AND** trace loading waits for committed window evaluation or post-commit idle prefetch

### Requirement: Post-commit idle prefetch is allowed after stable ledgers
After request identity, supersede, abort/stale-response handling, and in-flight range ledgers are implemented, Workbench MAY prefetch a neighboring normalized trace chunk after a committed window shift becomes idle.

#### Scenario: Neighbor prefetch waits until commit idle
- **GIVEN** a render-window shift has committed
- **AND** the current window trace scheduling has settled
- **WHEN** post-commit idle prefetch is enabled
- **THEN** Workbench may request one neighboring normalized trace chunk
- **AND** the prefetch is tracked by the same in-flight and supersede ledgers as foreground trace requests
