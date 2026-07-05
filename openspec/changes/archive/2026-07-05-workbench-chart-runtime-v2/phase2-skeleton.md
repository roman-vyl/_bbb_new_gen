# Phase 2 Baseline: Runtime Contracts and Skeleton

## Scope

Phase 2 creates only the `frontend/src/features/workbenchChartRuntime/` skeleton. It does not wire the new runtime into the production Workbench, does not modify `WorkbenchContext.tsx`, does not modify `ChartPanel.tsx`, and does not implement market/render/trace behavior.

Current branch observed during this phase: `new-workbench-chart-runtime-v2`.

Current HEAD observed during this phase: `0e0cb5e73ffec464acdd033d52d17ca03b84b1be`.

## Created Runtime Modules

| File | Lines | Purpose |
|---|---:|---|
| `frontend/src/features/workbenchChartRuntime/auxOverlayRuntime.ts` | 17 | Aux/HTF overlay boundary placeholder. |
| `frontend/src/features/workbenchChartRuntime/chartEventsRuntime.ts` | 15 | Chart-events boundary placeholder. |
| `frontend/src/features/workbenchChartRuntime/chartModelRuntime.ts` | 28 | Empty chart model boundary placeholder. |
| `frontend/src/features/workbenchChartRuntime/chartWindowRuntime.ts` | 24 | Chart window slice boundary placeholder. |
| `frontend/src/features/workbenchChartRuntime/index.ts` | 19 | Barrel exports for skeleton modules. |
| `frontend/src/features/workbenchChartRuntime/interactionRuntime.ts` | 17 | Inert interaction boundary placeholder. |
| `frontend/src/features/workbenchChartRuntime/marketBundleRuntime.ts` | 21 | Market bundle boundary placeholder. |
| `frontend/src/features/workbenchChartRuntime/marketLoadRuntime.ts` | 21 | Market loader boundary placeholder; no fetch/cache writes. |
| `frontend/src/features/workbenchChartRuntime/marketViewRuntime.ts` | 15 | Market identity boundary placeholder. |
| `frontend/src/features/workbenchChartRuntime/marketWindowRuntime.ts` | 23 | Market focus/coverage window boundary placeholder. |
| `frontend/src/features/workbenchChartRuntime/panRuntime.ts` | 13 | Pan expansion boundary placeholder. |
| `frontend/src/features/workbenchChartRuntime/renderWindowRuntime.ts` | 15 | Render-window boundary placeholder. |
| `frontend/src/features/workbenchChartRuntime/runtimeDebug.ts` | 43 | Empty debug snapshot and inactive owner flags. |
| `frontend/src/features/workbenchChartRuntime/runtimeInputAdapter.ts` | 12 | Input adapter boundary. |
| `frontend/src/features/workbenchChartRuntime/runtimeOutputAdapter.ts` | 32 | Output compatibility adapter boundary. |
| `frontend/src/features/workbenchChartRuntime/runtimeTypes.test.ts` | 46 | Contract shape test for inert initial output. |
| `frontend/src/features/workbenchChartRuntime/runtimeTypes.ts` | 119 | `ChartRuntimeInput`, `ChartRuntimeOutput`, debug snapshot and owner flag contracts. |
| `frontend/src/features/workbenchChartRuntime/traceDisplayRuntime.ts` | 22 | Trace display boundary placeholder. |
| `frontend/src/features/workbenchChartRuntime/traceRuntime.ts` | 21 | Dense trace/network boundary placeholder; no network calls. |
| `frontend/src/features/workbenchChartRuntime/useWorkbenchChartRuntime.ts` | 64 | Inert hook skeleton returning initial output only. |
| `frontend/src/features/workbenchChartRuntime/viewportRuntime.ts` | 23 | Inert viewport command boundary placeholder. |

No new runtime module exceeds 500 lines. `useWorkbenchChartRuntime.ts` is 64 lines and is not a god-hook.

## WorkbenchContext Line Count

`frontend/src/shared/context/WorkbenchContext.tsx` remains at the current baseline size. The file was not edited in Phase 2.

Observed counts:

- `Get-Content` line count: 3095.
- Existing analysis baseline: 3096 lines in `docs/workbench-chart-runtime-analysis.md`.

