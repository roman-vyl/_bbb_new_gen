# Phase 6.0 - Live Contract Specification

## Scope

This document is the Phase 6.0 live contract map for `workbench-chart-runtime-v2`.
It is intentionally documentation-only.

Production behavior must remain owned by the current `WorkbenchContext.tsx`
pipeline until a reviewed staged cutover proves every live contract below. Runtime
v2 must not be connected to Chart context in Phase 6.0.

The baseline branch and commit for this map are:

- Branch: `new-workbench-chart-runtime-v2`
- Commit: `5d086cb2ee8d76f7d2b540066f986622fbab047f`

Primary sources:

- `frontend/src/shared/context/WorkbenchContext.tsx`
- `frontend/src/features/chart/ChartPanel.tsx`
- `frontend/src/features/workbenchChartRuntime/`
- `frontend/src/features/workbenchChartRuntime/runtimeOutputAdapter.ts`
- `docs/workbench-chart-runtime-analysis.md`
- Phase reports `phase2-skeleton.md`, `phase3a-market-identity-windows.md`,
  `phase3b-fetch-plan-loader-harness.md`, `phase3c-market-bundle-parity.md`,
  `phase4-display-render-viewport-parity.md`, `phase5-complexity-report.md`

## Non-Goals And Hard Stops

- Do not change production behavior.
- Do not connect runtime v2 to `WorkbenchChartContext`.
- Do not edit `WorkbenchContext.tsx` or `ChartPanel.tsx` for Phase 6.0.
- Do not repair or continue the failed Phase 6 cutover attempt.
- Do not add fallback from the old pipeline into v2.
- Do not create dual production owners.
- Do not start Phase 6.1, 6.2, or later implementation.
- Do not make code changes except documentation and `tasks.md`.

## Staged Rollout

| Stage | Name | Scope | Required stop condition |
|---|---|---|---|
| 6.0 | Live Contract Specification | Produce this contract map and staged rollout plan only. | Stop for review after validation, commit, and push. |
| 6.1 | Contract Tests And Static Guards | Add tests/guards that encode this document before any production cutover. Runtime v2 remains shadow/isolated. | Stop if any contract cannot be expressed without production wiring. |
| 6.2 | Runtime Output Stabilization | Make v2 output stable under isolated harnesses and debug snapshots, including no-op callbacks and stable identities. | Stop if output still churns for unchanged inputs. |
| 6.3 | Adapter-Only Cutover Candidate | Switch Chart context output through `runtimeOutputAdapter.ts` in one reviewed slice after 6.1-6.2 pass. | Stop if old and new owners are both active for any mutable domain. |
| 6.4 | Browser Smoke And Debug Evidence | Run all required browser smoke scenarios with debug snapshots and network/fetch-storm checks. | Stop on lag, duplicate fetch/apply loops, broken trade navigation, or broken pan. |
| 6.5 | Cutover Review Gate | Record complexity/ownership report and decide whether old provider runtime can be deleted in Phase 7. | Stop for review before deleting old `WorkbenchContext` chart runtime. |

## Contract Map Index

| # | Contract | Old production owner | Runtime v2 target owner | Adapter compatibility |
|---|---|---|---|---|
| 1 | ChartPanel renderer contract | `ChartPanel` + `WorkbenchContext` chart value | `runtimeOutputAdapter.ts`; renderer remains `ChartPanel` | Current `WorkbenchChartState` fields |
| 2 | Provider upstream shell/report/composer contract | `WorkbenchContext` shell/report/composer slices | `runtimeInputAdapter.ts` only | Provider-owned fields passed beside runtime output |
| 3 | Selection / selected trade / selected bar / focus intent contract | Provider selection state and `selectTrade()` | Provider selection glue + `ChartRuntimeInput.chartFocusIntent` + `viewportRuntime.ts` | selection fields and focus warning passthrough |
| 4 | Chart IO gate contract | `activeTab`, `hasChartEverActivated`, `chartHeavyIoEnabled` | `runtimeInputAdapter.ts` input consumed by loader/trace/aux modules | debug input only; no chart context output |
| 5 | Market identity/window/reset contract | provider market view/window state/effects | `marketViewRuntime.ts`, `marketWindowRuntime.ts` | debug window fields; later market output lineage |
| 6 | Market loader lifecycle contract | provider market load effect | `marketLoadRuntime.ts` | `market.status`, `market.error`, revisions/debug |
| 7 | Bundle/fallback/source/count contract | provider `cachedBundle` and bundle refs | `marketBundleRuntime.ts` | `candlesSource`, `marketCandlesCount`, `fullCandleRange` |
| 8 | Render-window transaction contract | provider `chartRuntimeRef.renderWindow` | `renderWindowRuntime.ts`, `chartWindowRuntime.ts` | `renderWindowShiftSeq`, `chartViewModel.seriesKey` |
| 9 | Interaction/pan/coverage expansion contract | `dispatchChartInteraction()`, `attemptMarketPanPrefetch()` | `interactionRuntime.ts`, `panRuntime.ts`, `marketWindowRuntime.ts` | `dispatchChartInteraction` maps to `interaction.dispatch` |
| 10 | Viewport command stream contract | provider viewport command state/callbacks | `viewportRuntime.ts` | `chartViewportCommand`, seq, ack/cancel/settle |
| 11 | Trace/bootstrap/display/cache contract | provider trace effect and display/session cache refs | `traceRuntime.ts`, `traceDisplayRuntime.ts` | lanes trace fields, display revisions, stale flags |
| 12 | Chart-events/dense fallback contract | provider trace effect chart-events branch | `chartEventsRuntime.ts`, `traceRuntime.ts`, `traceDisplayRuntime.ts` | model component events, lanes trace, trace debug keys |
| 13 | Aux/HTF overlays/context overlay contract | provider context/aux/HTF effects | `auxOverlayRuntime.ts`; context selector stays provider glue | context selector passthrough, display aux overlays, stale flag |
| 14 | `chartViewModel`/reference stability contract | provider `chartWindowSlice`, `chartView`, `buildChartViewModel()` | `chartWindowRuntime.ts`, `chartModelRuntime.ts` | `chartViewModel` plus legacy derived fields |
| 15 | Single-owner cutover contract | current provider owns all mutable chart domains | one runtime owner per domain after cutover | adapter mapping only, no lifecycle |

