## ADDED Requirements

### Requirement: HTF overlays participate in partial trace display state
HTF context EMA overlays SHALL use the same partial/stale coverage model as component events. When a committed render window is partially covered by trace display cache, HTF overlay points for covered ranges MUST remain displayable while uncovered ranges are marked stale or loading.

#### Scenario: Partial HTF coverage remains visible
- **GIVEN** HTF context EMA lines are visible for the current render window
- **WHEN** pan commits a shift to a window that is partially covered by trace display cache
- **THEN** HTF points from covered ranges remain displayable
- **AND** Workbench marks uncovered ranges stale or loading
- **AND** Workbench does not clear all `htf_*` overlays solely because the full window is not covered

### Requirement: HTF overlay request identity includes context ref and normalized range
When HTF context overlays are loaded through trace display chunks, request identity and cache identity MUST include `context_overlay_ref` and normalized range bounds. A chunk loaded without a context ref MUST NOT satisfy a chunk for a non-null context ref.

#### Scenario: Context ref change misses stale HTF chunk
- **GIVEN** trace display cache contains a normalized chunk for `context_overlay_ref=""`
- **WHEN** Workbench requests the same normalized range for `context_overlay_ref=htf_1`
- **THEN** the cache does not treat the empty-ref chunk as covering the HTF overlay request
- **AND** Workbench schedules or restores a chunk keyed by `htf_1`

### Requirement: HTF overlay verification is required for each chart/trace slice
Each implementation slice that changes Chart, trace display scheduling, WorkbenchContext, `strategySpecAuxEma`, `signal_trace_service.py`, or signal trace display application MUST verify HTF context EMA overlays on a variant with `strategy.contexts`.

#### Scenario: Slice verification includes HTF overlays
- **GIVEN** a PR slice touches chart or trace display behavior
- **WHEN** verification is reported for review
- **THEN** the report includes HTF context EMA overlay verification
- **AND** the verification confirms dashed HTF lines still come from `signal_trace.htf_context`
