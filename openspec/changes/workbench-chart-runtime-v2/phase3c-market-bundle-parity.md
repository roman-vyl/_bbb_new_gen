# Phase 3C: Bundle, Fallback, Source, and Count Parity

## Scope

Phase 3C implements display bundle composition parity inside `frontend/src/features/workbenchChartRuntime/` using read-only access to the existing `marketResourceCache` helpers and isolated seeded caches in tests.

This phase does not modify `frontend/src/shared/context/WorkbenchContext.tsx`, does not modify `ChartPanel`, does not wire runtime v2 as production market/bundle owner, does not perform production network fetches, does not write production `marketResourceCache`, and does not start Phase 4 render/viewport parity.

## Implemented Behavior

- `marketBundleRuntime.ts` wraps existing bundle semantics:
  - `composeDisplayMarketWindowBundle()` for display bundle with focus fallback while coverage prefetch is incomplete.
  - `marketCandlesReadyForTarget()` gate before compose (matches `WorkbenchContext` cachedBundle guard).
  - `candleRangeMs()` for full/display candle range.
  - `resolveRenderWindowFoundationKey()` mirrors `${marketFocusWindowKey}:${focusCandles.length}` when `marketLoadStatus === "ready"`.
  - Derived market output: `candlesSource`, `candlesCount`, `fullCandleRange` aligned with provider derivations.
- Debug bundle lineage fields populated read-only:
  - `fetchedCandles` — focus-window cache slice range/count.
  - `cachedCandles` — coverage-window cache slice range/count.
  - `displayBundle` — composed bundle range/count/source (`focus` | `coverage`).
- `useWorkbenchChartRuntime.ts` calls `resolveMarketBundleRuntime()` with `marketLoadStatus: "idle"` for shadow/debug only. Production `market` output remains idle/unavailable; owner flags stay inactive.
- Isolated harness tests seed `mergeCandlesWindowBundle()` into cleared cache instances and compare runtime output against a legacy mirror of `WorkbenchContext` bundle derivations.

## Acceptance Evidence

| Gate | Result |
|---|---|
| Focus bundle ready → source/count/range correct | Passed — legacy parity test with seeded focus window |
| Coverage ready → display bundle uses coverage | Passed — coverage source + 3-candle bundle |
| Coverage missing → focus fallback preserved | Passed — focus source while coverage cache empty |
| Unavailable/error → no false ready | Passed — error/null bundle, unavailable source, null foundation key |
| Foundation key stable vs current semantics | Passed — null until `ready`, then `${focusWindowKey}:${count}` |
| Mounted runtime v2 inactive/shadow-only | Passed — market idle/unavailable, owner flags inactive |
| No production fetch/cache/network/WBContext/ChartPanel mutation | Passed — no touched production files |
| No duplicate cache implementation | Passed — reuses `composeDisplayMarketWindowBundle`, `getCandles`, `marketCandlesReadyForTarget` |

## No Production Ownership Evidence

- No `WorkbenchContext.tsx` changes.
- No `ChartPanel` changes.
- No runtime v2 production wiring added.
- Production-mounted owner flags remain inactive (`marketCacheWrites: false`).
- Bundle runtime performs read-only cache reads for debug/comparison; no cache writes, no network, no load lifecycle ownership.

## Parity / Tests

Targeted tests in `frontend/src/features/workbenchChartRuntime/marketPhase3cBundleParity.test.ts` cover:

- runtime bundle matches legacy snapshot for focus-ready bundle (source, count, range, foundation key).
- coverage-ready compose source and candle count.
- focus fallback during incomplete coverage prefetch.
- error status suppresses bundle and avoids false ready/source.
- focus-not-ready returns null bundle.
- foundation key null until ready, stable when ready.
- production-mounted output stays idle with inactive owner flags.
- isolated bundle runtime debug fields without foundation key on loading status.

No reviewed parity differences were introduced in Phase 3C.

## Complexity / Ownership Report

Runtime package line counts:

