## ADDED Requirements

### Requirement: Chart runtime v2 SHALL expose one authoritative runtime output

Workbench Chart runtime v2 SHALL expose a single authoritative `ChartRuntimeOutput` for the Chart tab. The output MUST include the chart view model, market status/error/source/count/range, lanes trace status/error/data, stale display flags, viewport command stream, interaction dispatch, and runtime debug snapshot.

Temporary compatibility fields MAY be provided by an adapter, but they MUST be derived from `ChartRuntimeOutput` or provider-owned UI/selection glue. Compatibility fields MUST NOT recompute market, render-window, trace, overlay, or chart-model data independently.

#### Scenario: Compatibility fields derive from runtime output

- **GIVEN** runtime v2 has produced a `ChartRuntimeOutput`
- **WHEN** the Workbench chart context adapter exposes legacy chart fields
- **THEN** fields such as chart candles, chart view range, market candle count, full candle range, stale flags, viewport command, and lanes trace state are derived from the runtime output
- **AND** no independent old provider chart pipeline computes those values

#### Scenario: ChartPanel receives one model source

- **GIVEN** the Chart tab has been cut over to runtime v2
- **WHEN** `ChartPanel` renders candles, overlays, events, markers, and diagnostics
- **THEN** its primary renderer data comes from the runtime v2 `chartViewModel`
- **AND** market status and trace status describe the same run, variant, context ref, and render-window range as that model

### Requirement: Chart runtime v2 SHALL be built beside the current working pipeline before cutover

Runtime v2 SHALL be built in `frontend/src/features/workbenchChartRuntime/` beside the current working pipeline. Before cutover, the current `main` pipeline SHALL remain the production owner for the Chart tab.

Before cutover, production-mounted runtime v2 MAY compute identity, windows, fetch plans, candidate ranges, and debug snapshots. It MAY read current working-pipeline snapshots for comparison. It MAY exercise real loader behavior only in isolated test harnesses that use mocks, stubs, or isolated cache instances.

Before cutover, production-mounted runtime v2 MUST NOT write production `marketResourceCache`, perform production network fetches, merge into production trace display/session caches, emit production viewport commands, receive live `ChartPanel` interaction dispatch as an active owner, or mutate production chart context values.

#### Scenario: Shadow runtime has no production ownership

- **GIVEN** runtime v2 is being evaluated before cutover
- **WHEN** the user opens Chart and interacts with pan, trade selection, context overlays, or variant switching
- **THEN** the current working pipeline remains the only production owner for Chart tab behavior
- **AND** runtime v2 shadow output is limited to debug/parity data that cannot mutate production chart domains

#### Scenario: Pre-cutover loader parity is isolated

- **GIVEN** runtime v2 market loader parity is being tested before cutover
- **WHEN** the test exercises fetch planning, loader lifecycle, cache writes, aborts, dedupe, status, and revisions
- **THEN** the exercise runs in an isolated test harness with mocks, stubs, or isolated caches
- **AND** production-mounted Workbench does not perform runtime v2 network fetches or production cache writes

#### Scenario: Cutover is staged by owner domain

- **GIVEN** runtime v2 has passed parity and per-slice smoke gates for the current stage
- **WHEN** a cutover slice (6.3A through 6.3F) is applied
- **THEN** exactly one new mutable chart domain switches to `runtime_v2_production` owner in that slice
- **AND** domains not yet cut over remain owned by the old production pipeline
- **AND** the old provider-owned chart runtime is not left active as a second production path for the same domain
- **AND** market/load/cache ownership transfers only in slice 6.3F, after model, render-window, viewport, trace, and aux overlays are already v2

#### Scenario: Big-bang multi-owner cutover is forbidden

- **GIVEN** a cutover is proposed
- **WHEN** more than one new `runtime_v2_production` owner would be enabled across market, render-window, viewport, trace, aux overlay, and model in a single slice
- **THEN** the cutover is not accepted
- **AND** implementation must follow `phase6-staged-owner-cutover-plan.md`

### Requirement: Runtime v2 SHALL enforce single ownership for mutable chart domains

Runtime v2 SHALL have one active owner for each mutable chart domain after cutover:

- market focus and coverage windows
- market load status
- market resource cache write timing
- render-window indices
- viewport command stream
- trace display cache
- dense lanes trace
- chart events/component events
- aux and HTF overlays
- final chart model