## Detailed Contract Tables

### 1. ChartPanel Renderer Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | The chart context value memo exposes renderer inputs and callbacks: `chartViewModel`, stale flags, marker preferences, market metadata, selection fields, lanes trace fields, context overlay fields, interaction dispatch, viewport command stream, and revisions. `ChartPanel` owns all Lightweight Charts imperative execution. |
| Old helper/functions/refs/effects | Provider: `buildChartViewModel()`, `chartValue`, `displayApplyRevision`, `renderWindowShiftSeq`, `dispatchChartInteraction`, `chartViewportCommand`, `acknowledgeChartViewportCommand`, `settleWindowSwapCommit`. Renderer: `createChart()`, `series.setData()`, aux EMA series management, marker builders, price lines, `executeViewportCommand()`, `createChartInteractionAdapter()`, programmatic suppression refs. |
| Old inputs | `chartViewModel`, `candlesSource`, `marketError`, `marketCandlesCount`, `timeframeMismatch`, `reportTimeframe`, `chartTimeframe`, selected variant/trade/bar state, marker toggles, context overlay selection, viewport command state, lanes trace state. |
| Old outputs consumed by `ChartPanel` | Candles/EMA/aux overlays/component events through `chartViewModel`; banners/hints through market and stale metadata; marker data through selected variant/trade plus model events; viewport commands through command/seq/callbacks; interaction bridge through `dispatchChartInteraction`. |
| Runtime v2 target owner module | Runtime owns data output only through `ChartRuntimeOutput`; renderer remains `ChartPanel`. Compatibility mapping belongs in `runtimeOutputAdapter.ts`. |
| Adapter compatibility field | `chartViewModel`, `htfAuxEmaOverlayStale`, `componentEventsStale`, `displayApplyRevision`, `renderWindowShiftSeq`, market fields, lanes trace fields, `viewport`, `interaction`, plus provider-owned UI/selection passthrough fields. |
| Exact no-op/stability rule | Before cutover, runtime v2 callbacks must be no-op and owner flags false. After cutover, unchanged runtime output must not change `chartViewModel.seriesKey`, command seq, revisions, or array references. ChartPanel must not see repeated `setData()` inputs for identical windows. |
| Tests before switch | `runtimeTypes.test.ts`, adapter compatibility tests proving legacy fields derive from one runtime output, `chartViewModel.test.ts`, `chartRenderWindowDisplay.test.ts`, `chartViewport.test.ts`, marker helper tests, provider integration tests that assert no duplicate model/status sources. |
| Browser smoke proof | Cold chart open with debug enabled: one coherent model lineage, stable hint text, no repeated `chart.setData.candles` churn, no `Market data unavailable` after ready. |
| Forbidden implementation shortcuts | Do not move Lightweight Charts calls into runtime. Do not edit `ChartPanel` to hide data churn. Do not derive legacy chart arrays separately from `chartViewModel`. Do not leave renderer data from old pipeline while status/commands come from v2. |

