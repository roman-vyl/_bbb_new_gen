# Phase 3B: Fetch Plan and Loader Wrapper in Isolated Test Harness

## Scope

Phase 3B implements fetch plan parity and loader lifecycle wrapper parity only inside `frontend/src/features/workbenchChartRuntime/` and isolated test harnesses.

This phase does not modify `frontend/src/shared/context/WorkbenchContext.tsx`, does not modify `ChartPanel`, does not wire runtime v2 into the production Chart tab as market load owner, does not perform production network fetches, does not write production `marketResourceCache`, and does not start Phase 3C bundle/fallback/source/count parity.

## Implemented Behavior

- `marketFetchPlanRuntime.ts` builds candles/EMA fetch plans from Phase 3A identity/window inputs using existing `planCandlesWindowFetchForView()` and `planEmaWindowFetchesForView()` semantics. Plans target the coverage window; readiness checks use the focus window.
- `marketLoadRuntime.ts` wraps `executeMarketWindowLoad()` with generation, abort, in-flight dedupe, status/error, revision, and stale-response semantics aligned with the current `WorkbenchContext.tsx` market load effect.
- `marketLoadHarness.ts` provides an isolated harness that wires Phase 3A view/window resolution, fetch plan output, and loader controller cycles for tests only.
- `useWorkbenchChartRuntime.ts` adds read-only `debug.marketFetchPlan` computed from identity/windows. Production output remains idle/inactive for market status and owner flags.
- Loader lifecycle semantics covered in harness/tests:
  - **generation**: stale network responses ignored when generation and intended identity both mismatch.
  - **abort**: aborted fetches return `aborted` without setting error status.
  - **in-flight dedupe**: duplicate in-flight keys skip redundant candles fetch.
  - **status/error**: focus candles ready promotes `ready`; failures set `error`.
  - **revisions**: candles/overlay revision counters bump independently on chunk seed.

## No Production Fetch / Cache / Wiring Evidence

- No `WorkbenchContext.tsx` changes.
- No `ChartPanel` changes.
- No runtime v2 production wiring was added.
- Production-mounted runtime v2 owner flags remain inactive, including `marketCacheWrites: false`.
- Production runtime modules do not import `@/api/client` or `marketResourceCache`. Cache/network usage is limited to test files and the loader wrapper import of `executeMarketWindowLoad()` (invoked only from isolated harness/tests).
- `marketBundleRuntime.ts` remains a no-cache-read/no-cache-write placeholder (Phase 3C).

## Parity / Tests

Targeted tests added in `frontend/src/features/workbenchChartRuntime/marketPhase3bFetchPlanLoader.test.ts` cover:

- runtime fetch plan equals old planner candles/EMA plans for the same view/focus/coverage windows.
- fetch plans target coverage window while `focusCandlesReady`/`coverageCandlesReady` use focus/coverage respectively.
- debug fetch plan derives from Phase 3A identity/window inputs.
- harness cold load: candles + 3 EMA fetches, ready status, revision bumps.
- harness cache hit: candles skipped, EMA still fetched, ready from cache.
- harness missing range: partial cache plans/fetches only the gap.
- harness stale response: generation/identity mismatch ignores completion.
- harness abort: aborted outcome, no error status.
- harness duplicate in-flight key: candles fetch deduped.
- harness independent readiness: focus candles ready before EMA overlays complete.
- production-mounted initial output remains idle/unavailable with inactive owner flags and debug-only fetch plan.

No reviewed parity differences were introduced in Phase 3B.

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
| `frontend/src/features/workbenchChartRuntime/marketBundleRuntime.ts` | 19 |
| `frontend/src/features/workbenchChartRuntime/marketFetchPlanRuntime.ts` | 95 |
| `frontend/src/features/workbenchChartRuntime/marketLoadHarness.ts` | 95 |
| `frontend/src/features/workbenchChartRuntime/marketLoadRuntime.ts` | 218 |
| `frontend/src/features/workbenchChartRuntime/marketPhase3aRuntime.test.ts` | 277 |
| `frontend/src/features/workbenchChartRuntime/marketPhase3bFetchPlanLoader.test.ts` | 457 |
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
| `frontend/src/features/workbenchChartRuntime/useWorkbenchChartRuntime.ts` | 96 |
| `frontend/src/features/workbenchChartRuntime/viewportRuntime.ts` | 20 |