Runtime v2 SHALL expose debug owner metadata per domain (`model`, `render_window`, `viewport`, `trace`, `aux_overlay`, `market`) with values `old_production` or `runtime_v2_production`, plus the active cutover `phase` tag (`6.3A` … `6.3F`).

#### Scenario: Duplicate market fetch owner is rejected

- **GIVEN** the Chart tab has been cut over to runtime v2
- **WHEN** a cold chart open or pan boundary expansion requires a market window fetch
- **THEN** exactly one runtime owner authorizes each market fetch key
- **AND** the old provider market load effect does not issue a duplicate fetch for the same identity and range

#### Scenario: Duplicate viewport command owner is rejected

- **GIVEN** the Chart tab has been cut over to runtime v2
- **WHEN** selected trade focus or render-window restore emits a viewport command
- **THEN** exactly one viewport command stream is visible to `ChartPanel`
- **AND** old provider command state does not emit a competing command

### Requirement: Runtime input SHALL exclude upstream Workbench ownership

`ChartRuntimeInput` SHALL consume upstream state needed for chart runtime decisions without owning that upstream state. Shell tab state, Composer config state, run list bootstrap, report fetching, selected run mutation, selected variant/trade/bar mutation, marker visibility preferences, and context overlay selector UI ownership SHALL remain outside chart runtime.

The runtime MAY consume derived values such as report readiness/data, selected run id, reload token, selected variant, selected trade entry time, chart IO gate, effective context overlay ref, and explicit chart focus intent.

#### Scenario: Report loading remains upstream

- **GIVEN** the selected run id or reload token changes
- **WHEN** the report is fetched and becomes ready
- **THEN** runtime v2 consumes the ready report and selected run identity as input
- **AND** runtime v2 does not call the report loader or own report load status

#### Scenario: Marker preferences remain UI state

- **GIVEN** the user toggles marker visibility in the chart marker legend
- **WHEN** runtime v2 builds chart data and component events
- **THEN** marker preference state remains provider/UI glue or renderer state
- **AND** runtime v2 does not become the owner of marker visibility preferences

### Requirement: Runtime v2 SHALL preserve existing market, render-window, trace, event, and overlay behavior

Runtime v2 SHALL preserve the behavior documented by the current delivered chart specs and `docs/workbench-chart-runtime-analysis.md`:

- chart-heavy IO is gated until Chart activation
- market focus windows are trade-centered or tail-based
- coverage windows expand on pan and stay clamped to report range
- market cache uses split candles and EMA resource chunks
- display bundle keeps focus fallback while expanded coverage loads
- render window uses the existing bounded window and safe-zone behavior
- viewport commands distinguish trade focus, user pan, and restore-after-window-swap
- trace display uses chart-events when enabled and dense signal-trace fallback when disabled or needed
- dense lanes trace is scoped to the current chart window
- component events and HTF overlays are sliced from trace display cache to the committed render window
- BFF aux EMA and HTF trace EMA remain distinct sources

#### Scenario: Cold chart open preserves baseline behavior

- **GIVEN** a run report is available and the Chart tab is activated
- **WHEN** runtime v2 loads the initial chart data
- **THEN** market candles and anchor-stack EMA load for the target focus window
- **AND** the render window initializes as tail or trade-centered according to current selection policy
- **AND** the chart model is not empty when market status is ready

#### Scenario: Context overlay switch preserves HTF behavior

- **GIVEN** a selected variant has `strategy.contexts`
- **WHEN** the user changes the effective context overlay ref
- **THEN** trace/chart-events request identity includes the selected context ref
- **AND** HTF context EMA dashed lines are sourced from trace display data for that ref
- **AND** market candles are not refetched solely because the context overlay changed

### Requirement: Runtime v2 SHALL provide a debug snapshot for parity and smoke gates

Runtime v2 SHALL expose a debug snapshot containing at minimum run id, variant key, selected trade id and entry time, chart IO gate, market identity, focus window, coverage window, fetched and cached candle ranges/counts, display bundle range/count/source, render-window indices/range, chart model candle range/count, viewport command, trace request keys/status, chart-events/component event counts, aux/HTF overlay counts, marker/event counts when available, and active owner flags for critical domains.

#### Scenario: Debug snapshot identifies chart data lineage