### 2. Provider Upstream Shell/Report/Composer Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Shell state, runs/report loading, and Composer state are provider-owned upstream glue. They are not chart runtime domains. |
| Old helper/functions/refs/effects | `activeTab`, `hasChartEverActivated`, `setActiveTab`, `fetchRunSummaries()`, `fetchRunReport()`, `reloadReport`, `refreshRunsAndSelectRun`, `fetchConfigState()`, `selectSavedConfig()`, `createBlankConfigDraft()`, shell/report/composer context memos. |
| Old inputs | `initialActiveTab`, API responses for runs/report/config, selected run id, reload token, Composer actions, user tab selection. |
| Old outputs consumed by `ChartPanel` | `reportTimeframe`, `timeframeMismatch`, selected variant/trade fields, context overlay selector metadata, and chart IO gate indirectly through chart data readiness. |
| Runtime v2 target owner module | `runtimeInputAdapter.ts` builds `ChartRuntimeInput`. Runtime v2 must consume upstream report/selection/gate values but must not own run, report, shell, or Composer lifecycle. |
| Adapter compatibility field | Provider-owned fields stay passed beside runtime output: marker preferences/setters, `selectedVariant`, `selectedTradeId`, `selectedBarTimeSec`, `selectTrade`, `selectBar`, context selector fields, report timeframe metadata. |
| Exact no-op/stability rule | Runtime v2 must not call `fetchRunSummaries()`, `fetchRunReport()`, config APIs, or `setActiveTab()` as data lifecycle. Re-rendering provider glue must not recreate runtime identities unless explicit upstream inputs change. |
| Tests before switch | `workbenchLoad.test.tsx` report-load/lazy IO cases, tests for run switch not refetching on variant switch, adapter input snapshot tests, static guard that runtime modules do not import report/config API functions. |
| Browser smoke proof | Start on non-Chart tab, switch to Chart. Report loads once, heavy chart IO starts only after Chart activation, Composer/report navigation remains unchanged. |
| Forbidden implementation shortcuts | Do not copy report loader or Composer refresh into runtime. Do not let runtime select runs or tabs. Do not use report reload as a workaround for chart state reset. |

### 3. Selection / Selected Trade / Selected Bar / Focus Intent Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider owns `selectedVariantKey`, `selectedTradeId`, `selectedBarTimeSec`, selected variant derivation, default trade selection, selected-trade validation, and the mixed `selectTrade()` callback. |
| Old helper/functions/refs/effects | `defaultClosedTradeSelection()`, `deriveSelectedVariant()`, `resolveVariantKeyForReport()`, `resolveSelectedTradeEntryTimeMs()`, `resolveTradeEntryTimeMs()`, `findTradeById()`, `tradeIdsEqual()`, `isTradeInVariant()`, `applyTradeFocusSelection()`, `selectedTradeResolution`, `selectedVariantKeyRef`, `selectedTradeIdRef`, `prevVariantKeyRef`, `prevRunIdForTradeBootstrapRef`, `skipTradeWindowRebuildRef`, `selectTrade()`, `selectBar()`. |
| Old inputs | report variants/trade records, user variant selection, user report/chart trade selection, chart click/bar selection, default selection on run/variant changes. |
| Old outputs consumed by `ChartPanel` | `selectedVariant`, `selectedTradeId`, `selectedBarTimeSec`, `chartTradeFocusWarning`, `selectTrade`, `selectBar`, and trade focus side effects that currently emit viewport commands. |
| Runtime v2 target owner module | Provider remains selection owner. `runtimeInputAdapter.ts` passes `selectedTradeEntryTimeMs` and an explicit `chartFocusIntent`. `viewportRuntime.ts` becomes viewport policy owner after cutover. |
| Adapter compatibility field | Selection fields remain provider passthrough; runtime output supplies viewport command only after cutover. |
| Exact no-op/stability rule | There must be exactly one focus intent per default/user trade selection. Before cutover, v2 focus intent must be debug-only/no-op. After cutover, `selectTrade()` may mutate selection, bar, tab, and marker preferences, but viewport focus must be emitted through the single v2 command stream. |
| Tests before switch | `tradeLookup.test.ts`, `ChartTradeFocusNav.test.tsx`, `tradeManagementChartEvents.test.ts`, provider distant trade tests, new split-selection-vs-focus-intent tests. |
| Browser smoke proof | Select a distant trade from Reports or chart nav. Chart centers the selected trade, selected marker is visible, selected bar updates, trade-management toggles still auto-enable when applicable. |
| Forbidden implementation shortcuts | Do not let runtime own report selection state. Do not dispatch `trade_selected` to old and new runtimes. Do not keep old `selectTrade()` viewport side effect active after v2 owns viewport commands. |

### 4. Chart IO Gate Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider derives `chartHeavyIoEnabled` from `activeTab === "chart" || hasChartEverActivated`. |
| Old helper/functions/refs/effects | `activeTab`, `hasChartEverActivated`, activation effect, market load effect gate, aux EMA effect gate, signal trace effect gate, debug mark `wb.chart_heavy_io.blocked_until_activation`. |
| Old inputs | Initial active tab and subsequent tab switches. |
| Old outputs consumed by `ChartPanel` | Not directly consumed as a field; visible effect is that market/trace/aux data remain unavailable until Chart activation and then load. |
| Runtime v2 target owner module | `runtimeInputAdapter.ts` passes `chartHeavyIoEnabled`; consumers are `marketLoadRuntime.ts`, `traceRuntime.ts`, and `auxOverlayRuntime.ts`. |
| Adapter compatibility field | Debug snapshot field `chartHeavyIoEnabled`; no new public chart context field required. |
| Exact no-op/stability rule | With gate false, runtime v2 must not perform market fetch, trace/chart-events fetch, aux overlay fetch, cache writes, or viewport commands. With gate true, the gate must remain true after first activation and must not toggle on ordinary provider re-renders. |
| Tests before switch | `workbenchLoad.test.tsx` lazy chart IO tests, runtime loader/trace tests with gate false, static guard against API calls when gate false. |
| Browser smoke proof | Open app on Composer/Reports, watch debug/network until Chart tab is activated. No market/trace/aux fetch before activation; data appears after switch. |
| Forbidden implementation shortcuts | Do not start hidden preloads to make Chart feel faster. Do not use ChartPanel mount as a substitute for provider gate. Do not let trace/aux fetch ignore the gate while market respects it. |

