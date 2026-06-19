# workbench-chart-controller-orchestration Specification

## Purpose

Chart runtime **orchestration** for the Research Workbench: explicit controller boundaries for pan lifecycle, viewport policy, trace display scheduling, and a thin renderer. Delivered in the `frontend-chart-architecture-refactor` cutover (v1 keeps run/market/trace IO in `WorkbenchContext`; decisions live in `frontend/src/features/chart/runtime/`).

**Related specs:** `workbench-chart-sliding-window`, `workbench-trace-window-chunk-cache`, `workbench-chart-htf-context-overlays`, `pipeline-debug-instrumentation`.

**Implementation map:**

| Role | v1 module |
|------|-----------|
| `RenderWindowController` | `runtime/renderWindowController.ts` |
| `ViewportController` | `runtime/viewportController.ts` |
| Trace display policy | `runtime/traceDisplayOrchestrator.ts` + trace effect in `WorkbenchContext` |
| `ChartViewModel` | `runtime/chartViewModel.ts` |
| `ChartRenderer` | `ChartPanel.tsx` |
| `RunDataController` / `MarketDataStore` | `WorkbenchContext` + `marketDataCache` (follow-up extraction) |

## Requirements

### Requirement: Chart runtime SHALL be decomposed into explicit controller boundaries

Workbench frontend SHALL orchestrate chart behavior through dedicated controllers with single responsibility:

- `RunDataController` (run/variant/report identity)
- `MarketDataStore` (full market bundle cache)
- `RenderWindowController` (window bounds and interaction mode)
- `TraceDisplayController` (trace display cache coverage, fetch scheduling, display slicing)
- `ChartViewModel` (pure chart-ready derived data)
- `ViewportController` (viewport command policy)
- `ChartRenderer` (imperative chart adapter only)

No single module SHALL own both interaction policy and imperative chart mutations.

#### Scenario: Controller ownership is explicit

- **WHEN** chart architecture is inspected for run/variant load, pan, and trace arrival flows
- **THEN** each flow step maps to one controller with a documented responsibility
- **AND** no step requires implicit ownership through effect ordering in `ChartPanel`

### Requirement: Render-window interaction SHALL use explicit pan lifecycle states

`RenderWindowController` SHALL maintain interaction states at minimum: `trade_focused`, `user_panning`, `pending_shift`, `applying_shift`, and `idle_user_view`.

Safe-zone boundary crossings during active pan SHALL enqueue `pendingShift` intent without immediate window swap.

#### Scenario: Active pan reaches boundary

- **WHEN** visible range reaches render-window safe-zone boundary while pointer drag is active
- **THEN** controller stores one pending shift intent with anchor context
- **AND** chart data window is not swapped until pan idle commit criteria are met

### Requirement: Interaction mode SHALL be driven by explicit interaction adapter events

Chart runtime SHALL include an interaction adapter that emits normalized interaction events for controllers:

- pointer lifecycle (`pointerdown`, `pointermove`, `pointerup`)
- wheel/touchpad scroll events
- programmatic viewport command lifecycle
- visible-range-changed notifications

`RenderWindowController` MUST consume normalized interaction events and MUST NOT classify active-pan state from visible-range changes alone.

#### Scenario: Non-drag range change does not become user_panning

- **GIVEN** visible range changes due to programmatic viewport restore or trade focus
- **WHEN** interaction adapter has no active pointer/wheel interaction session
- **THEN** controller does not enter `user_panning` from that range change alone

#### Scenario: Drag interaction enters and exits panning state explicitly

- **GIVEN** pointer lifecycle is available
- **WHEN** adapter emits `pointerdown` and subsequent `pointermove` over chart area
- **THEN** controller enters `user_panning`
- **AND** on `pointerup` controller exits drag-active state and evaluates pending shift commit

### Requirement: Viewport command ownership SHALL be singular

`ViewportController` SHALL be the only component allowed to emit viewport commands (`focusTrade`, `restoreAfterWindowSwap`, `preserveUserRange`, `noViewportChange`).

Trace readiness, cache merges, or marker/overlay display updates SHALL NOT directly invoke viewport mutation commands.

#### Scenario: Trace update arrives

- **WHEN** a trace response is merged and display markers/HTF overlays are updated
- **THEN** viewport command for that event is `noViewportChange`
- **AND** viewport remains at user-controlled or previously commanded position

### Requirement: Chart renderer SHALL execute commands without business decisions

`ChartRenderer`/`ChartPanel` SHALL apply already-computed chart data and viewport command payloads but SHALL NOT infer business intent (trade selection policy, pan shift policy, trace fetch policy).

#### Scenario: Renderer receives view-model and viewport command

- **WHEN** renderer receives `seriesData`, `markerData`, `overlayData`, and a viewport command
- **THEN** it applies chart library calls (`setData`, markers, lines, viewport command execution)
- **AND** it does not branch on higher-level workflow causes such as `trade_selected` vs `trace_ready`

### Requirement: Final runtime SHALL not keep dual orchestration sources

After refactor completion, production runtime SHALL have a single orchestration source in controller-owned modules.