The one-line discrepancy is from trailing blank-line counting method; no file content was changed.

## Old Owner Symbols Still Present

Phase 2 intentionally leaves old chart/runtime ownership in `WorkbenchContext.tsx`. Representative old owner symbols still present include:

- market identity/windows: `runMarketViewIdentity`, `marketFocusWindow`, `marketCoverageWindow`.
- market load/cache: `marketLoadStatus`, `marketError`, `marketFetchInFlightKeysRef`.
- render-window: `chartRuntimeRef`, `renderWindowRevision`, `renderWindowShiftSeq`.
- viewport command stream: `chartViewportCommand`.
- trace display/cache: `signalTraceDisplayCacheRef`, `signalTraceBundleSessionCacheRef`.
- chart events/component events: `chartDisplayComponentEvents`.
- aux/HTF overlays: `auxEmaOverlays`.
- chart window/model: `chartWindowSlice`, `chartViewModel`.

These are expected to remain until later cutover/deletion phases.

## New Owner Symbols Introduced

Phase 2 introduces contract and boundary names only. They are not production owners and are not wired into `WorkbenchContext.tsx` or `ChartPanel.tsx`.

New boundary exports include:

- `createMarketViewRuntimeBoundary`
- `createMarketWindowRuntimeBoundary`
- `createMarketLoadRuntimeBoundary`
- `createMarketBundleRuntimeBoundary`
- `createPanRuntimeBoundary`
- `createInteractionRuntimeBoundary`
- `createRenderWindowRuntimeBoundary`
- `createViewportRuntimeBoundary`
- `createTraceRuntimeBoundary`
- `createTraceDisplayRuntimeBoundary`
- `createChartEventsRuntimeBoundary`
- `createAuxOverlayRuntimeBoundary`
- `createChartWindowRuntimeBoundary`
- `createChartModelRuntimeBoundary`
- `createInitialChartRuntimeOutput`
- `useWorkbenchChartRuntime`

All debug owner flags in the initial output are `false`.

## Behavior Guard

Phase 2 did not:

- modify `frontend/src/shared/context/WorkbenchContext.tsx`;
- modify `frontend/src/features/chart/ChartPanel.tsx`;
- add production wiring;
- add a feature flag cutover;
- call market/trace APIs;
- write to production caches;
- emit viewport commands;
- receive live `ChartPanel` interactions as an active owner.

## Checks

| Command | Result | Notes |
|---|---|---|
| `openspec validate "workbench-chart-runtime-v2" --strict` | Passed | OpenSpec change remains valid. |
| `npm test -- src/features/workbenchChartRuntime/runtimeTypes.test.ts` | Passed | 1 test passed. |
| `npm run build` | Failed | Existing TypeScript unused-symbol blockers outside the new skeleton; no errors in `frontend/src/features/workbenchChartRuntime/`. |
| IDE lints for `frontend/src/features/workbenchChartRuntime/` | Passed | No linter errors found. |

Build blockers observed:

- `src/api/client.marketWindow.test.ts(79,50): 'init' is declared but its value is never read.`
- `src/api/client.signalTrace.test.ts(200,50): 'init' is declared but its value is never read.`
- `src/features/chart/marketWindowPlanner.test.ts(4,3): 'buildCandlesCacheKey' is declared but its value is never read.`
- `src/features/chart/marketWindowPlanner.test.ts(7,3): 'mergeCandlesWindowBundle' is declared but its value is never read.`
- `src/features/chart/marketWindowPlanner.test.ts(8,3): 'mergeEmaWindowBundle' is declared but its value is never read.`
- `src/shared/context/chartEventsDisplayLoad.test.tsx(198,5): 'shellSliceRef' is declared but its value is never read.`
- `src/shared/context/chartEventsDistantTradeDisplay.test.tsx(13,3): 'SignalTraceBundle' is declared but never used.`
- `src/shared/context/WorkbenchContext.tsx(23,8): 'AnchorStackPeriods' is declared but its value is never read.`
- `src/shared/context/WorkbenchContext.tsx(140,3): 'composePartialRunMarketWindowBundle' is declared but its value is never read.`

These blockers were not changed in Phase 2 because this phase forbids editing `WorkbenchContext.tsx`, `ChartPanel.tsx`, production behavior, or unrelated baseline tests.
