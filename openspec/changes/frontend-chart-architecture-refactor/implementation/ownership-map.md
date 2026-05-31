# Chart runtime ownership map (pre-cutover)

## Workbench shell (stays — inputs only)

**File:** `frontend/src/shared/context/WorkbenchContext.tsx`

| Responsibility | Notes |
|----------------|-------|
| Run list / selection | `fetchRunSummaries`, `selectedRunId` |
| Report load | `fetchRunReport`, variant selection, metrics/diagnostics exposure |
| Composer/config tab | unrelated to chart runtime |
| Market bundle cache identity | `marketDataCache`, `fetchChartMarketBundle` |
| BFF aux EMA fetch | `fetchChartOverlayEma` for exit-rule overlays |
| Selected trade / bar / context overlay ref | user selection state |
| Expose chart UI state | `chartCandles`, overlays, trace bundles, lanes, inspector inputs |

**Must stop owning after cutover:** render-window shift on pan, viewport restore/focus policy, trace fetch scheduling from pan/key churn.

---

## Current `WorkbenchContext` chart-runtime ownership (move out)

| Area | Mechanism | Target controller |
|------|-----------|-------------------|
| Render window indices | `renderWindowManagerRef` + `createChartDataWindowManager` | `RenderWindowController` |
| Immediate pan shift | `onRenderWindowShiftRequest` → `maybeShiftWindowForVisibleRange` + `bumpRenderWindow` | `RenderWindowController` (pending + commit) |
| Pending restore payload | `setPendingViewportRestore` state | `RenderWindowController` + `ViewportController` |
| `chartWindowKey` / bounds | `renderWindowBounds`, `chartWindowKey` memo | `RenderWindowController` committed revision |
| Trace bootstrap/fetch | `evaluateSignalTraceBootstrap`, `decideSignalTraceLoad`, `fetchSignalTrace` effect | `TraceDisplayController` (committed window only) |
| Display cache merge/slice | `applyTraceDisplayForCurrentWindow`, display cache refs | `TraceDisplayController` |
| Session bundle cache | `signalTraceBundleSessionCacheRef` | `TraceDisplayController` |
| Chart slice to props | `chartWindowSlice`, `chartView` memos | `ChartViewModel` builder |
| Trade window rebuild | `applyRenderWindowForTrade` | `RenderWindowController` + `ViewportController` |

---

## Current `ChartPanel` ownership (thin renderer after cutover)

**File:** `frontend/src/features/chart/ChartPanel.tsx`

| Responsibility | Mechanism | After cutover |
|----------------|-----------|---------------|
| LWC instance, series, markers | refs + effects | **ChartRenderer** (keep) |
| setData candles/EMA/aux | `useLayoutEffect` | **ChartRenderer** (apply view-model) |
| Viewport plan + RAF apply | `viewportPlanRef`, `scheduleViewportApply`, `applyViewportFromPlan` | **ViewportController** emits command; renderer executes |
| Pan → shift | `subscribeVisibleLogicalRangeChange` + debounce → `onRenderWindowShiftRequest` | **InteractionAdapter** → events; no shift decision in panel |
| Post-shift restore | `restoreVisibleRangeAfterWindowShift` in layout effect | execute **ViewportController** `restoreAfterWindowSwap` command |
| Trade focus gating | `userPanActiveRef`, `shouldScheduleTradeViewportApply` | **ViewportController** FSM |
| Policy guards | `pendingViewportRestoreRef`, `viewportCommandSeqRef`, stale RAF skips | remove as policy owners; renderer plumbing only if needed |

---

## New modules (source of truth)

| Module | Owns |
|--------|------|
| `runtime/interactionAdapter.ts` | Normalize pointer/wheel/programmatic/range-change → controller events |
| `runtime/renderWindowController.ts` | `committedWindow`, `pendingShift`, interaction state, safe-zone intent, commit policy |
| `runtime/viewportController.ts` | Viewport FSM, sole emitter of viewport commands |
| `runtime/traceDisplayOrchestrator.ts` | Committed-window cache coverage, fetch coalescing, strict idle-only prefetch |
| `runtime/chartViewModel.ts` | Pure projection: candles, EMA, trades, events, HTF, flags |
| `runtime/chartRuntime.ts` | Wire controllers; single orchestration entry for Workbench |

---

## Unchanged layers (by design)

- `data_engine/` — not touched
- `research/` strategy / signal trace semantics — not touched
- `research_api/` trace calculation — not touched
- Existing caches: `marketDataCache`, `signalTraceDisplayCache`, `signalTraceBundleSessionCache` — reused, ownership of *when* to read/write moves to controllers