### 5. Market Identity/Window/Reset Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider owns `intendedRunMarketView`, `expectedRunMarketViewIdentity`, `runMarketViewIdentity`, `marketFocusWindow`, `marketCoverageWindow`, window keys, and reset refs. |
| Old helper/functions/refs/effects | `resolveRunMarketView()`, `buildRunMarketViewIdentity()`, `resolveMarketTargetWindow()`, `buildMarketTargetWindowKey()`, `marketFocusWindowRef`, `marketCoverageWindowRef`, `intendedRunMarketViewRef`, `intendedRunMarketViewIdentityRef`, `marketReadyTargetKeyRef`, pan/fallback reset refs, focus/coverage reset effect. |
| Old inputs | ready report, selected run id, selected variant, chart timeframe, reload token, selected trade entry time. |
| Old outputs consumed by `ChartPanel` | Indirectly through market status/source/count/range, `chartViewModel`, trace bootstrap readiness, and range warnings. |
| Runtime v2 target owner module | `marketViewRuntime.ts` and `marketWindowRuntime.ts`. |
| Adapter compatibility field | Debug snapshot fields `marketIdentity`, `expectedMarketIdentity`, focus/coverage windows and keys; later market output lineage through `market`. |
| Exact no-op/stability rule | Identity string and window keys must exactly match the old helper output. Focus changes reset ready/log/fallback refs; coverage expansion must not reset selected trade focus. Before cutover these calculations remain shadow-only and must not mutate provider windows. |
| Tests before switch | `marketPhase3aRuntime.test.ts`, `runMarketView.test.ts`, `marketWindowPlanner.test.ts`, old-vs-new debug comparison tests with zero unexplained differences. |
| Browser smoke proof | Variant switch and selected distant trade show matching market identity/window debug snapshots and do not refetch report. |
| Forbidden implementation shortcuts | Do not invent identity string formats. Do not collapse focus and coverage into one mutable window. Do not retain coverage across run/variant/focus changes. |

### 6. Market Loader Lifecycle Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider market load effect owns status/error, generation, aborts, in-flight dedupe, ready identity, and revision bumps. |
| Old helper/functions/refs/effects | `executeMarketWindowLoad()`, `marketCandlesReadyForTarget()`, `marketLoadGenRef`, `marketFetchInFlightKeysRef`, `marketReadyTargetKeyRef`, `bumpMarketCandlesRevision()`, `bumpMarketOverlayRevision()`, abort cleanup, stale response debug marks. |
| Old inputs | ready report, selected variant, chart timeframe, reload token, chart IO gate, focus/coverage windows and keys. |
| Old outputs consumed by `ChartPanel` | `marketLoadStatus`, `marketError`, `candlesSource`, `marketCandlesCount`, `fullCandleRange`, and final chart data after cache revisions. |
| Runtime v2 target owner module | `marketLoadRuntime.ts`; loader execution before cutover is allowed only in isolated harnesses. |
| Adapter compatibility field | `runtime.market.status`, `runtime.market.error`, debug fetch plan/revision lineage. |
| Exact no-op/stability rule | Before cutover, production-mounted v2 must not call market APIs or write `marketResourceCache`. After cutover, focus-candle readiness may promote `ready`; EMA chunks may continue through overlay revisions without blanking the chart. |
| Tests before switch | `marketPhase3bFetchPlanLoader.test.ts`, `workbenchMarketLoad.test.ts`, `marketResourceCache.test.ts`, duplicate in-flight key tests, abort/stale response tests, single-loader guard tests. |
| Browser smoke proof | Cold chart open and pan expansion show one authorized market fetch per key, no duplicate `/market/*-window` calls, ready only after focus candles exist. |
| Forbidden implementation shortcuts | Do not keep old provider loader as fallback. Do not run v2 loader in production before cutover. Do not create a second cache or ignore in-flight keys. |

