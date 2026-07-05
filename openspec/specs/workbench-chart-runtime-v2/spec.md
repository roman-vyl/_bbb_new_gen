# workbench-chart-runtime-v2 Specification

## Purpose

Workbench Chart runtime v2 is the **production Chart tab pipeline**. Domain logic lives in `frontend/src/features/workbenchChartRuntime/` (`*Runtime.ts` + `phase63*Bridge.ts`). Production is **not** wired through `useWorkbenchChartRuntime`; React contexts compose bridge owner refs.

## Requirements

### Requirement: Runtime v2 is the sole production chart pipeline

The Chart tab SHALL use runtime v2 modules at cutover phase **6.3F** with one active owner per mutable domain (`model`, `render_window`, `viewport`, `trace`, `aux_overlay`, `market`). No permanent dual old+v2 production path.

Production wiring:

- `WorkbenchContext` — shell, report/composer, selection, Phase **63D** trace, **63E** aux, **63F** market load
- `WorkbenchRenderViewportContext` — Phase **63B** render-window, **63C** viewport commands, interaction dispatch, trade-focus orchestrator
- `ChartPanel` — renderer only; executes `chartViewModel` and viewport commands

#### Scenario: No dual pipeline in WorkbenchContext

- **GIVEN** the Chart tab is active
- **WHEN** `WorkbenchContext.tsx` is inspected
- **THEN** it does not call `executeMarketWindowLoad`, `composeDisplayMarketWindowBundle`, or `buildChartViewModel` as active owners
- **AND** chart domains are owned by `workbenchChartRuntime` bridges

### Requirement: Trade navigation uses demand-load and readiness-gated focusTrade

`selectTrade` and Next/Prev trade SHALL update selection only. `focusTrade` SHALL emit only after market load, render foundation, and chart slice cover the selected trade entry.

Outside-window navigation SHALL demand-load the new focus window and maintain contiguous market cache coverage (coalesced chunks).

Inside-window navigation SHALL NOT spuriously reset market to loading when the focus window is unchanged; `focusTrade` SHALL apply even when the bounded render window does not shift.

#### Scenario: No sync focusTrade from selectTrade

- **GIVEN** the user selects a different trade
- **WHEN** `selectTrade` runs
- **THEN** selection updates immediately
- **AND** `focusTrade` is not emitted synchronously before readiness checks pass

### Requirement: User pan uses interaction FSM gate

Mouse/wheel pan and `keyboard_pan_start` prelude MAY enter `user_panning`. Bare `visible_range_changed` SHALL NOT alone promote `user_panning` or trigger market boundary prefetch.

Market pan prefetch SHALL run only when interaction state is `user_panning`, `pending_shift`, or `applying_shift` after controller dispatch.

#### Scenario: Programmatic range change does not prefetch

- **GIVEN** visible range changes from programmatic viewport restore or trade focus
- **WHEN** `visible_range_changed` is dispatched without prior user-pan prelude
- **THEN** market pan prefetch is not invoked solely from that event

### Requirement: Render window defaults are 25 000 bars with 5 000 safe zone

Sliding render window SHALL default to **25 000** bars (`CHART_RENDER_WINDOW_SIZE`) with **5 000** bars safe zone (`CHART_RENDER_SAFE_ZONE`) per `chartViewWindow.ts`.

#### Scenario: Constants match sliding-window defaults

- **GIVEN** `frontend/src/features/chart/chartViewWindow.ts` exports render-window constants
- **WHEN** the Chart tab initializes a bounded render window
- **THEN** `CHART_RENDER_WINDOW_SIZE` is 25 000
- **AND** `CHART_RENDER_SAFE_ZONE` is 5 000

### Requirement: Rejected approaches remain forbidden

The following SHALL NOT be reintroduced as production architecture:

- broad `visible_range_changed` → `user_panning` promotion
- keyboard pan as the primary trade-navigation fix
- synchronous `focusTrade` from `selectTrade`
- stale cached bundle fallback for a new trade focus target without demand-load
- chunk eviction without coalescing that leaves coverage holes

#### Scenario: Broad visible_range promotion is rejected

- **GIVEN** a `visible_range_changed` event from programmatic viewport restore or trade focus
- **WHEN** interaction state was not already `user_panning`, `pending_shift`, or `applying_shift`
- **THEN** the event alone does not promote `user_panning`
- **AND** market boundary prefetch is not started solely from that event

#### Scenario: Trade navigation does not depend on keyboard pan prelude

- **GIVEN** the user navigates trades with Next/Prev or Reports row selection
- **WHEN** viewport centers on the newly selected trade
- **THEN** the primary path is demand-load plus readiness-gated `focusTrade`
- **AND** `keyboard_pan_start` is not required for correct trade navigation

### Requirement: Phase 7 WorkbenchContext mirror deletion is optional backlog

Further shrink of `WorkbenchContext` mirror state is deferred cleanup. It is NOT an acceptance criterion for runtime v2. Bridge owner refs and 63D/63E/63F effects SHALL remain until a future explicitly scoped change.

#### Scenario: Runtime v2 acceptance does not require Phase 7 deletion

- **GIVEN** runtime v2 is production-active at cutover phase 6.3F
- **WHEN** refactor acceptance is reviewed
- **THEN** optional Phase 7 mirror deletion may remain unimplemented without blocking archive
- **AND** `phase63*OwnerRef` bridges plus 63D/63E/63F effects remain the React entry for those domains
