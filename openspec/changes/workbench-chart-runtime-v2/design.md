## Context

This design is for the frontend layer only. It is based on `docs/workbench-chart-runtime-analysis.md`, which is the required baseline map for the current `main` Workbench chart/runtime pipeline.

Current baseline:

- `frontend/src/shared/context/WorkbenchContext.tsx` is 3096 lines and owns shell state, config/Composer state, run/report loading, variant/trade/bar selection, and most chart/runtime orchestration.
- `ChartPanel` consumes `useWorkbenchChart()` and remains the imperative Lightweight Charts renderer.
- Existing chart helpers and runtime controllers already exist under `frontend/src/features/chart/`, but `WorkbenchContext.tsx` still owns lifecycle, reset ordering, mutable refs, effect dependencies, cache invalidation, viewport command stream, trace orchestration, and final context output.
- Regression-sensitive delivered specs remain constraints: `workbench-chart-controller-orchestration`, `workbench-chart-sliding-window`, `workbench-chart-market-resource-cache`, `workbench-trace-window-chunk-cache`, `workbench-chart-htf-context-overlays`, `research-api-chart-events`, and `pipeline-debug-instrumentation`.

Global forbidden rules for this change:

- Do not implement runtime code before OpenSpec approval.
- Do not move random effects one by one.
- Do not create a new active owner while the old owner remains active after cutover.
- Do not add chart runtime lifecycle to `WorkbenchContext`.
- Do not modify `ChartPanel` before its contract is defined.
- Do not keep old and new chart runtimes as permanent dual systems.
- Do not mark any required phase complete without STOP FOR REVIEW.
- Do not call `WorkbenchContext` "glue" until old chart/runtime code is physically removed.
- Do not skip deletion phase.
- Do not leave new modules huge while old `WorkbenchContext` remains huge.

## Goals / Non-Goals

**Goals:**

- Build a modular Workbench chart runtime v2 beside the current working pipeline.
- Preserve current behavior for market loading, sliding render windows, viewport commands, trace/chart-events display, HTF overlays, markers/events, and pan/edge loading.
- Define a minimal authoritative `ChartRuntimeInput` and `ChartRuntimeOutput`.
- Keep the current pipeline as the working reference until parity gates pass.
- Atomically cut the Chart tab over to the new runtime.
- Delete old chart/runtime code from `WorkbenchContext.tsx` after cutover.
- Enforce single-owner rules for mutable chart domains.

**Non-Goals:**

- Do not rewrite Composer.
- Do not rewrite run/report loading.
- Do not rewrite `ChartPanel` as part of runtime creation.
- Do not change trading logic.
- Do not change backend/data API contracts.
- Do not change research/data_engine layers.
- Do not create a permanent dual-pipeline fallback.

## 1. Current Baseline

The current pipeline on `main` is:

- Run/report/variant/trade to chart model: selected run loads report, variant is normalized, default closed trade is selected, selected trade entry time drives market focus and render-window mode, then `chartViewModel` is composed from sliced market/trace/overlay data.
- Market focus/coverage to market load/cache: `RunMarketView` derives symbol/timeframe/data range/cache keys; focus window is trade-centered or tail; coverage window expands on pan; `executeMarketWindowLoad()` writes candles/EMA chunks into `marketResourceCache`.
- Cache/bundle to render/display window: `composeDisplayMarketWindowBundle()` reads cache and uses focus fallback while coverage is loading; render-window manager slices candles/EMA/aux overlays to the current bounded window.
- Chart interactions to pan/edge: `ChartPanel` emits normalized pointer/wheel/programmatic/visible-range events; provider dispatch updates render-window and viewport controllers; visible range samples can expand market coverage.
- Signal trace/chart-events to markers/HTF overlays: trace bootstrap waits for report/market/render identity; display cache is filled from chart-events when enabled or signal-trace fallback; dense trace remains per-window for lanes/diagnostics; component events and HTF slices feed chart model.
- Viewport/render-window to Lightweight Charts: provider emits viewport commands; `ChartPanel` executes them and owns `setData`, series, markers, price lines, programmatic viewport suppression, and layout.

## 2. Target Architecture

Target folder:

`frontend/src/features/workbenchChartRuntime/`