### 7. Bundle/Fallback/Source/Count Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider owns `cachedBundle`, focus fallback tracking, candle snapshots, full candle range, market candle count, source, and render-window foundation key. |
| Old helper/functions/refs/effects | `composeDisplayMarketWindowBundle()`, `getCandles()`, `marketCandlesReadyForTarget()`, `candleRangeMs()`, `cachedBundleCandlesRef`, `marketComposeSourceRef`, `prevBundleFirstTimeSecRef`, `lastComposeFallbackKeyRef`, `renderWindowFoundationKey`, bundle ready/fallback effects. |
| Old inputs | `RunMarketView`, focus/coverage windows, cache revisions, market status, focus/coverage keys. |
| Old outputs consumed by `ChartPanel` | `candlesSource`, `marketCandlesCount`, `fullCandleRange`, `chartViewModel.candles`, hint text and range warning behavior. |
| Runtime v2 target owner module | `marketBundleRuntime.ts`. |
| Adapter compatibility field | `runtime.market.candlesSource`, `runtime.market.candlesCount`, `runtime.market.fullCandleRange`, debug `displayBundle.source/count/range`. |
| Exact no-op/stability rule | If coverage is incomplete but focus is ready, keep focus bundle visible and report source `market`. Do not produce empty chart data while market is ready. Foundation key changes only when focus key or focus candle count changes. |
| Tests before switch | `marketPhase3cBundleParity.test.ts`, `runMarketView.test.ts`, provider no-empty-gap integration tests, adapter market field derivation tests. |
| Browser smoke proof | During left/right pan coverage expansion, chart remains visible with focus fallback until coverage catches up; no empty gaps after ready. |
| Forbidden implementation shortcuts | Do not replace focus fallback with "loading" empty data. Do not recompute `candlesSource` independently from the bundle. Do not use partial bundle composition as an implicit fallback unless reviewed. |

### 8. Render-Window Transaction Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider owns `chartRuntimeRef.renderWindow`, mutable manager, render-window init/rebuild, prepend offset, shift commit, `renderWindowRevision`, and `renderWindowShiftSeq`. |
| Old helper/functions/refs/effects | `createChartRuntime()`, `ChartDataWindowManager`, `renderWindowManager()`, `findBarIndexAtOrBefore()`, `applyRenderWindowForTrade()`, `applyWindowCommit()`, `cachedBundleCandlesRef`, `prevBundleFirstTimeSecRef`, `applyWindowCommitRef`, `renderWindowShiftSeqRef`, init/selected-trade/prepend effects. |
| Old inputs | display bundle candles, render foundation key, selected trade entry time, market status, visible range commit, current context/run/variant. |
| Old outputs consumed by `ChartPanel` | `chartViewModel.seriesKey`, sliced candles/EMA/aux data, `renderWindowShiftSeq`, viewport restore command payloads. |
| Runtime v2 target owner module | `renderWindowRuntime.ts` and `chartWindowRuntime.ts`. |
| Adapter compatibility field | `runtime.display.renderWindowShiftSeq`, `runtime.chartViewModel.seriesKey`, debug render window bounds. |
| Exact no-op/stability rule | Window indices must stay inside current bundle, and prepend offset must preserve visible data. `renderWindowShiftSeq` is monotonic only on committed shifts. Before cutover, v2 must not receive live ChartPanel interaction dispatch as a second manager. |
| Tests before switch | `displayRenderViewportParity.test.ts`, `renderWindowController.test.ts`, `chartDataWindowManager.test.ts`, `chartViewWindow.test.ts`, shift/restore integration tests. |
| Browser smoke proof | Pan left/right near boundaries: window shifts smoothly, restore applies once, no teleport, no stuck `applying_shift`. |
| Forbidden implementation shortcuts | Do not replace bounded render window with full bundle rendering. Do not instantiate two active managers for the same events. Do not bump shift seq to force ChartPanel effects. |

### 9. Interaction/Pan/Coverage Expansion Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider owns `dispatchChartInteraction()` and `attemptMarketPanPrefetch()`, fed by `ChartPanel` interaction adapter. |
| Old helper/functions/refs/effects | `chartRuntimeRef.current.dispatchInteraction()`, `evaluateMarketPanPrefetchExpansion()`, `lastPanPrefetchLogKeyRef`, `lastPanPrefetchExpansionKeyRef`, `lastVisiblePrefetchSampleRef`, `chartViewCandlesRef`, `marketCoverageWindowRef`, `windowSwapCancelledThroughIdRef`, pointerdown command clearing. |
| Old inputs | pointer/wheel/programmatic/visible-range/resize events, visible logical range, current render-window candles, report bounds, coverage window, timeframe, chart IO gate, render interaction state. |
| Old outputs consumed by `ChartPanel` | `dispatchChartInteraction` callback and resulting viewport/render/pan behavior visible through data shifts and commands. |
| Runtime v2 target owner module | `interactionRuntime.ts`, `panRuntime.ts`, and coverage intent handling in `marketWindowRuntime.ts`. |
| Adapter compatibility field | Current `dispatchChartInteraction` maps to `runtime.interaction.dispatch` after cutover. |
| Exact no-op/stability rule | Programmatic viewport events must be marked/suppressed and must not count as user pan. Identical visible samples or expansion keys must no-op. Before cutover, v2 interaction dispatch remains no-op in production. |
| Tests before switch | `displayRenderViewportParity.test.ts`, `viewportController.test.ts`, `chartViewport.test.ts`, pan prefetch tests in `workbenchMarketLoad.test.ts`, new programmatic suppression integration test. |
| Browser smoke proof | Apply viewport focus/restore and confirm debug shows programmatic suppression, then manually pan left/right and confirm one expansion decision per new edge. |
| Forbidden implementation shortcuts | Do not update coverage directly from ChartPanel. Do not treat all visible range changes as user pan. Do not hide repeated pan decisions with debounce-only fixes. |