| File | Lines |
|---|---:|
| `frontend/src/features/workbenchChartRuntime/auxOverlayRuntime.ts` | 15 |
| `frontend/src/features/workbenchChartRuntime/chartEventsRuntime.ts` | 14 |
| `frontend/src/features/workbenchChartRuntime/chartModelRuntime.ts` | 26 |
| `frontend/src/features/workbenchChartRuntime/chartWindowRuntime.ts` | 22 |
| `frontend/src/features/workbenchChartRuntime/index.ts` | 21 |
| `frontend/src/features/workbenchChartRuntime/interactionRuntime.ts` | 15 |
| `frontend/src/features/workbenchChartRuntime/marketBundleRuntime.ts` | 224 |
| `frontend/src/features/workbenchChartRuntime/marketFetchPlanRuntime.ts` | 95 |
| `frontend/src/features/workbenchChartRuntime/marketLoadHarness.ts` | 95 |
| `frontend/src/features/workbenchChartRuntime/marketLoadRuntime.ts` | 218 |
| `frontend/src/features/workbenchChartRuntime/marketPhase3aRuntime.test.ts` | 277 |
| `frontend/src/features/workbenchChartRuntime/marketPhase3bFetchPlanLoader.test.ts` | 457 |
| `frontend/src/features/workbenchChartRuntime/marketPhase3cBundleParity.test.ts` | 350 |
| `frontend/src/features/workbenchChartRuntime/marketViewRuntime.ts` | 84 |
| `frontend/src/features/workbenchChartRuntime/marketWindowRuntime.ts` | 177 |
| `frontend/src/features/workbenchChartRuntime/panRuntime.ts` | 11 |
| `frontend/src/features/workbenchChartRuntime/renderWindowRuntime.ts` | 14 |
| `frontend/src/features/workbenchChartRuntime/runtimeDebug.ts` | 111 |
| `frontend/src/features/workbenchChartRuntime/runtimeInputAdapter.ts` | 10 |
| `frontend/src/features/workbenchChartRuntime/runtimeOutputAdapter.ts` | 30 |
| `frontend/src/features/workbenchChartRuntime/runtimeTypes.test.ts` | 42 |
| `frontend/src/features/workbenchChartRuntime/runtimeTypes.ts` | 148 |
| `frontend/src/features/workbenchChartRuntime/traceDisplayRuntime.ts` | 20 |
| `frontend/src/features/workbenchChartRuntime/traceRuntime.ts` | 19 |
| `frontend/src/features/workbenchChartRuntime/useWorkbenchChartRuntime.ts` | 116 |
| `frontend/src/features/workbenchChartRuntime/viewportRuntime.ts` | 20 |

No runtime module exceeds the 500-line limit. `useWorkbenchChartRuntime.ts` is 116 lines.

`frontend/src/shared/context/WorkbenchContext.tsx` line count remains 2876 (unchanged in Phase 3C).

Old owner symbols still present in `WorkbenchContext.tsx` as expected before cutover/deletion:

- market identity/windows: `runMarketViewIdentity`, `marketFocusWindow`, `marketCoverageWindow`.
- market load/cache/bundle: `marketLoadStatus`, `marketFetchInFlightKeysRef`, `cachedBundle`, `composeDisplayMarketWindowBundle`, `renderWindowFoundationKey`, `marketCandlesCount`, `fullCandleRange`, `candlesSource`.
- render-window: `chartRuntimeRef`, `renderWindowRevision`, `renderWindowShiftSeq`.
- viewport command stream: `chartViewportCommand`.
- trace display/cache: `signalTraceDisplayCacheRef`, `signalTraceBundleSessionCacheRef`.
- chart events/component events: `chartDisplayComponentEvents`.
- aux/HTF overlays: `auxEmaOverlays`.
- chart window/model: `chartWindowSlice`, `chartViewModel`.

New runtime v2 symbols introduced in Phase 3C:

- `resolveMarketBundleRuntime`
- `resolveRenderWindowFoundationKey`
- `RuntimeMarketBundleDebug`
- `MarketBundleRuntimeInput`
- `MarketBundleRuntimeOutput`
- `MarketBundleRuntimeBoundary`

These symbols are not production owners. Bundle composition is debug/read-only on the production-mounted hook; full market output derivation is exercised in isolated tests only.

## Checks

| Command | Result | Notes |
|---|---|---|
| `openspec validate "workbench-chart-runtime-v2" --strict` | Passed | Change is valid. |
| `npm test -- src/features/workbenchChartRuntime/runtimeTypes.test.ts src/features/workbenchChartRuntime/marketPhase3aRuntime.test.ts src/features/workbenchChartRuntime/marketPhase3bFetchPlanLoader.test.ts src/features/workbenchChartRuntime/marketPhase3cBundleParity.test.ts` | Passed | 4 files, 28 tests passed. |
| IDE lints for `frontend/src/features/workbenchChartRuntime/` | Passed | No linter errors found. |
| `npm run build` | Failed | Existing TypeScript unused-symbol blockers outside Phase 3C; no errors in new runtime modules. |

Build blockers observed (unchanged, outside Phase 3C scope):

- `src/api/client.marketWindow.test.ts(79,50): 'init' is declared but its value is never read.`
- `src/api/client.signalTrace.test.ts(200,50): 'init' is declared but its value is never read.`
- `src/features/chart/marketWindowPlanner.test.ts(4,3): 'buildCandlesCacheKey' is declared but its value is never read.`
- `src/features/chart/marketWindowPlanner.test.ts(7,3): 'mergeCandlesWindowBundle' is declared but its value is never read.`
- `src/features/chart/marketWindowPlanner.test.ts(8,3): 'mergeEmaWindowBundle' is declared but its value is never read.`
- `src/shared/context/chartEventsDisplayLoad.test.tsx(198,5): 'shellSliceRef' is declared but its value is never read.`
- `src/shared/context/chartEventsDistantTradeDisplay.test.tsx(13,3): 'SignalTraceBundle' is declared but never used.`
- `src/shared/context/WorkbenchContext.tsx(23,8): 'AnchorStackPeriods' is declared but its value is never read.`
- `src/shared/context/WorkbenchContext.tsx(140,3): 'composePartialRunMarketWindowBundle' is declared but its value is never read.`

These blockers were not changed because Phase 3C explicitly forbids editing `WorkbenchContext.tsx` and unrelated baseline test files.

## Stop For Review

Phase 3C is complete and intentionally stops here. Do not begin Phase 4 display/render/viewport parity until review approves continuing.