The target is a cohesive runtime package with one public hook and explicit module boundaries. The list below adjusts the user-proposed module set by keeping UI preferences and report/shell selection outside runtime, and by making provider adapters thin.

| Module | Responsibility | Inputs | Outputs | State ownership | Allowed dependencies | Forbidden dependencies | Reuse/wrap/replace | Replaces old `WorkbenchContext` parts | Parity check |
|---|---|---|---|---|---|---|---|---|---|
| `runtimeTypes.ts` | Defines `ChartRuntimeInput`, `ChartRuntimeOutput`, debug snapshot, owner flags, module result types. | Existing API/chart types. | Shared runtime types. | None. | Type imports from `@/api/types`, chart runtime public types. | React effects, API calls. | New. | Broad implicit `WorkbenchChartState` contract. | Type-level contract tests. |
| `useWorkbenchChartRuntime.ts` | Main hook composing runtime modules without becoming a god-hook. | `ChartRuntimeInput`. | `ChartRuntimeOutput`. | Owns orchestration refs only when no narrower module can own them. | Runtime modules in this folder. | Composer/report loaders, `ChartPanel`, direct Lightweight Charts calls. | New wrapper around existing helpers. | Provider chart runtime orchestration. | Module size <500 lines; output parity. |
| `runtimeInputAdapter.ts` | Converts provider shell/report/selection state into runtime input. | report state, selected variant/trade/bar, IO gate, context overlay selection. | stable `ChartRuntimeInput`. | None. | `tradeLookup`, `strategyContexts`. | Market/trace loaders. | New. | Mixed selection-derived chart inputs. | Input snapshot matches analysis baseline. |
| `runtimeOutputAdapter.ts` | Maps runtime output to current `WorkbenchChartState` compatibility fields during cutover. | `ChartRuntimeOutput`, provider glue fields, UI preferences. | current chart context value. | None. | `runtimeTypes`. | Runtime lifecycle or network. | New. | `chartValue` compatibility construction. | Compatibility fields derive from one output. |
| `marketViewRuntime.ts` | Resolves `RunMarketView`, identity, timeframe metadata, parse errors. | report, selected variant, chart timeframe, reload token. | market view, identity, expected identity, errors. | None or minimal memo state. | `runMarketView`, `chartTimeframeMs`, `anchorStackFromSpec`. | API/network, ChartPanel. | Reuse/wrap. | `intendedRunMarketView`, `expectedRunMarketViewIdentity`. | Identity string parity. |
| `marketWindowRuntime.ts` | Owns focus/coverage windows and reset semantics. | market view, selected trade entry time, coverage expansion intents. | focus/coverage windows and keys. | Owns market focus/coverage mutable domain after cutover. | `workbenchMarketLoad.resolveMarketTargetWindow`, key builders. | Network/cache writes. | Reuse/wrap. | `marketFocusWindow`, `marketCoverageWindow`, related refs. | Window parity and reset parity. |
| `marketLoadRuntime.ts` | Owns market fetch lifecycle/status/error/revisions. | market view, focus/coverage windows, IO gate. | market load status/error, ready identity, cache revision ticks. | Owns market load status and market cache write timing after cutover. | `workbenchMarketLoad`, `marketResourceCache`, debug helpers. | Render-window or trace policy. | Wrap existing loader. | market load effect, abort/generation/in-flight refs. | No duplicate fetch owner; cold market non-empty. |
| `marketBundleRuntime.ts` | Composes display bundle with focus fallback and market count/range/source. | market view, windows, market status, revision ticks. | display bundle, source, candle count/range, foundation key. | Owns bundle refs after cutover. | `runMarketView`, `marketResourceCache`, `chartMarkers.candleRangeMs`. | Network fetch. | Reuse/wrap. | `cachedBundle`, fallback refs, range/source/count. | No empty gaps during coverage prefetch. |
| `panRuntime.ts` | Decides market coverage expansion from user visible range. | visible sample, coverage window, report bounds, timeframe, interaction state, IO gate. | coverage expansion intents. | Owns pan dedupe refs after cutover. | `evaluateMarketPanPrefetchExpansion`. | API calls, render slicing. | Reuse/wrap. | `attemptMarketPanPrefetch` and pan dedupe refs. | Left/right boundary smoke; no fetch storm. |
| `interactionRuntime.ts` | Dispatches `ChartInteractionEvent` into render/viewport/pan decisions. | ChartPanel events, current candles snapshot. | viewport commands, render-window intents, pan samples. | Owns interaction bridge after cutover. | `chartRuntime`, `interactionAdapter` types. | Lightweight Charts APIs. | Wrap existing controllers. | `dispatchChartInteraction`. | Programmatic viewport not treated as user pan. |
| `renderWindowRuntime.ts` | Owns bounded render-window indices, trade/tail init, shift commits. | display bundle candles, selected trade entry, interaction events. | render-window revision, shift seq, committed bounds. | Owns render-window indices after cutover. | `chartRuntime`, `renderWindowController`, `chartDataWindowManager`, `chartViewWindow`. | Market network and trace network. | Reuse existing controllers. | render-window refs/effects/functions. | Range parity and restore parity. |
| `viewportRuntime.ts` | Owns viewport command stream and swap transaction lifecycle. | viewport controller commands, trade focus intent, ChartPanel ack/cancel/settle. | command, seq, lifecycle callbacks. | Owns viewport command stream after cutover. | `viewportController`, runtime types. | `executeViewportCommand`, Lightweight Charts. | Reuse/wrap. | command state, transaction refs, ack/settle/cancel callbacks. | No stale restore/focus override. |
| `traceRuntime.ts` | Orchestrates trace bootstrap, session cache, dense lanes state, network policy. | report/run/variant, market identity/status, render-window key/bounds, display cache coverage, IO gate, context ref. | lanes trace/status/error, trace request/debug keys. | Owns dense lanes trace and coordinator after cutover. | `signalTraceBootstrap`, `signalTraceLoadPolicy`, `signalTraceRequestCoordinator`, `signalTraceBundleSessionCache`, `workbenchTraceNetworkLoad`. | ChartPanel, marker toggles. | Reuse/wrap. | main trace effect and dense trace state/refs. | chart-events enabled/disabled and run-switch tests. |
| `traceDisplayRuntime.ts` | Owns normalized display cache, chunk scheduling, display apply, stale retention. | render candles, trace network commits, trace status. | component events, HTF slice, display status, missing range, revisions. | Owns trace display cache after cutover. | `signalTraceDisplayCache`, `traceDisplayApply`, `traceDisplayChunkScheduling`. | Dense lanes display ownership except via explicit interface. | Reuse/wrap. | display cache refs/state/effects. | Display cache parity and retained stale display. |
| `chartEventsRuntime.ts` | Wraps chart-events display path and fallback semantics. | trace display chunk request params, feature flag, coordinator result. | chart-events display merge outcome and debug. | No separate persistent owner unless folded into trace runtime. | `chartEventsLoad`, `workbenchTraceNetworkLoad`. | Backend API changes. | Wrap. | chart-events branch inside trace effect. | Enabled/disabled/fallback smoke. |
| `auxOverlayRuntime.ts` | Owns BFF aux EMA, HTF overlay derivation, frozen/stale display projection. | selected variant strategy spec, chart timeframe, context ref, trace display HTF slice, report range. | aux overlays, display aux overlays, stale flag. | Owns aux/HTF overlay data after cutover. | `strategySpecAuxEma`, `strategyContexts`, `chartAuxEmaOverlays`, `chartRenderWindowDisplay`, `fetchChartOverlayEma`. | Report loader, ChartPanel series. | Reuse/wrap. | aux EMA state/effects and HTF fallback logic. | HTF context overlay verification. |
| `chartWindowRuntime.ts` | Slices candles/EMA/aux to render window and stabilizes arrays. | display bundle, aux overlays, render-window bounds/revision, identities. | sliced chart window. | Owns slice cache refs after cutover. | `chartDataWindowManager`, `chartRenderWindowDisplay`, `chartViewWindow`. | Network/API. | Reuse/wrap. | `chartWindowSlice`, `chartView`, slice caches. | `seriesKey` and array stability parity. |
| `chartModelRuntime.ts` | Produces final `ChartViewModel` and minimal metadata. | sliced chart window, display aux overlays, component events, stale/status flags. | `ChartViewModel`. | None beyond memoization. | `chartViewModel`. | Network, provider contexts. | Reuse. | chart model memo and duplicate legacy fields. | Model contract tests. |
| `runtimeDebug.ts` | Builds debug snapshot and owner flags. | runtime module states and identities. | snapshot for smoke/parity review. | No ownership, read-only aggregation. | debug constants, runtime types. | Side-effectful logging except existing debug integration. | New. | scattered debug metadata. | Snapshot contains required fields. |