### 10. Viewport Command Stream Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider owns viewport command state, seq, command filtering, transaction ids, cancellation, acknowledgement, and settle callback. ChartPanel executes commands. |
| Old helper/functions/refs/effects | `emitChartViewportCommand()`, `acknowledgeChartViewportCommand()`, `isWindowSwapTransactionCancelled()`, `settleWindowSwapCommit()`, `canEmitTradeFocus()`, `chartViewportCommand`, `chartViewportCommandSeq`, `windowSwapTransactionIdRef`, `windowSwapCancelledThroughIdRef`, `chartRuntimeRef.current.viewport`. |
| Old inputs | trade focus commands, trace-ready viewport commands, window swap commits, pointerdown cancellation, ChartPanel ack/settle. |
| Old outputs consumed by `ChartPanel` | `chartViewportCommand`, `chartViewportCommandSeq`, `acknowledgeChartViewportCommand`, `isWindowSwapTransactionCancelled`, `settleWindowSwapCommit`. |
| Runtime v2 target owner module | `viewportRuntime.ts`. |
| Adapter compatibility field | Current command/seq/callback fields derive from `runtime.viewport`. |
| Exact no-op/stability rule | There is one visible command stream. Same-shaped commands require seq increments only when they are intentionally re-emitted. Ack clears only current command. Restore-after-window-swap must check both shift seq and transaction cancellation. |
| Tests before switch | `viewportController.test.ts`, `displayRenderViewportParity.test.ts`, adapter command stream tests, ChartPanel viewport helper tests. |
| Browser smoke proof | Distant trade focus and pan restore both apply once; pointerdown during restore cancels stale restore and does not snap back. |
| Forbidden implementation shortcuts | Do not expose two command streams. Do not make ChartPanel choose between old and new commands. Do not ignore `canEmitTradeFocus()` to force navigation. |

### 11. Trace/Bootstrap/Display/Cache Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider owns trace bootstrap, dense lanes state, request coordinator, session cache, display cache, display apply lifecycle, stale retention, and trace scheduling tick. |
| Old helper/functions/refs/effects | `evaluateSignalTraceBootstrap()`, `decideSignalTraceLoad()`, `planTraceDisplayLoad()`, `createSignalTraceRequestCoordinator()`, `createSignalTraceBundleSessionCache()`, `createSignalTraceDisplayCache()`, `planMissingTraceDisplayChunkFetch()`, `mergeDisplayChunkFromResponse()`, `deriveTraceDisplayStateForCandles()`, `shouldRetainPreviousTraceDisplay()`, `signalTraceDisplayCacheRef`, `signalTraceBundleSessionCacheRef`, `traceLoadGenerationRef`, `applyTraceDisplayRef`, main trace effect and cache reset effects. |
| Old inputs | report/run/variant, chart IO gate, market ready identity, expected market identity, chart window key, render-window bounds/candles, context overlay ref, cache coverage, pan scheduling state. |
| Old outputs consumed by `ChartPanel` | `lanesSignalTrace`, `lanesSignalTraceStatus`, `lanesSignalTraceError`, `chartViewModel.componentEvents`, trace display status/missing range, `displayApplyRevision`, `componentEventsStale`, HTF display slices. |
| Runtime v2 target owner module | `traceRuntime.ts` and `traceDisplayRuntime.ts`. |
| Adapter compatibility field | `runtime.trace.*`, `runtime.display.displayApplyRevision`, `runtime.display.componentEventsStale`, model trace display fields, debug trace request keys/status. |
| Exact no-op/stability rule | Before cutover, production v2 must not merge into production trace display/session caches or issue trace network requests. After cutover, display cache key must reset on run/variant/context/reload, stale display may be retained only under the old retention rules, and dense lanes must be exposed only for matching `chartWindowKey`. |
| Tests before switch | `traceEventsOverlaysParity.test.ts`, `signalTraceDisplayCache.test.ts`, `traceDisplayApplyLifecycle.test.ts`, `workbenchTraceNetworkLoad.test.ts`, `signalTraceRequestCoordinator.test.ts`, run-switch provider tests. |
| Browser smoke proof | Context switch and run/variant switch show trace cache reset, no stale component events as current, lanes status scoped to current window. |
| Forbidden implementation shortcuts | Do not create a second display cache or session cache in production. Do not skip bootstrap identity checks. Do not clear stale display just to avoid old events unless tests prove equivalent UX. |

