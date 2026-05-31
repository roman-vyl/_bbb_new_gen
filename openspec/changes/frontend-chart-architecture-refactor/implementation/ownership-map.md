# Chart runtime ownership map (post-cutover v1)

**Status:** Delivered on branch `BIG-frontend-refactoring`. Manual acceptance (§9) and baseline (0.4) confirmed.

This map describes **actual code**, not the full target from `design.md` Decision 1. v1 moved **orchestration decisions** into `frontend/src/features/chart/runtime/`; **data loading and React wiring** remain in `WorkbenchContext`.

## Logical roles vs physical modules

| Design / proposal name | v1 implementation | Notes |
|------------------------|-------------------|--------|
| `RenderWindowController` | `runtime/renderWindowController.ts` | Source of truth for pan FSM, pending/commit |
| `ViewportController` | `runtime/viewportController.ts` | Sole viewport **policy**; commands executed in ChartPanel |
| `TraceDisplayController` | `runtime/traceDisplayOrchestrator.ts` + Workbench effect | Policy helpers + fetch/merge **effect** in shell |
| `ChartViewModel` | `runtime/chartViewModel.ts` (`buildChartViewModel`) | Built in Workbench; ChartPanel consumes `chartViewModel` |
| `ChartRenderer` | `ChartPanel.tsx` | LWC adapter: setData, markers, execute commands |
| `RunDataController` | `WorkbenchContext` | Run/report/variant/trade selection — unchanged location |
| `MarketDataStore` | `WorkbenchContext` + `marketDataCache` | Bundle fetch/cache identity — unchanged location |

Future work may extract shell rows into dedicated modules; **behavioral contracts** for chart runtime are already controller-owned.

---

## `chartRuntime.ts` (orchestration entry)

**File:** `frontend/src/features/chart/runtime/chartRuntime.ts`

| Owns |
|------|
| `dispatchInteraction` → render window + viewport side effects |
| `setViewportPlan` from chart view mode |
| `onWindowSwapCommitted` viewport command |
| `reset` on run/variant change |

**Workbench** holds `chartRuntimeRef`, calls runtime, exposes `dispatchChartInteraction`, `chartViewportCommand`, `settleWindowSwapCommit`.

---

## `WorkbenchContext.tsx` (shell + IO)

**Still owns (by design for v1):**

| Area | Mechanism |
|------|-----------|
| Run list / selection | `fetchRunSummaries`, `selectedRunId` |
| Report load | `fetchRunReport`, variant selection, diagnostics |
| Market bundle | `marketDataCache`, `fetchChartMarketBundle`, `chartWindowSlice` (aux via `buildAuxOverlaysStabilizeKey`) |
| Trace network IO | `fetchSignalTrace` effect, `decideSignalTraceLoad`, session/display caches |
| Trace display apply | `applyTraceDisplayForCurrentWindow`, `finalizeTraceDisplayUpdate` |
| View-model build | `buildChartViewModel` → context `chartViewModel` |
| Legacy-compatible props | `chartCandles`, lanes trace, inspector inputs |

**No longer owns (moved to runtime):**

| Removed / demoted |
|-------------------|
| Immediate pan shift from ChartPanel (`onRenderWindowShiftRequest`) |
| Viewport policy refs (`pendingViewportRestoreRef`, `viewportPlanRef`, trade-focus effect as owner) |
| Renderer-side shift/fetch/focus/restore **decisions** |

**Trace scheduling path:** `evaluateSignalTraceBootstrap` → `planTraceDisplayLoad` → `decideSignalTraceLoad` → fetch or cache hit. `previousChartWindowKeyRef` updates only on committed plans (not pan-block/superseded).

---

## `ChartPanel.tsx` (thin renderer)

| Responsibility | Mechanism |
|----------------|-----------|
| LWC instance, series, markers | refs + layout effects |
| Apply view-model | `chartViewModel` from context (candles, EMA, aux, events) |
| Execute viewport commands | `chartViewportCommand` + `executeViewportCommand` |
| Emit interaction events | `interactionAdapter` → `dispatchChartInteraction` |
| Window-swap atomic setData | `atomicShiftSeriesKeyRef`, `settleWindowSwapCommit` |

**Plumbing only (not policy):**

- `isApplyingViewportRef`, `suppressPanShiftUntilRef` — suppress programmatic range feedback during restore/setData

**Does not:** decide shift, schedule trace fetch, emit focus/restore policy.

---

## `chartRenderWindowDisplay.ts` (display slice helpers)

| Owns |
|------|
| `displayAuxOverlaysForRenderWindow` — BFF aux + HTF/frozen re-slice to render candles |
| `buildAuxOverlaysStabilizeKey` — aux stabilize fingerprint (prevents stale empty HTF after trace merge) |
| `displayComponentEventsForRenderWindow`, `candleTimeBounds`, `stabilizeByWindowBoundsKey` |

Used from `WorkbenchContext` for `chartDisplayAuxEmaOverlays` and `chartWindowSlice.auxEmaOverlays`.

---

## Runtime modules (decision source of truth)

| Module | Owns |
|--------|------|
| `interactionAdapter.ts` | pointer/wheel/range → `ChartInteractionEvent` |
| `renderWindowController.ts` | `pending_shift`, `applying_shift`, commit on pointerup/idle, `settleWindowSwap` |
| `viewportController.ts` | FSM; `focusTrade`, `restoreAfterWindowSwap`, `noViewportChange` on trace ready |
| `traceDisplayOrchestrator.ts` | `shouldBlockTraceFetchForActivePan`, `queueTraceFetchIntent`, `planTraceDisplayLoad` |
| `chartViewModel.ts` | Pure projection + `seriesKey` |
| `executeViewportCommand.ts` | Imperative LWC apply for commands |

---

## Unchanged layers

- `data_engine/` — not touched
- `research/` — strategy / signal semantics — not touched
- `research_api/` — trace calculation — not touched
- Caches reused: `marketDataCache`, `signalTraceDisplayCache`, `signalTraceBundleSessionCache`

---

## Related docs

- Acceptance (manual): `implementation/acceptance.md`
- Chart audit (viewport/setData/trace): `implementation/chart-audit.md`
- Baseline counters: `implementation/baseline.md`
- Delta specs (pre-archive): `specs/` in this change directory