Legacy multi-owner orchestration logic in `ChartPanel` refs/effects MAY exist temporarily during implementation, but MUST be removed or fully disabled before acceptance completion.

#### Scenario: Final chart runtime has single ownership path

- **WHEN** chart runtime code is inspected at acceptance stage
- **THEN** viewport, window-shift, and trace-scheduling ownership is controller-driven only
- **AND** legacy `ChartPanel` guard/ref orchestration is not active as a second runtime path

### Requirement: Controller runtime SHALL preserve existing Workbench data layers through ChartViewModel

The controller-owned chart runtime SHALL preserve the full data surface currently delivered by BFF/report artifacts and required by chart UI. The runtime MUST continue to receive and map into `ChartViewModel` and adjacent inspector/diagnostic models:

- Run/report layer (`/api/research/runs`, `/api/research/runs/{run_id}`, selected variant, report metrics/diagnostics, `component_counters`, `trade_records`)
- Trade/chart report layer (trade markers, selected trade navigation and diagnostics, context attribution, setup diagnostics, quality fields when present)
- Market chart bundle layer (`/api/market/chart-bundle`, full-range OHLCV, anchor-stack EMA overlays)
- Extra chart EMA overlay layer (`/api/market/indicators/ema` for non-anchor chart-timeframe exit-rule EMA lines)
- Signal trace layer (`/api/research/runs/{run_id}/signal-trace`, `times`, `meta`, long/short lanes, internals)
- HTF context trace layer (`htf_context.state/fast/anchor/slow/meta` aligned by `times`)
- Context consumption trace layer (`context_consumption_trace[]`)
- Component semantic events layer (`component_events[]` with role/event_type/side/component/instance/timeframe metadata contract)

The refactor MUST NOT narrow supported component-event roles to RSI-only or entry-block-only semantics.

#### Scenario: Heavy run preserves chart and inspector layers

- **GIVEN** a heavy run and selected variant with trade diagnostics, component events, and HTF context
- **WHEN** the new controller runtime builds `ChartViewModel` and related inspector models
- **THEN** UI continues to show candles, anchor EMA, aux EMA, HTF EMA, trade markers, selected-trade diagnostics, lanes, bar-inspector inputs, context traces, and component events
- **AND** no listed data layer is dropped due to controller refactor

#### Scenario: Aux BFF EMA and HTF trace EMA remain distinct sources

- **GIVEN** chart has both exit-rule aux EMA overlays and HTF context overlays
- **WHEN** overlays are rendered by the new runtime
- **THEN** BFF aux EMA lines remain sourced from `/api/market/indicators/ema`
- **AND** HTF dashed overlays remain sourced from `signal_trace.htf_context` aligned by `times`
- **AND** one source is not substituted for the other

#### Scenario: Trace merge updates display only while preserving lanes diagnostics model

- **GIVEN** trace cache hit or merge occurs for committed window
- **WHEN** display data is updated
- **THEN** markers and HTF overlays update from cache/merge without viewport movement
- **AND** long/short lane fields and diagnostics inputs remain available for timeline/inspector consumers

### Requirement: Shell state and chart data runtime have separate subscription boundaries

Workbench orchestration SHALL separate shell/report state from chart data runtime state so non-chart consumers do not subscribe to chart display revisions.

Shell-level state includes active tab, runs, selected run, report, selected variant, and selected trade. Chart data runtime state includes market load/cache, render window, trace display cache, signal trace load, auxiliary overlays, and viewport commands.

#### Scenario: Reports panel avoids chart display revision subscription

- **GIVEN** `displayApplyRevision` changes because trace display data was applied
- **WHEN** Reports UI is subscribed to Workbench state
- **THEN** Reports UI does not rerender solely because of `displayApplyRevision`

#### Scenario: Context bar avoids component event subscription

- **GIVEN** `chartDisplayComponentEvents` changes after a trace merge
- **WHEN** ContextBar renders run/variant controls
- **THEN** ContextBar does not rerender solely because component events changed

### Requirement: Context split preserves chart behavior

The WorkbenchContext split SHALL NOT change chart cache semantics, API contracts, render-window behavior, trace scheduling behavior, trade focus behavior, or HTF overlay sourcing in the refactor slice.

#### Scenario: Refactor keeps chart behavior stable

- **GIVEN** the context split PR is applied
- **WHEN** the user opens Chart, pans across a safe-zone boundary, and selects a distant trade
- **THEN** the same market, render-window, trace, viewport, and marker behavior remains observable as before the split
- **AND** no new prefetch or backend chunking behavior is introduced by that PR

### Requirement: ChartPanel receives chart-facing data and commands only

ChartPanel SHALL receive chart view model data, marker/display state, and viewport commands required for rendering, but it MUST NOT receive unrelated Workbench shell/report universe state.

#### Scenario: Renderer stays an imperative adapter

- **WHEN** ChartPanel renders candles, overlays, markers, and viewport commands
- **THEN** it does not own run/report loading policy
- **AND** it does not own trace fetch scheduling policy