### 12. Chart-Events/Dense Fallback Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider main trace effect owns chart-events feature flag path, dense fallback path, coordinator keys, display merge decisions, and lanes fetch decisions. |
| Old helper/functions/refs/effects | `isChartEventsApiEnabled()`, `buildDisplayTraceRequestKey()`, `buildTraceRequestKey()`, `loadDisplayTraceChunk()`, `loadDenseLanesTrace()`, `mapDisplayLoadOutcome()`, `mergeDisplayFromDenseFallback()`, `decideDenseLanesNetworkLoad()`, coordinator in-flight/merged/failed ledgers. |
| Old inputs | chart-events flag, trace request params, display cache coverage, lanes readiness/session cache, context overlay ref, current render-window bounds. |
| Old outputs consumed by `ChartPanel` | Component events in `chartViewModel`, trace display status/missing range, lanes trace/status/error, HTF display from merged display cache. |
| Runtime v2 target owner module | `chartEventsRuntime.ts`, `traceRuntime.ts`, and `traceDisplayRuntime.ts`. |
| Adapter compatibility field | `chartViewModel.componentEvents`, `runtime.trace`, debug `traceRequests.displayKey/denseKey`, counts for component events. |
| Exact no-op/stability rule | With chart-events enabled, successful display merge may update events before dense lanes completes. If chart-events fails or is disabled, dense fallback must fill display once. Disabled mode must not call `/chart-events`. |
| Tests before switch | `chartEventsRunSwitch.test.tsx`, `chartEventsDistantTradeDisplay.test.tsx`, `chartEventsDisplayLoad.test.tsx`, `workbenchTraceNetworkLoad.test.ts`, `traceEventsOverlaysParity.test.ts`. |
| Browser smoke proof | Run once with chart-events enabled and once disabled. Enabled success shows events without duplicate markers; disabled path shows dense fallback and no `/chart-events` requests. |
| Forbidden implementation shortcuts | Do not collapse display and dense request keys. Do not require dense success for already committed chart-events display. Do not let chart-events 404 from an old run surface as current. |

### 13. Aux/HTF Overlays/Context Overlay Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider owns context overlay selector state/defaulting, aux EMA spec derivation, BFF aux EMA fetch, HTF trace overlay slicing/fallback, frozen HTF storage, and stale flag. |
| Old helper/functions/refs/effects | `strategyContextRefOptions()`, `defaultChartContextOverlayRef()`, `anchorStackPeriodsFromStrategySpec()`, `collectAuxEmaSpecs()`, `fetchChartOverlayEma()`, `auxOverlayFromHtfSlice()`, `auxOverlayFromHtfTrace()`, `mergeAuxOverlayPoints()`, `displayAuxOverlaysForRenderWindow()`, `frozenHtfOverlaysForStorage()`, `contextOverlayRef`, `effectiveContextOverlayRef`, `lastSlicedHtfOverlaysRef`, aux BFF effect, HTF fallback effect. |
| Old inputs | selected variant strategy spec, chart timeframe, effective context overlay ref, report symbol/range, market ready status, trace display HTF slice, dense trace fallback. |
| Old outputs consumed by `ChartPanel` | `contextOverlayRefOptions`, `effectiveContextOverlayRef`, `setContextOverlayRef`, `chartViewModel.displayAuxEmaOverlays`, `htfAuxEmaOverlayStale`, hint text and aux series rendering. |
| Runtime v2 target owner module | `auxOverlayRuntime.ts`; context selector UI state remains provider glue and is passed through input adapter. |
| Adapter compatibility field | Context selector fields remain provider passthrough; runtime output supplies `chartViewModel.displayAuxEmaOverlays` and `overlays.htfAuxEmaOverlayStale`. |
| Exact no-op/stability rule | Context overlay switch must invalidate trace/chart-events/HTF data but must not refetch market candles solely for context. BFF aux and HTF trace overlays remain distinct sources. Frozen HTF overlays may display while current trace reloads and must become stale, not current. |
| Tests before switch | `traceEventsOverlaysParity.test.ts`, `chartRenderWindowDisplay.test.ts`, HTF context overlay spec tests in provider integration, aux overlay runtime tests, context selector reset tests. |
| Browser smoke proof | On a variant with `strategy.contexts`, switch context overlay. Candles stay stable, trace/events/HTF reload for selected context, dashed HTF lines come from trace/chart-events `htf_context`. |
| Forbidden implementation shortcuts | Do not use BFF chart overlay EMA as HTF context overlay. Do not make context selector state runtime-owned. Do not clear HTF overlays permanently during reload to hide stale-state bugs. |