- **GIVEN** runtime v2 has built a chart model
- **WHEN** a reviewer captures the runtime debug snapshot
- **THEN** the snapshot identifies the run, variant, context ref, market identity, display bundle, render window, chart model range, and trace request identities used to build that model
- **AND** the snapshot can be compared with the current working pipeline during parity review

#### Scenario: Debug snapshot exposes per-domain owner during staged cutover

- **GIVEN** a cutover slice from 6.3A through 6.3E is active
- **WHEN** the runtime debug snapshot or `wb.cutover.domain_owners` console mark is captured
- **THEN** each transferred domain shows `owner: runtime_v2_production`
- **AND** each not-yet-transferred domain shows `owner: old_production`
- **AND** no domain shows two active owners
- **AND** `phase` matches the active slice (e.g. `6.3A` during model cutover)

#### Scenario: Debug snapshot exposes full v2 ownership after 6.3F

- **GIVEN** market/load/cache cutover slice 6.3F is complete
- **WHEN** the runtime debug snapshot is captured after cold open, pan, or trade navigation
- **THEN** all chart-runtime domains (`model`, `render_window`, `viewport`, `trace`, `aux_overlay`, `market`) show `runtime_v2_production`
- **AND** no old provider chart-runtime owner is active for those domains

#### Scenario: Owner telemetry exists before first cutover slice

- **GIVEN** Phase 6.3-debug telemetry is complete and 6.3A has not started
- **WHEN** the user opens Chart with debug enabled
- **THEN** console or `__pipelineDebugExport()` shows `domainOwners` with all domains `old_production` and `phase: 6.3-debug`
- **AND** domain-relevant pipeline marks include `owner`, `domain`, and `phase` fields

### Requirement: Old WorkbenchContext chart runtime SHALL NOT remain as a dual pipeline

After runtime v2 cutover, `WorkbenchContext.tsx` SHALL NOT implement an active second chart pipeline alongside runtime v2 modules. Inline chart loader, bundle, pan, render-window, viewport, trace, aux, or model composition helpers MUST NOT remain as competing production owners.

`WorkbenchContext` SHALL retain shell/report/composer/selection glue and React wiring for Phase 63D trace, 63E aux, and 63F market load (`phase63*OwnerRef` bridges). Phase 63B render-window, 63C viewport commands, interaction dispatch, and trade-focus orchestration SHALL live in `WorkbenchRenderViewportContext`.

Phase 7 mirror-state deletion from `WorkbenchContext` is deferred optional cleanup; it is NOT required for runtime-v2 acceptance.

#### Scenario: Provider does not import old chart loaders as active owners

- **GIVEN** runtime v2 cutover has completed
- **WHEN** `WorkbenchContext.tsx` is inspected
- **THEN** it does not directly import or call old chart runtime loader, market bundle, pan prefetch, trace network, trace cache, render-window, viewport, aux overlay, or chart model composition helpers as active owners
- **AND** those domain behaviors are owned by modules under `frontend/src/features/workbenchChartRuntime/` and `WorkbenchRenderViewportContext`

#### Scenario: Phase 7 deletion is optional backlog

- **GIVEN** runtime v2 is production-active for the Chart tab
- **WHEN** refactor acceptance is reviewed
- **THEN** optional Phase 7 mirror deletion may remain unimplemented without blocking archive
- **AND** the change is not accepted as a permanent dual-runtime system

### Requirement: Runtime v2 SHALL pass required smoke gates before completion

Runtime v2 SHALL pass the required smoke gates from `docs/workbench-chart-runtime-analysis.md` before final completion: cold chart open, tab switch activation, distant trade navigation, pan left boundary, pan right boundary, variant switch, context overlay switch when applicable, chart-events enabled path, chart-events disabled/fallback path, markers/events/trace render, no empty chart gaps, no fetch storm, and no programmatic viewport event interpreted as user pan.

#### Scenario: Smoke gates block cutover

- **GIVEN** runtime v2 has not passed all required smoke gates
- **WHEN** a cutover is proposed
- **THEN** the cutover is not accepted
- **AND** the failing smoke scenarios are documented with expected visible behavior, debug evidence, and forbidden symptoms

#### Scenario: Final completion includes HTF verification

