# Phase 3A: Market Identity and Windows Only, No Fetch

## Scope

Phase 3A implements only isolated/shadow market identity and market focus/coverage window calculations inside `frontend/src/features/workbenchChartRuntime/`.

This phase does not modify `frontend/src/shared/context/WorkbenchContext.tsx`, does not modify `ChartPanel`, does not wire runtime v2 into the production Chart tab, does not create an active market-window owner, and does not start Phase 3B fetch planning or loader wrapping.

## Implemented Behavior

- `marketViewRuntime.ts` resolves `RunMarketView`, `marketIdentity`, and `expectedMarketIdentity` using the existing `resolveRunMarketView()` and `buildRunMarketViewIdentity()` semantics.
- `marketWindowRuntime.ts` resolves tail and trade-centered focus windows, initial coverage windows, stable focus/coverage keys, and reset keys using the existing `resolveMarketTargetWindow()` and `buildMarketTargetWindowKey()` semantics.
- Reset reasons are explicit: `view_unavailable`, `initial_focus`, `identity_changed`, `selected_trade_changed`, `focus_window_changed`, `coverage_window_initialized`, `coverage_window_reset_to_focus`, and `unchanged`.
- Debug snapshot shape now includes expected market identity, focus/coverage window keys, market window reset key, focus mode, reset reasons, and an optional old-vs-new comparison result.
- `runtimeDebug.ts` exposes `compareMarketWindowSnapshots()` for old-vs-new comparison of market identity, focus window, coverage window, window keys, reset key, focus mode, selected trade entry, and reset reasons.
- `createInitialChartRuntimeOutput()` fills the new debug fields from pure Phase 3A calculations while keeping runtime output idle/inactive.

## No Fetch / No Cache / No Production Wiring Evidence

- No `WorkbenchContext.tsx` changes.
- No `ChartPanel` changes.
- No runtime v2 production wiring was added.
- Runtime v2 owner flags remain inactive, including `marketWindows: false` and `marketCacheWrites: false`.
- Static search under `frontend/src/features/workbenchChartRuntime/` found no `@/api/client`, `fetchCandlesWindow`, `fetchEmaWindow`, `executeMarketWindowLoad`, `marketResourceCache`, cache seed, or cache merge usage. Matches were limited to debug/type field names such as `fetchedCandles`.
- `marketLoadRuntime.ts` remains a no-fetch placeholder.
- `marketBundleRuntime.ts` remains a no-cache-read/no-cache-write placeholder.

## Parity / Tests

Targeted tests added in `frontend/src/features/workbenchChartRuntime/marketPhase3aRuntime.test.ts` cover:

- new `marketViewRuntime` identity equals old `resolveRunMarketView()` + `buildRunMarketViewIdentity()`.
- stale selected-run input keeps intended identity but clears expected identity, matching the current main pipeline split.
- anchor-stack parse errors are explicit and do not produce identity.
- focus/coverage windows and keys equal old `resolveMarketTargetWindow()` + `buildMarketTargetWindowKey()`.
- unchanged reset key preserves expanded coverage.
- selected trade changes reset coverage to the new focus window.
- old-vs-new comparison reports key/reset differences.
- initial runtime output remains idle, unavailable for market data, and all owner flags stay false.

No reviewed parity differences were introduced in Phase 3A.

## Complexity / Ownership Report

Runtime package line counts:

| File | Lines |
|---|---:|
| `frontend/src/features/workbenchChartRuntime/auxOverlayRuntime.ts` | 17 |
| `frontend/src/features/workbenchChartRuntime/chartEventsRuntime.ts` | 15 |
| `frontend/src/features/workbenchChartRuntime/chartModelRuntime.ts` | 28 |
| `frontend/src/features/workbenchChartRuntime/chartWindowRuntime.ts` | 24 |
| `frontend/src/features/workbenchChartRuntime/index.ts` | 19 |
| `frontend/src/features/workbenchChartRuntime/interactionRuntime.ts` | 17 |
| `frontend/src/features/workbenchChartRuntime/marketBundleRuntime.ts` | 21 |
| `frontend/src/features/workbenchChartRuntime/marketLoadRuntime.ts` | 21 |
| `frontend/src/features/workbenchChartRuntime/marketPhase3aRuntime.test.ts` | 305 |
| `frontend/src/features/workbenchChartRuntime/marketViewRuntime.ts` | 92 |
| `frontend/src/features/workbenchChartRuntime/marketWindowRuntime.ts` | 195 |
| `frontend/src/features/workbenchChartRuntime/panRuntime.ts` | 13 |
| `frontend/src/features/workbenchChartRuntime/renderWindowRuntime.ts` | 15 |
| `frontend/src/features/workbenchChartRuntime/runtimeDebug.ts` | 117 |
| `frontend/src/features/workbenchChartRuntime/runtimeInputAdapter.ts` | 12 |
| `frontend/src/features/workbenchChartRuntime/runtimeOutputAdapter.ts` | 32 |
| `frontend/src/features/workbenchChartRuntime/runtimeTypes.test.ts` | 46 |
| `frontend/src/features/workbenchChartRuntime/runtimeTypes.ts` | 155 |
| `frontend/src/features/workbenchChartRuntime/traceDisplayRuntime.ts` | 22 |
| `frontend/src/features/workbenchChartRuntime/traceRuntime.ts` | 21 |
| `frontend/src/features/workbenchChartRuntime/useWorkbenchChartRuntime.ts` | 86 |
| `frontend/src/features/workbenchChartRuntime/viewportRuntime.ts` | 23 |

No runtime module exceeds the 500-line limit. `useWorkbenchChartRuntime.ts` is 86 lines and remains an inert orchestrator, not a new god-hook.

`frontend/src/shared/context/WorkbenchContext.tsx` line count remains 3095. It was not edited in Phase 3A.

Old owner symbols still present in `WorkbenchContext.tsx` as expected before cutover/deletion:

- market identity/windows: `runMarketViewIdentity`, `marketFocusWindow`, `marketCoverageWindow`.
- market load/cache: `marketLoadStatus`, `marketError`, `marketFetchInFlightKeysRef`.
- render-window: `chartRuntimeRef`, `renderWindowRevision`, `renderWindowShiftSeq`.
- viewport command stream: `chartViewportCommand`.
- trace display/cache: `signalTraceDisplayCacheRef`, `signalTraceBundleSessionCacheRef`.
- chart events/component events: `chartDisplayComponentEvents`.
- aux/HTF overlays: `auxEmaOverlays`.
- chart window/model: `chartWindowSlice`, `chartViewModel`.

New runtime v2 symbols introduced or made active as pure shadow calculations:

- `resolveMarketViewRuntime`
- `resolveMarketWindowRuntime`
- `buildMarketWindowResetKey`
- `toMarketWindowRuntimeState`
- `windowsEqual`
- `compareMarketWindowSnapshots`
- `RuntimeMarketWindowResetReason`
- `RuntimeMarketWindowSnapshot`
- `RuntimeMarketWindowComparison`

These symbols are not production owners. They perform pure calculations only and do not fetch, write caches, emit viewport commands, receive ChartPanel interactions, or mutate production chart context values.

## Checks

| Command | Result | Notes |
|---|---|---|
| `openspec validate "workbench-chart-runtime-v2" --strict` | Passed | Change is valid. |
| `npm test -- src/features/workbenchChartRuntime/runtimeTypes.test.ts src/features/workbenchChartRuntime/marketPhase3aRuntime.test.ts` | Passed | 2 files, 9 tests passed. |
| IDE lints for `frontend/src/features/workbenchChartRuntime/` | Passed | No linter errors found. |
| `npm run build` | Failed | Existing TypeScript unused-symbol blockers outside Phase 3A; no errors reported in `frontend/src/features/workbenchChartRuntime/`. |

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

These blockers were not changed because Phase 3A explicitly forbids editing `WorkbenchContext.tsx` and unrelated baseline test files.

## Stop For Review

Phase 3A is complete and intentionally stops here. Do not begin Phase 3B fetch plan or loader wrapper work until review approves continuing.