## 3. Runtime Input/Output Contract

`ChartRuntimeInput` SHALL include only data needed by the chart runtime:

- `reportLoadStatus`.
- `report`.
- `selectedRunId`.
- `reloadToken`.
- `selectedVariantKey`.
- `selectedVariant`.
- `selectedTradeId`.
- `selectedTradeEntryTimeMs`.
- `chartTradeFocusWarning`.
- `selectedBarTimeSec` only if needed for debug/diagnostics; bar selection ownership remains provider glue.
- `chartTimeframe`.
- `chartHeavyIoEnabled`.
- `contextOverlayRef`.
- `effectiveContextOverlayRef`.
- `contextOverlayRefOptions` only if adapter/debug needs it; selector ownership remains provider glue.
- explicit `chartFocusIntent` emitted by selection glue when a user/default trade selection should focus chart.

Marker preferences SHALL remain outside runtime unless a later reviewed slice proves runtime needs them. The runtime owns component event data; `ChartPanel`/UI glue owns marker visibility preferences.

`ChartRuntimeOutput` SHALL be the single authoritative output for the Chart tab:

- `chartViewModel`.
- market status/error/source/count/range.
- trace lanes data/status/error.
- stale flags (`htfAuxEmaOverlayStale`, `componentEventsStale`).
- display/render revisions needed by the renderer (`displayApplyRevision`, `renderWindowShiftSeq`, or reviewed replacements).
- viewport command stream (`command`, `commandSeq`, `acknowledge`, `isWindowSwapTransactionCancelled`, `settleWindowSwapCommit`).
- interaction dispatch.
- runtime debug snapshot.