- **GIVEN** runtime v2 changes chart, trace display, `WorkbenchContext`, aux overlays, or context overlay behavior
- **WHEN** final verification is reported
- **THEN** the report includes HTF context EMA overlay verification on a variant with `strategy.contexts`
- **AND** the verification confirms dashed HTF lines come from signal trace or chart-events `htf_context`, not BFF chart overlay EMA

### Requirement: Phase 63B/C orchestration SHALL live in WorkbenchRenderViewportContext

After cutover stabilization, render-window initialization/shift, viewport command stream, interaction dispatch, and trade-focus orchestration SHALL be owned by `WorkbenchRenderViewportContext`, not inline in `WorkbenchContext`.

`WorkbenchContext` SHALL compose `WorkbenchRenderViewportProvider` with market bundle inputs and pan-prefetch callbacks from Phase 63F.

#### Scenario: Viewport commands originate from render viewport context

- **GIVEN** the Chart tab is active with runtime v2 production owners
- **WHEN** trade focus or render-window restore requires a viewport command
- **THEN** `chartViewportCommand` is produced by `WorkbenchRenderViewportContext` via Phase 63C bridge
- **AND** `WorkbenchContext` does not maintain a competing viewport command owner

### Requirement: Trade navigation SHALL use demand-load and readiness-gated focusTrade

Trade selection (`selectTrade`, Next/Prev trade) SHALL NOT synchronously emit `focusTrade`. Trade focus SHALL emit only after market load, render foundation, and chart slice cover the selected trade entry.

Outside-window navigation SHALL trigger focus-window demand-load and recover contiguous market cache coverage (including coalesced resource chunks).

Inside-window navigation SHALL NOT reset market load to loading when the focus window is unchanged; `focusTrade` SHALL apply even when the bounded render window does not shift.

#### Scenario: selectTrade does not sync-emit focusTrade

- **GIVEN** the user selects a different trade
- **WHEN** `selectTrade` runs
- **THEN** selection state updates immediately
- **AND** no synchronous `focusTrade` viewport command is emitted before readiness checks pass

#### Scenario: Outside-window trade triggers demand-load

- **GIVEN** the selected trade entry is outside the current market focus window coverage
- **WHEN** trade selection changes
- **THEN** focus window resolves to a trade-centered target window
- **AND** Phase 63F market load fetches until cache coverage includes the new focus
- **AND** trade focus emits only after readiness is `ready`

#### Scenario: Inside-window trade moves viewport without spurious loading

- **GIVEN** the next trade lies within the current focus window
- **WHEN** the user navigates with Next/Prev trade
- **THEN** market load status does not spuriously return to loading solely due to trade change
- **AND** `focusTrade` applies to center the new trade even if render-window indices are unchanged

### Requirement: User pan SHALL NOT be inferred from bare visible_range_changed

`visible_range_changed` events from Lightweight Charts SHALL NOT alone promote interaction state to `user_panning` or trigger market boundary prefetch.

Market pan prefetch SHALL run only when render-window interaction state is already `user_panning`, `pending_shift`, or `applying_shift` after controller dispatch, or from explicit pointer/wheel/keyboard_pan_start paths.

#### Scenario: Programmatic visible range does not prefetch

- **GIVEN** visible range changes due to programmatic viewport restore or trade focus
- **WHEN** `visible_range_changed` is dispatched
- **THEN** interaction state does not become `user_panning` from that event alone
- **AND** market pan prefetch is not invoked with reason `interaction_state_gate` bypass

#### Scenario: Keyboard prelude is not the trade navigation fix

- **GIVEN** trade navigation via Next/Prev trade
- **WHEN** viewport centers on the new trade
- **THEN** the primary path is demand-load + readiness-gated `focusTrade`
- **AND** keyboard_pan_start is not required for trade navigation correctness

### Requirement: Market resource cache SHALL coalesce overlapping chunks

When sequential trade-focus loads append candle or overlay chunks, `marketResourceCache` SHALL coalesce overlapping ranges so eviction does not leave coverage holes that strand trade navigation in unavailable market state.

#### Scenario: Sequential trade loads keep contiguous coverage

- **GIVEN** multiple market window loads for adjacent focus targets
- **WHEN** chunks are written to the resource cache
- **THEN** overlapping ranges are merged into contiguous coverage
- **AND** a subsequent trade inside the merged coverage does not show sticky "Market data unavailable"