No runtime module exceeds the 500-line limit. `useWorkbenchChartRuntime.ts` is 96 lines and remains an inert orchestrator, not a god-hook.

`frontend/src/shared/context/WorkbenchContext.tsx` line count remains 2876 (unchanged in Phase 3B).

Old owner symbols still present in `WorkbenchContext.tsx` as expected before cutover/deletion:

- market identity/windows: `runMarketViewIdentity`, `marketFocusWindow`, `marketCoverageWindow`.
- market load/cache: `marketLoadStatus`, `marketError`, `marketFetchInFlightKeysRef`.
- render-window: `chartRuntimeRef`, `renderWindowRevision`, `renderWindowShiftSeq`.
- viewport command stream: `chartViewportCommand`.
- trace display/cache: `signalTraceDisplayCacheRef`, `signalTraceBundleSessionCacheRef`.
- chart events/component events: `chartDisplayComponentEvents`.
- aux/HTF overlays: `auxEmaOverlays`.
- chart window/model: `chartWindowSlice`, `chartViewModel`.

New runtime v2 symbols introduced in Phase 3B (harness/tests only for loader execution):

- `resolveMarketFetchPlanRuntime`
- `createMarketFetchPlanRuntimeBoundary`
- `toRuntimeMarketFetchPlanDebug`
- `RuntimeMarketFetchPlanDebug`
- `createMarketLoadRuntimeController`
- `beginMarketLoadCycle`
- `cancelMarketLoadCycle`
- `runMarketLoadCycle`
- `createMarketLoadHarness`
- `MarketLoadCycleOutcome`
- `MarketLoadRuntimeControllerState`

These symbols are not production owners. Fetch plan is debug-only on the production-mounted hook. Loader execution runs only in isolated harness/tests.

## Checks

| Command | Result | Notes |
|---|---|---|
| `openspec validate "workbench-chart-runtime-v2" --strict` | Passed | Change is valid. |
| `npm test -- src/features/workbenchChartRuntime/runtimeTypes.test.ts src/features/workbenchChartRuntime/marketPhase3aRuntime.test.ts src/features/workbenchChartRuntime/marketPhase3bFetchPlanLoader.test.ts` | Passed | 3 files, 20 tests passed. |
| IDE lints for `frontend/src/features/workbenchChartRuntime/` | Passed | No linter errors found. |
| `npm run build` | Failed | Existing TypeScript unused-symbol blockers outside Phase 3B; no errors reported in new runtime modules after test fix. |

Build blockers observed (unchanged, outside Phase 3B scope):

- `src/api/client.marketWindow.test.ts(79,50): 'init' is declared but its value is never read.`
- `src/api/client.signalTrace.test.ts(200,50): 'init' is declared but its value is never read.`
- `src/features/chart/marketWindowPlanner.test.ts(4,3): 'buildCandlesCacheKey' is declared but its value is never read.`
- `src/features/chart/marketWindowPlanner.test.ts(7,3): 'mergeCandlesWindowBundle' is declared but its value is never read.`
- `src/features/chart/marketWindowPlanner.test.ts(8,3): 'mergeEmaWindowBundle' is declared but its value is never read.`
- `src/shared/context/chartEventsDisplayLoad.test.tsx(198,5): 'shellSliceRef' is declared but its value is never read.`
- `src/shared/context/chartEventsDistantTradeDisplay.test.tsx(13,3): 'SignalTraceBundle' is declared but never used.`
- `src/shared/context/WorkbenchContext.tsx(23,8): 'AnchorStackPeriods' is declared but its value is never read.`
- `src/shared/context/WorkbenchContext.tsx(140,3): 'composePartialRunMarketWindowBundle' is declared but its value is never read.`

These blockers were not changed because Phase 3B explicitly forbids editing `WorkbenchContext.tsx` and unrelated baseline test files.

## Stop For Review

Phase 3B is complete and intentionally stops here. Do not begin Phase 3C bundle/fallback/source/count parity until review approves continuing.