Current `WorkbenchChartState` field disposition:

- Provider glue: selected variant/trade/bar, `selectTrade`, `selectBar`, marker preference booleans/setters, report timeframe mismatch, context overlay selector state/options, shell tab state.
- Runtime output: `chartViewModel`, market status/error/source/count/range, lanes trace/status/error, stale flags, display/render revisions, viewport command stream, interaction dispatch.
- Adapter-derived compatibility: `chartCandles`, `chartEmaOverlays`, `chartAuxEmaOverlays`, `chartDisplayAuxEmaOverlays`, `chartViewMode`, `chartViewCenterTimeSec`, `chartViewFirstTimeSec`, `chartViewLastTimeSec`, `chartViewCount`, legacy `signalTrace*` fields while tests migrate.
- Delete after cutover when no consumers remain: old duplicated chart arrays and legacy raw trace fields that are superseded by `chartViewModel` and lanes-scoped output.

## 4. Single-Owner Rules

| Domain | Owner before cutover | Owner after cutover | Forbidden dual-owner situation | Detection |
|---|---|---|---|---|
| selected chart focus intent | Provider `selectTrade()` + current viewport controller | Provider selection glue emits explicit focus intent; `viewportRuntime` owns command policy | Old and new paths both dispatch `trade_selected` | duplicate `focusTrade` commands or duplicate `chart.viewport.apply_trade_focus` debug marks |
| market focus/coverage windows | `WorkbenchContext.tsx` state/effects | `marketWindowRuntime` | both old and new update coverage and trigger fetch | more than one fetch for same expansion key or mismatched debug snapshot windows |
| market load status | `WorkbenchContext.tsx` market effect | `marketLoadRuntime` | old status drives UI while new data drives model | UI status disagrees with runtime snapshot/model |
| market resource cache writes | current provider calling `executeMarketWindowLoad()` | `marketLoadRuntime` | two loaders write same `marketResourceCache` keys | duplicate `/market/*-window` calls with same in-flight key |
| render-window indices | current `chartRuntimeRef.renderWindow` | `renderWindowRuntime` | same ChartPanel event sent to two managers | two different `seriesKey` or render bounds for one event |
| viewport command stream | provider state and viewport controller | `viewportRuntime` | ChartPanel applies commands from two streams | repeated ack/apply logs, stale restore after cancel |
| trace display cache | provider `signalTraceDisplayCacheRef` | `traceDisplayRuntime` | old and new merge/display chunks | duplicate component events or divergent coverage |
| dense lanes trace | provider `signalTrace` + session cache | `traceRuntime` | both fetch dense trace for same chart window | duplicate `/signal-trace` calls or stale lanes ready state |
| chart events/component events | provider display apply state | `chartEventsRuntime` + `traceDisplayRuntime` | old/new display paths both merge events | doubled event counts or old events after context switch |
| aux/HTF overlays | provider `auxEmaOverlays` and frozen refs | `auxOverlayRuntime` | two BFF aux fetchers or frozen HTF stores | duplicate aux series ids or stale flag mismatch |
| final chart model | provider `buildChartViewModel()` memo | `chartModelRuntime` | model from old path and status from new path | model candle count disagrees with runtime market count/source |

