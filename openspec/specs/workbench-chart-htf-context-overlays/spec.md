# workbench-chart-htf-context-overlays Specification

## Purpose

Document the **delivered** Workbench Chart pipeline for HTF context EMA auxiliary overlays (`htf_fast`, `htf_anchor`, `htf_slow` dashed lines). This spec exists because the overlay chain spans frontend, BFF signal trace, and research feature planning — new chart/trace/workbench features repeatedly regress it when only adjacent specs (component events, trade diagnostics) are read.

**Related specs:** `workbench-strategy-contexts` (provider config + Composer), `workbench-chart-component-event-markers` (component_events from same trace), `workbench-chart-trade-diagnostics` (causal HTF fields from same trace).

**Implementation map (regression-sensitive):**

| Layer | Module | Responsibility |
|-------|--------|------------------|
| Research features | `research/strategies/ema_pullback/features/plan.py` | Plans HTF EMA columns per `context_ref` (`ema_close_{tf}_{period}`) |
| Research trace | `research/strategies/ema_pullback/execution/signal_trace.py` | Fills `htf_context.{fast,anchor,slow,state,meta}` when `context_overlay_ref` is set |
| BFF | `research_api/services/signal_trace_service.py` | Builds trace; **cache key MUST include `context_overlay_ref`** |
| Frontend specs | `frontend/src/features/chart/strategySpecAuxEma.ts` | `collectAuxEmaSpecs` → `source: "htf_trace"`, ids `htf_{role}` |
| Frontend contexts | `frontend/src/features/chart/strategyContexts.ts` | Reads `strategy.contexts`; resolves default overlay ref |
| Frontend state | `frontend/src/shared/context/WorkbenchContext.tsx` | `effectiveContextOverlayRef`, aux overlay merge, `SignalTraceDisplayCache`, trace window key |
| Frontend chart | `frontend/src/features/chart/ChartPanel.tsx` | Renders `chartDisplayAuxEmaOverlays` as dashed LineSeries |
## Requirements
### Requirement: HTF context EMA lines come from signal trace, not browser or BFF overlay EMA

When a variant defines `strategy.contexts[<ref>]` with `component_id: htf_context`, the Chart SHALL render three auxiliary EMA lines (fast / anchor / slow) from **`signal_trace.htf_context`** values aligned to `signal_trace.times`. Period and timeframe labels MUST come from the selected context provider config (`fast_period`, `anchor_period`, `slow_period`, `timeframe`).

The frontend MUST NOT compute HTF EMA stacks from candles. HTF context overlay lines MUST NOT use `fetchChartOverlayEma` / BFF `chart_overlay_ema` (that path is for **base-timeframe exit-rule EMA** only).

Research computes HTF EMA via the feature plan (`htf_context_columns_by_ref`) and exposes values through signal trace when `context_overlay_ref` matches.

#### Scenario: Overlay points match trace htf_context series

- **GIVEN** variant `strategy.contexts.htf_1` with `timeframe: 4h`, periods `200/500/1000`
- **AND** chart overlay ref resolves to `htf_1`
- **AND** signal trace loaded for the current chart window with `context_overlay_ref=htf_1`
- **WHEN** the Chart renders aux EMA overlays
- **THEN** three dashed lines appear with ids `htf_fast`, `htf_anchor`, `htf_slow`
- **AND** point values equal `signal_trace.htf_context.{fast,anchor,slow}` at each `signal_trace.times[i]`
- **AND** legend labels reflect `{period}/{timeframe}` from the provider (e.g. `200/4h`)

#### Scenario: Trace without context_overlay_ref has empty htf_context

- **GIVEN** the same variant with `htf_1` context
- **WHEN** signal trace is requested with `context_overlay_ref` omitted or null
- **THEN** `htf_context.state`, `fast`, `anchor`, and `slow` are empty arrays
- **AND** the chart does not render HTF context EMA lines

### Requirement: Chart resolves effective context_overlay_ref before trace fetch

Chart overlay ref resolution MUST be synchronous with variant selection — not deferred to a post-render effect alone.

Resolution order:

1. User-selected ref from Chart picker (`contextOverlayRef` state), when set and valid.
2. Else `exit_policy.context_consumption.context_ref` when that ref exists in `strategy.contexts`.
3. Else when **exactly one** key exists in `strategy.contexts`, that sole ref (Workbench `defaultChartContextOverlayRef`).
4. Else null — no HTF overlay until user picks a ref.

Workbench MUST use the **effective** resolved ref (`contextOverlayRef ?? default`) for:

- `collectAuxEmaSpecs`
- `fetchSignalTrace` / `context_overlay_ref` query param
- `chartWindowKey` (overlay segment)

This prevents a first-frame trace request with `context_overlay_ref=null` that poisons overlay state before default ref is applied.

#### Scenario: Sole context auto-resolves on variant load

- **GIVEN** `strategy.contexts` contains only `htf_1`
- **AND** user has not changed the Chart HTF overlay picker
- **WHEN** the variant becomes selected and market data is ready
- **THEN** the first signal trace request includes `context_overlay_ref=htf_1`
- **AND** HTF aux EMA specs are collected immediately (same render generation as effective ref)

#### Scenario: Multiple contexts require explicit picker selection

- **GIVEN** `strategy.contexts` defines both `htf_1` and `htf_2`
- **AND** no `exit_policy.context_consumption.context_ref` in `strategy.contexts`
- **WHEN** user has not selected a chart overlay ref
- **THEN** effective overlay ref is null
- **AND** no HTF context EMA lines render
- **AND** Chart shows HTF overlay context picker with empty selection