### 14. `chartViewModel` / Reference Stability Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Provider owns `chartWindowSlice`, `chartView`, `chartDisplayAuxEmaOverlays`, `componentEventsStale`, and `chartViewModel` memo. |
| Old helper/functions/refs/effects | `buildRenderWindowBoundsKey()`, `buildEmaOverlaysStabilizeKey()`, `buildAuxOverlaysStabilizeKey()`, `stabilizeByWindowBoundsKey()`, `displayAuxOverlaysForRenderWindow()`, `buildChartViewModel()`, `chartCandlesCacheRef`, `chartEmaCacheRef`, `chartAuxEmaCacheRef`, `chartViewCandlesRef`. |
| Old inputs | cached bundle slice, render-window revision, market identity, aux overlays, display aux overlays, component events, stale flags, trace display state, selected trade entry time. |
| Old outputs consumed by `ChartPanel` | `chartViewModel.candles`, `emaOverlays`, `displayAuxEmaOverlays`, `componentEvents`, `seriesKey`, view mode/center/range/count, trace display status/missing range. |
| Runtime v2 target owner module | `chartWindowRuntime.ts` and `chartModelRuntime.ts`. |
| Adapter compatibility field | `chartViewModel` is authoritative; `chartCandles`, `chartEmaOverlays`, `chartAuxEmaOverlays`, `chartDisplayAuxEmaOverlays`, `chartViewMode`, `chartViewCenterTimeSec`, `chartViewFirstTimeSec`, `chartViewLastTimeSec`, `chartViewCount` are temporary derived compatibility fields. |
| Exact no-op/stability rule | `seriesKey` changes only when the rendered candle bounds/mode/count identity changes. Arrays are stable for unchanged bounds and overlay fingerprints. Compatibility fields must derive from the same model/output, not from old provider memos. |
| Tests before switch | `chartViewModel.test.ts`, `chartRenderWindowDisplay.test.ts`, `chartDataWindowManager.test.ts`, runtime chart model parity tests, adapter reference-stability tests. |
| Browser smoke proof | Pan, trace display apply, and context overlay switch update only the necessary series/markers; no repeating `setData` loop for unchanged `seriesKey`. |
| Forbidden implementation shortcuts | Do not rebuild every array on every render. Do not keep old `chartView` as a hidden source after runtime model is active. Do not introduce new model keys that force ChartPanel redraw storms. |

### 15. Single-Owner Cutover Contract

| Field | Contract |
|---|---|
| Old owner in `WorkbenchContext.tsx` | Current provider owns market windows, market load/cache write timing, bundle composition, pan, render-window, viewport commands, trace display cache, dense lanes trace, chart-events/component events, aux/HTF overlays, final chart model, and broad chart context output. |
| Old helper/functions/refs/effects | All owner refs/effects listed in contracts 1-14, especially `marketCoverageWindow`, `executeMarketWindowLoad`, `chartRuntimeRef`, `chartViewportCommand`, `signalTraceDisplayCacheRef`, `signalTraceBundleSessionCacheRef`, `auxEmaOverlays`, and `buildChartViewModel()`. |
| Old inputs | Complete provider shell/report/selection/chart state and ChartPanel interactions. |
| Old outputs consumed by `ChartPanel` | The entire current `useWorkbenchChart()` renderer contract. |
| Runtime v2 target owner module | After cutover, one owner per domain: `marketWindowRuntime`, `marketLoadRuntime`, `marketBundleRuntime`, `interactionRuntime`, `panRuntime`, `renderWindowRuntime`, `viewportRuntime`, `traceRuntime`, `traceDisplayRuntime`, `chartEventsRuntime`, `auxOverlayRuntime`, `chartWindowRuntime`, `chartModelRuntime`. Provider remains shell/report/Composer/selection glue plus adapters only. |
| Adapter compatibility field | `runtimeOutputAdapter.ts` maps one `ChartRuntimeOutput` plus provider UI/selection glue into the existing chart context shape. It must not own lifecycle, fetch, cache, or controller state. |
| Exact no-op/stability rule | Before cutover, all runtime v2 production owner flags are false and live callbacks are no-op. At cutover, each mutable domain switches to one v2 owner in one reviewed slice. Old provider owner code must not stay active as fallback or parallel source. |
| Tests before switch | Static no-dual-owner guards, adapter side-effect/import guards, duplicate market/trace fetch tests, command stream single-owner tests, full runtime targeted test suite, provider integration suite. |
| Browser smoke proof | Full Phase 6.4 smoke pack: cold open, tab activation, distant trade, pan left/right, variant switch, context overlay switch, chart-events enabled/disabled, markers/events/trace, no empty gaps, no fetch storm, no programmatic viewport pan. |
| Forbidden implementation shortcuts | Do not wire v2 behind a fallback to old provider data. Do not let `ChartPanel` choose owner by field availability. Do not leave old owner effects dormant but still imported/callable after cutover. Do not call the provider "glue" until old chart runtime ownership is physically removed. |

## Phase 6.0 Acceptance

- This document is the complete contract map for live cutover planning.
- Phase 6.1-6.5 are staged and unstarted.
- Each contract names the old owner, old helpers/refs/effects, old inputs,
  ChartPanel-consumed outputs, v2 target module, compatibility field,
  no-op/stability rule, required tests, browser smoke proof, and forbidden shortcuts.
- No runtime/code behavior changes are included in Phase 6.0.
- `openspec validate "workbench-chart-runtime-v2" --strict` must pass before review.