During build-beside phases, runtime v2 in the production-mounted Workbench may only:

- compute market identity, focus/coverage windows, request keys, render ranges, chart model candidates, and debug snapshots;
- read current working-pipeline snapshots for comparison;
- run isolated test harnesses with mocks, stubs, or isolated cache instances.

Before cutover, runtime v2 in the production-mounted Workbench must not:

- write to production `marketResourceCache`;
- perform production network fetches;
- merge into production trace display cache or session trace cache;
- emit production viewport commands;
- receive live `ChartPanel` interaction dispatch as an active owner;
- mutate production chart context values.

If real market/trace loading parity is needed before cutover, it must run in an isolated test harness, not in production-mounted Workbench.

## 5. Build-Beside and Cutover Strategy

- The current `main` pipeline remains the working reference until cutover.
- The new runtime is built under `frontend/src/features/workbenchChartRuntime/`.
- Before cutover, production Chart tab remains controlled by the current `WorkbenchContext.tsx` pipeline.
- Shadow/debug output is allowed only when it does not create a second active owner for mutable domains.
- Before cutover, production-mounted runtime v2 may compute identity/windows/fetch plans and debug snapshots, but it must not write production market/trace caches, perform production network fetches, emit viewport commands, receive live `ChartPanel` interactions as an active owner, or mutate production chart context values.
- Real loader parity before cutover must be proven in isolated test harnesses with mocks/stubs or isolated caches.
- Parity is checked through debug snapshots, existing tests, new contract tests, and manual smoke gates.
- Cutover is atomic: provider switches Chart context output to the new runtime output through `runtimeOutputAdapter`.
- After cutover and review, old chart/runtime code in `WorkbenchContext.tsx` is deleted rather than retained as fallback.

The old pipeline is the working reference before cutover. It is not a permanent fallback.

## 6. Deletion Strategy

| Group | Target new owner | Deletion phase | Static guard idea | Acceptance proof |
|---|---|---|---|---|
| old market identity/window state | `marketViewRuntime`, `marketWindowRuntime` | Phase 7 | no `marketFocusWindow` / `marketCoverageWindow` state in `WorkbenchContext.tsx` | run/variant/distant trade tests pass |
| old market load effect | `marketLoadRuntime` | Phase 7 | provider does not import `executeMarketWindowLoad` | cold chart open and pan prefetch pass |
| old market cache/bundle composition | `marketBundleRuntime` | Phase 7 | provider does not import `composeDisplayMarketWindowBundle` | no empty chart gaps during coverage prefetch |
| old pan/edge refs/functions | `panRuntime` | Phase 7 | provider does not import `evaluateMarketPanPrefetchExpansion` | left/right pan smoke and dedupe pass |
| old `chartRuntimeRef` / render-window ownership | `interactionRuntime`, `renderWindowRuntime`, `viewportRuntime` | Phase 7 | provider has no `chartRuntimeRef` or `renderWindowManager()` | shift/restore tests pass |
| old viewport command state | `viewportRuntime` | Phase 7 | provider has no chart viewport command state except adapter output | stale/cancel restore tests pass |
| old trace bootstrap/network/cache orchestration | `traceRuntime`, `traceDisplayRuntime`, `chartEventsRuntime` | Phase 7 | provider does not import trace network/coordinator/cache modules | chart-events run-switch tests pass |
| old chart-events/component-events ownership | `traceDisplayRuntime`, `chartEventsRuntime` | Phase 7 | provider does not set component event display state | marker/event tests pass |
| old aux/HTF overlay ownership | `auxOverlayRuntime` | Phase 7 | provider does not fetch `fetchChartOverlayEma` for chart overlays | HTF overlay verification passes |
| old chart window slicing | `chartWindowRuntime` | Phase 7 | provider does not own slice caches or call manager slice methods | `seriesKey` parity and setData behavior stable |
| old chart model composition | `chartModelRuntime` | Phase 7 | provider derives compatibility from runtime output only | ChartPanel works from runtime model |
| old chart compatibility fields | `runtimeOutputAdapter`, then shrink API | Phase 8 | type/static tests identify remaining legacy-only fields | no needed consumers remain |