#### Scenario: Composer no-auto-select does not apply to chart sole-context display

- **WHEN** Composer enables context consumption on a blocker
- **THEN** Composer MUST NOT pre-fill `context_consumption.context_ref` (see `workbench-strategy-contexts`)
- **AND** Chart MAY still auto-resolve the sole `strategy.contexts` key for **display overlays** per resolution order above

### Requirement: Signal trace cache keys include context_overlay_ref

The BFF signal trace cache (`research_api/services/signal_trace_service.py`) MUST include `context_overlay_ref` (empty string when null) in the cache key alongside `run_id`, `variant`, and time range.

A trace computed without overlay ref MUST NOT be returned for a later request with a non-null overlay ref (and vice versa).

#### Scenario: Overlay ref change misses stale cache

- **GIVEN** trace cached for `(run, variant, window)` with `context_overlay_ref=""` (empty htf_context)
- **WHEN** Workbench requests the same window with `context_overlay_ref=htf_1`
- **THEN** BFF computes or returns a distinct cached entry with populated `htf_context`
- **AND** does not return the empty-htf cached bundle

### Requirement: HTF aux overlays survive trace reload and window pan

While `signalTraceStatus` is `loading` or `error`, Workbench MUST NOT strip existing `htf_*` aux overlays (avoid flicker) when displayable HTF points remain available from the **trace display cache** slice for the current render window.

When the render window shifts before a new chunk arrives, Workbench MAY show a stale banner (`htfAuxEmaOverlayStale`) only for **uncovered** portions of the window.

Clearing all aux overlays (`setAuxEmaOverlays([])`) MUST NOT run when HTF specs exist but BFF exit-EMA specs are empty — HTF-only variants still render context lines.

HTF aux overlay points MUST be sourced from the accumulated trace display cache (when available), then sliced to the **current render window** (same bounds as `chartCandles`). When the sliding render window shifts on pan and cache covers the new range, HTF overlay series MUST update from cache slice **without** waiting for a new fetch.

#### Scenario: Pan chart retains HTF lines during trace reload

- **GIVEN** HTF context EMA lines visible for the current render window
- **WHEN** user pans the chart to an uncovered range and signal trace chunk fetch starts
- **THEN** HTF lines from cached overlapping sub-range MAY remain visible until the new chunk merges
- **AND** stale banner MAY explain lag for uncovered data
- **AND** lines update when cache covers the full render window

#### Scenario: HTF overlay slice follows render window shift from cache

- **GIVEN** trace cache contains `htf_context` covering `[T0, T2]`
- **WHEN** pan shifts the render window from `[T0, T1]` to `[T1, T2]` without a new fetch
- **THEN** displayed HTF overlay points are sliced to the new window bounds from cache
- **AND** HTF lines do not retain points outside the new render window

#### Scenario: Pan back restores HTF from cache without refetch

- **GIVEN** trace cache contains HTF context for `[Ta, Tb]`
- **WHEN** user pans away and later returns to render window `[Ta, Tb]`
- **THEN** HTF context EMA lines render from cache slice
- **AND** no signal trace refetch occurs solely because the user returned to a prior window

### Requirement: Report strategy_spec carries contexts for overlay resolution

Run report `variants[].strategy_spec` MUST include `contexts: { <ref>: provider }` when the strategy instance defines contexts (via `strategy_spec_to_dict`). Chart overlay resolution reads from embedded report spec — not from Composer draft files alone.

#### Scenario: Loaded run exposes contexts to chart picker

- **GIVEN** a completed run whose instance defined `strategy.contexts.htf_1`
- **WHEN** user opens the run in Workbench Chart tab
- **THEN** `strategyContextRefOptions` includes `htf_1`
- **AND** provider periods/timeframe are available to `collectAuxEmaSpecs`

### Requirement: OpenSpec changes touching chart or signal trace MUST regression-check HTF context overlays

Any change proposal that modifies **any** of the following MUST include an explicit regression item in `tasks.md` and MUST NOT merge without verifying HTF context EMA lines on a variant with `strategy.contexts` (e.g. `htf_1` on `instance_1`):

- `frontend/src/shared/context/WorkbenchContext.tsx` (signal trace load, aux EMA state, context overlay ref)
- `frontend/src/features/chart/strategySpecAuxEma.ts` or `strategyContexts.ts`
- `frontend/src/features/chart/ChartPanel.tsx` aux EMA series effect
- `research_api/services/signal_trace_service.py` (cache, query params)
- `research/strategies/ema_pullback/execution/signal_trace.py` (`htf_context` payload)
- `research/strategies/ema_pullback/features/plan.py` (HTF context columns)

Regression verification (minimum):

1. Select run variant with single HTF context (e.g. `htf_1`, 4h EMA 200/500/1000).
2. Chart hint includes `+3 aux EMA (exit/HTF)` after trace loads.
3. Three dashed HTF lines visible; Bar Inspector shows EMA fast/anchor/slow at selected bar.
4. Pan chart — lines reload without permanent disappearance.

#### Scenario: Chart feature proposal lists HTF overlay regression task

- **WHEN** a proposal adds component event markers or changes signal trace loading
- **THEN** `tasks.md` includes a checkbox for HTF context EMA overlay manual verification
- **AND** design.md links this spec

