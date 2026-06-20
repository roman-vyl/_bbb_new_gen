# workbench-chart-htf-context-overlays Specification (delta)

## ADDED Requirements

### Requirement: HTF EMA overlays MUST use chart-events htf_context when display fetch is enabled

When chart-events is enabled for display fetches, HTF context EMA dashed lines (`htf_fast`, `htf_anchor`, `htf_slow`) MUST be built from `chart-events.htf_context.{fast,anchor,slow}` aligned to `chart-events.times`.

Point values MUST match the equivalent signal-trace slice for the same window and `context_overlay_ref`. Regime display MUST remain signal-trace only; chart-events MUST NOT supply `htf_context.state`.

#### Scenario: Overlay points match chart-events htf_context series

- **GIVEN** variant `strategy.contexts.htf_1` with `timeframe: 4h`, periods `200/500/1000`
- **AND** chart overlay ref resolves to `htf_1`
- **AND** chart-events loaded for the current chart window with `context_overlay_ref=htf_1`
- **WHEN** the Chart renders aux EMA overlays
- **THEN** three dashed lines appear with ids `htf_fast`, `htf_anchor`, `htf_slow`
- **AND** point values equal `chart-events.htf_context.{fast,anchor,slow}` at each `chart-events.times[i]`
- **AND** legend labels reflect `{period}/{timeframe}` from the provider (e.g. `200/4h`)

#### Scenario: Chart-events without context_overlay_ref has empty htf_context

- **GIVEN** the same variant with `htf_1` context
- **WHEN** chart-events is requested with `context_overlay_ref` omitted or null
- **THEN** `htf_context.fast`, `anchor`, and `slow` are empty arrays
- **AND** the chart does not render HTF context EMA lines

### Requirement: Chart-events BFF cache keys MUST include context_overlay_ref

The chart-events BFF cache (`research_api/services/chart_events_service.py`) MUST include `context_overlay_ref` (empty string when null) and `schema_version` in the cache key alongside `run_id`, `variant`, and resolved time range.

A chart-events bundle computed without overlay ref MUST NOT be returned for a later request with a non-null overlay ref (and vice versa).

#### Scenario: Overlay ref change misses stale chart-events cache

- **GIVEN** chart-events cached for `(run, variant, window)` with `context_overlay_ref=""` (empty htf_context)
- **WHEN** Workbench requests the same window with `context_overlay_ref=htf_1`
- **THEN** BFF computes or returns a distinct cached entry with populated `htf_context`
- **AND** does not return the empty-htf cached bundle

## MODIFIED Requirements

### Requirement: HTF context EMA lines come from signal trace, not browser or BFF overlay EMA

When a variant defines `strategy.contexts[<ref>]` with `component_id: htf_context`, the Chart SHALL render three auxiliary EMA lines (fast / anchor / slow) from **BFF research trace display data** — `chart-events.htf_context` when chart-events is enabled, otherwise `signal_trace.htf_context` — aligned to the corresponding `times` array. Period and timeframe labels MUST come from the selected context provider config (`fast_period`, `anchor_period`, `slow_period`, `timeframe`).

The frontend MUST NOT compute HTF EMA stacks from candles. HTF context overlay lines MUST NOT use `fetchChartOverlayEma` / BFF `chart_overlay_ema` (that path is for **base-timeframe exit-rule EMA** only).

Research computes HTF EMA via the feature plan (`htf_context_columns_by_ref`) and exposes values through signal trace when `context_overlay_ref` matches; chart-events projects the same values for display.

Per-bar HTF **regime `state`** is diagnostics-only and MUST be read from dense `/signal-trace` for bar inspector — not from chart-events.

#### Scenario: Overlay points match trace htf_context series

- **GIVEN** variant `strategy.contexts.htf_1` with `timeframe: 4h`, periods `200/500/1000`
- **AND** chart overlay ref resolves to `htf_1`
- **AND** display data loaded for the current chart window with `context_overlay_ref=htf_1`
- **WHEN** the Chart renders aux EMA overlays
- **THEN** three dashed lines appear with ids `htf_fast`, `htf_anchor`, `htf_slow`
- **AND** point values equal display `htf_context.{fast,anchor,slow}` at each display `times[i]`
- **AND** legend labels reflect `{period}/{timeframe}` from the provider (e.g. `200/4h`)

#### Scenario: Trace without context_overlay_ref has empty htf_context

- **GIVEN** the same variant with `htf_1` context
- **WHEN** display data is requested with `context_overlay_ref` omitted or null
- **THEN** `htf_context.fast`, `anchor`, and `slow` are empty arrays
- **AND** the chart does not render HTF context EMA lines

### Requirement: OpenSpec changes touching chart or signal trace MUST regression-check HTF context overlays

Any change proposal that modifies **any** of the following MUST include an explicit regression item in `tasks.md` and MUST NOT merge without verifying HTF context EMA lines on a variant with `strategy.contexts` (e.g. `htf_1` on `instance_1`):

- `frontend/src/shared/context/WorkbenchContext.tsx` (signal trace load, aux EMA state, context overlay ref, `chartWindowSlice` aux stabilize)
- `frontend/src/features/chart/chartRenderWindowDisplay.ts` (`buildAuxOverlaysStabilizeKey`, `displayAuxOverlaysForRenderWindow`)
- `frontend/src/features/chart/strategySpecAuxEma.ts` or `strategyContexts.ts`
- `frontend/src/features/chart/ChartPanel.tsx` aux EMA series effect
- `research_api/services/signal_trace_service.py` (cache, query params)
- `research_api/services/chart_events_service.py` (cache, query params, projection)
- `research/strategies/ema_pullback/execution/signal_trace.py` (`htf_context` payload)
- `research/strategies/ema_pullback/features/plan.py` (HTF context columns)

Regression verification (minimum):

1. Select run variant with single HTF context (e.g. `htf_1`, 4h EMA 200/500/1000).
2. Chart hint includes `+N aux EMA (exit/HTF)` after display data loads (not only Bar Inspector HTF values).
3. Three dashed HTF lines visible; Bar Inspector shows EMA fast/anchor/slow at selected bar (from dense trace when opened).
4. Pan chart — lines reload without permanent disappearance.
5. Late display chunk arrival at unchanged render bounds updates HTF chart lines without viewport movement.

#### Scenario: Chart feature proposal lists HTF overlay regression task

- **WHEN** a proposal adds component event markers or changes display/trace loading
- **THEN** `tasks.md` includes a checkbox for HTF context EMA overlay manual verification
- **AND** design.md links this spec