`WorkbenchContext.tsx` should shrink by at least 1000 lines from the 3096-line baseline unless review approves a different target.

## 7. Debug Snapshot Contract

`runtimeDebug.ts` SHALL expose a read-only snapshot with:

- run id.
- variant key.
- selected trade id and entry time.
- chart IO gate state.
- market identity.
- focus window.
- coverage window.
- fetched candles range/count.
- cached candles range/count.
- display bundle range/count/source.
- render window indices and time range.
- chart model candle range/count/series key.
- viewport command and command seq.
- trace request keys and statuses.
- chart-events/component-event counts.
- aux/HTF overlay counts.
- marker/event counts if available from runtime data.
- active owner flags for market windows, market cache writes, render-window indices, viewport command stream, trace display cache, dense lanes trace, aux overlays, and final chart model.

The snapshot is required for parity review and smoke debugging. It must not mutate runtime state.

## 8. Smoke and Acceptance Gates

| Smoke | Expected visible behavior | Expected debug steps | Forbidden symptoms |
|---|---|---|---|
| cold chart open loads candles | Chart shows market candles, EMA stack, default trade focus/tail; no unavailable banner after ready | `wb.load.report_ready`, `wb.market_fetch.start/end`, `wb.load.market_bundle_ready`, `wb.render_window.init`, `chart.setData.candles` | empty chart after ready, repeated report fetch, market loading stuck |
| tab switch to Chart starts heavy IO | Heavy chart IO starts after Chart activation | `wb.chart_heavy_io.blocked_until_activation`, then market/trace fetch steps | market/trace fetch before activation or never starts after switch |
| selected distant trade navigation | Chart centers selected distant trade and highlights marker | `wb.render_window.trade_select`, `chart.viewport.apply_trade_focus`, trace bootstrap for new window | marker not in view, viewport stays old, old events shown as current |
| pan left boundary works | older candles load/shift smoothly or clamp at report start | `wb.market_pan_prefetch_decision`, `wb.render_window.shift_applied`, `chart.viewport.restore_after_shift` | fetch storm, jump/teleport, blank chart |
| pan right boundary works | newer candles load/shift smoothly or clamp at report end | right-side pan decision, market fetch/cache or clamp, shift/restore | infinite expansion, repeated identical fetches, snap back to trade |
| variant switch works | default trade/variant updates; candles may reuse; EMA periods update | no report refetch; cache hit/fetch according to periods; trace reset | report refetch, old variant markers, wrong EMA periods |
| context overlay switch works if applicable | trace/events/HTF reload for context; candles stable | trace display cache reset, trace decision/fetch, HTF setData | market refetch just for context, stale context events current |
| chart-events enabled path works | display events/HTF can appear from chart-events before dense trace | `wb.chart_events_merge` or fallback debug | dense failure hides committed chart-events display, duplicate markers |
| chart-events disabled/fallback path works | single dense path fills display/lanes | `wb.chart_events_fallback` flag disabled, dense fetch/merge | `/chart-events` requests when disabled, duplicate dense fetch |
| markers/events/trace render | trade markers, component events, trade management markers, lanes and inspector remain consistent | marker rebuild and trace display apply debug | stale markers for wrong run/window/context |
| no empty chart gaps | coverage prefetch keeps focus/display bundle visible | focus fallback/debug source in snapshot | `chartViewModel.candles` empty while market ready |
| no fetch storm | one authorized fetch per identity/window intent | coordinator and in-flight keys stable | repeated identical market/trace requests |
| no programmatic viewport event interpreted as user pan | viewport commands do not trigger pan prefetch/focus clearing | `wb.pan.suppressed_programmatic` for suppressed range events | restore/focus starts coverage expansion as user pan |

## 9. Module Size / Complexity Gates

- Runtime module target: each module should stay below 500 lines.
- `useWorkbenchChartRuntime.ts` must not become a new god-hook.
- If a module grows above 500 lines, split before continuing.
- If new runtime grows but `WorkbenchContext.tsx` does not shrink after cutover, the phase failed.
- After deleting old chart runtime code, `WorkbenchContext.tsx` should be at least 1000 lines smaller than the 3096-line baseline unless review approves a different target.
- `runtimeOutputAdapter.ts` must remain a mapping layer, not a hidden orchestrator.
- Each implementation phase review must include a complexity/ownership report with line count for every new runtime module, current `WorkbenchContext.tsx` line count, old owner symbols still present in `WorkbenchContext.tsx`, and new owner symbols introduced in runtime v2.
- `useWorkbenchChartRuntime.ts` crossing 500 lines is an immediate split-before-continue blocker unless OpenSpec review approves a specific exception.

## 10. Testing Strategy

Reuse existing tests:

- Provider integration: `frontend/src/shared/context/workbenchLoad.test.tsx`.
- Chart-events integration: `chartEventsRunSwitch.test.tsx`, `chartEventsDistantTradeDisplay.test.tsx`, `chartEventsDisplayLoad.test.tsx`.
- Market helpers: `workbenchMarketLoad.test.ts`, `runMarketView.test.ts`, `marketWindowPlanner.test.ts`, `marketResourceCache.test.ts`.
- Trace/cache helpers: `signalTraceDisplayCache.test.ts`, `traceDisplayApplyLifecycle.test.ts`, runtime trace/coordinator/chunk/orchestrator tests.
- Render/viewport helpers: `renderWindowController.test.ts`, `viewportController.test.ts`, `chartDataWindowManager.test.ts`, `chartRenderWindowDisplay.test.ts`, `chartViewport.test.ts`.
- Renderer presentation helpers: marker, trade-management, trade lookup, trade focus nav, marker legend, diagnostics and price line tests.

Add before cutover:

- `ChartRuntimeInput` and `ChartRuntimeOutput` contract tests.
- Runtime debug snapshot tests.
- Single-owner violation tests for market fetches, trace fetches, viewport command stream, and final model source.
- Adapter tests proving compatibility fields derive from one runtime output.
- Shadow parity tests for market identity/window/fetch targets, render-window ranges, trace request keys, event counts, aux/HTF overlay counts, and chart model ranges.
- Static guard tests after deletion to prevent old imports/symbols returning to `WorkbenchContext.tsx`.

Mandatory manual/browser smoke before switch:

- All smoke scenarios in section 8.
- HTF context EMA overlays verification on a variant with `strategy.contexts`, as required by `workbench-chart-htf-context-overlays`.
- Workbench Chart screenshot rule: wait for `Full report range cached` when capturing Chart tab with large market data.

Gaps that cannot remain before switch:

- No unresolved dual-owner domain for production Chart tab.
- No unknown mismatch in market identity/window keys.
- No unknown mismatch in trace request/display cache keys.
- No missing HTF overlay verification.
- No permanent shadow/runtime comparison code that writes production data.

## Coverage of Analyzed Responsibilities

| Responsibility group | Disposition |
|---|---|
| Shell / tab state | Stays outside chart runtime. `chartHeavyIoEnabled` becomes runtime input. |
| Config / Composer state | Stays outside chart runtime in provider/Composer glue. |
| Runs / report loading | Stays outside chart runtime. Report readiness/data, selected run id, and reload token become runtime inputs. |
| Variant / trade / bar selection | Selection ownership stays provider/report glue. Selected variant, trade entry time, warning and focus intent become runtime inputs. Bar selection stays provider/renderer glue. |
| Market view identity | Moves into new runtime (`marketViewRuntime`). |
| Market focus / coverage windows | Moves into new runtime (`marketWindowRuntime`). |
| Market loading / fetch lifecycle | Moves into new runtime (`marketLoadRuntime`). |
| Market cache / bundle composition | Moves into new runtime (`marketBundleRuntime`), reusing `marketResourceCache` as the single cache implementation. |
| Pan / edge loading | Moves into new runtime (`panRuntime`) with a single coverage expansion owner. |
| Chart interaction dispatch | Moves into new runtime (`interactionRuntime`), still called by `ChartPanel` adapter. |
| Render-window runtime | Moves into new runtime (`renderWindowRuntime`). |
| Viewport command runtime | Moves into new runtime (`viewportRuntime`), while `ChartPanel` remains executor. |
| Signal trace runtime | Moves into new runtime (`traceRuntime`). |
| Trace display cache / chunk scheduling | Moves into new runtime (`traceDisplayRuntime`). |
| Chart events / component events | Data path moves into runtime (`chartEventsRuntime` / `traceDisplayRuntime`); marker UI preferences stay outside runtime; compatibility fields are adapter-derived temporarily. |
| HTF / aux overlays | Data path moves into runtime (`auxOverlayRuntime`); context overlay selector state stays provider glue and becomes input. |
| Chart window slicing | Moves into new runtime (`chartWindowRuntime`). |
| Chart view model composition | Moves into new runtime (`chartModelRuntime`); compatibility fields are adapter-derived temporarily. |
| Context provider output | Stays provider glue through `runtimeInputAdapter` and `runtimeOutputAdapter`; old chart/runtime ownership is deleted after cutover. |
| Public context/API surface | Current shell/report/composer surfaces stay provider glue. Broad chart surface shrinks after cutover; temporary compatibility fields are adapter-derived. |
| ChartPanel contract | `ChartPanel` remains imperative renderer and callback caller. Runtime supplies data, command stream and dispatch; Lightweight Charts calls do not move into runtime. |
| Existing helper/runtime module inventory | Existing helpers are reused/wrapped where possible. No duplicate market cache, trace cache, request coordinator, render-window or viewport controller implementations unless reviewed. |
| Lifecycle / effect ordering timeline | Becomes runtime lifecycle contract and parity checklist. Reordering requires tests and debug evidence. |
| Keys/cache/request identities | Become explicit runtime snapshot/contract. Key shape parity is required before cutover. |
| Time/range units and invariants | Become runtime invariants and test/smoke assertions. |
| Baseline smoke/debug contract | Becomes required acceptance gates. |
| Old runtime deletion inventory | Becomes Phase 7 deletion checklist. |
| Single-owner matrix | Becomes build-beside and cutover constraint. |
| Test inventory and gaps | Becomes testing strategy and cutover readiness checklist. |

## Risks / Trade-offs

- New runtime becomes another god-hook -> split modules before they exceed size/ownership gates.
- Shadow runtime accidentally writes shared caches or emits commands -> shadow phases must expose debug only and single-owner tests must detect duplicate fetches/commands.
- `WorkbenchContext.tsx` remains large after cutover -> deletion phase is mandatory and line-count target is an acceptance gate.
- Trace/chart-events behavior regresses -> reuse existing trace helpers and add parity tests for keys, cache coverage, fallback, and lanes state.
- HTF overlays regress -> every chart/trace slice must verify `workbench-chart-htf-context-overlays`.
- ChartPanel contract expands during runtime work -> do not modify `ChartPanel` before contract review; keep renderer imperative.

## Migration Plan

1. Lock baseline from `main`.
2. Approve OpenSpec.
3. Add runtime contracts and skeleton with no production wiring.
4. Add market identity/window parity only, with no fetch or cache writes.
5. Add market fetch plan and loader wrapper parity only in isolated test harnesses.
6. Add market bundle/fallback/source/count parity without production-mounted writes.
7. Add render/display/viewport parity in debug/shadow mode.
8. Add trace/events/overlays/chart-model parity and complete `ChartRuntimeOutput`.
9. Atomically cut Chart tab to new runtime.
10. Delete old chart/runtime pipeline from `WorkbenchContext.tsx`.
11. Remove temporary shadow/comparison code and shrink compatibility API.

Rollback before cutover is simply to keep using the current working pipeline. After cutover, rollback is reverting the cutover commit, not keeping a permanent fallback.
