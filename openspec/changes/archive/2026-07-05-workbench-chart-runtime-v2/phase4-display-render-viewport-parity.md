# Phase 4: Display, Render, and Viewport Parity

## Scope

Phase 4 implements display/render/viewport candidate parity inside `frontend/src/features/workbenchChartRuntime/` using existing helper semantics from `chartRuntime`, `renderWindowController`, `viewportController`, `chartDataWindowManager`, `chartRenderWindowDisplay`, and `chartViewWindow`.

This phase does not modify `frontend/src/shared/context/WorkbenchContext.tsx`, does not modify `ChartPanel`, does not wire runtime v2 as production render-window/viewport/interaction owner, does not emit production viewport commands, and does not start Phase 5 trace/events/overlays parity.

## Implemented Behavior

- `renderWindowRuntime.ts` wraps `createChartRuntime` / `renderWindowController` + `ChartDataWindowManager`:
  - init on foundation key (`initializeRenderWindowRuntime`)
  - tail and trade-centered windows (`applyRenderWindowForTradeRuntime`)
  - bundle prepend offset (`offsetRenderWindowForBundlePrepend`)
  - shift seq on commit (`applyRenderWindowShiftCommit`)
  - snapshot bounds/first/last time (`resolveRenderWindowRuntimeSnapshot`)
- `chartWindowRuntime.ts` mirrors `WorkbenchContext` `chartWindowSlice`:
  - `resolveChartWindowRuntime` via manager slice + stabilize keys from `chartRenderWindowDisplay`
  - stable `seriesKey` via `buildRenderWindowBoundsKey`
- `viewportRuntime.ts` wraps `viewportController` candidate stream:
  - `filterViewportCommandCandidate` mirrors `emitChartViewportCommand` gating (`canEmitTradeFocus`)
  - acknowledge/cancel/settle candidates are inert before cutover
  - `restoreAfterWindowSwap` candidate includes `swapTransactionId` in harness path
- `interactionRuntime.ts` mirrors `dispatchChartInteraction` candidate decisions:
  - pointerdown cancels viewport commands
  - visible-range sampling triggers pan prefetch evaluation
  - does not connect to live ChartPanel dispatch
- `panRuntime.ts` wraps `evaluateMarketPanPrefetchExpansion` with programmatic suppression flag
- `displayRenderViewportHarness.ts` isolated harness composing market bundle + render + slice + viewport candidates
- `resolveDisplayRenderViewportShadow` populates debug render/chart-model fields on production-mounted hook (inactive when market status is `idle`)
- `useWorkbenchChartRuntime.ts` adds shadow debug fields only; viewport/interaction outputs remain inert noop boundaries

## Acceptance Evidence

| Gate | Result |
|---|---|
| Display/render ranges aligned with market bundle | Passed — tail/trade init bounds match legacy manager |
| Chart window slice stable, no empty gaps on valid bundle | Passed — harness + shadow resolver tests |
| Render-window candidate matches old shift/restore semantics | Passed — shift seq + restoreAfterWindowSwap candidate |
| Viewport command candidate computed, not production-emitted | Passed — inert acknowledge/settle; owner flags inactive |
| Interaction/pan candidate not active owner | Passed — harness-only dispatch; noop production `interaction.dispatch` |
| Mounted runtime v2 inactive/shadow-only | Passed — market idle; owner flags inactive |
| No WBContext/ChartPanel/production wiring mutation | Passed |
| Module line counts under 500 | Passed |

## Parity / Reviewed Differences

| Area | Old pipeline | Runtime v2 Phase 4 | Notes |
|---|---|---|---|
| Render init | Provider effect on `renderWindowFoundationKey` | Harness + shadow resolver on same foundation key semantics | Shadow uses fresh controller per snapshot (no cross-render persistence) — intentional before cutover |
| Viewport emit | React state + ChartPanel execute | Candidate state with inert callbacks | Production stream unchanged |
| Pan prefetch | Updates `marketCoverageWindow` state | Returns expansion candidate only | No production coverage mutation |
| Component events in slice | Included in provider slice memo | Empty in Phase 4 chart window (Phase 5 scope) | Documented deferral |

No unexpected parity differences in render bounds, shift seq, or viewport command payload shape.

## No Production Ownership Evidence

- No `WorkbenchContext.tsx` changes.
- No `ChartPanel` changes.
- Viewport command callbacks are noop; `ownerFlags.viewportCommands` and `ownerFlags.renderWindow` remain `false`.
- Interaction dispatch is noop on production-mounted output.
- Pan expansion returns candidates only; no coverage window state writes.

## Complexity / Ownership Report

Runtime package line counts:

| File | Lines |
|---|---:|
| `frontend/src/features/workbenchChartRuntime/auxOverlayRuntime.ts` | 15 |
| `frontend/src/features/workbenchChartRuntime/chartEventsRuntime.ts` | 14 |
| `frontend/src/features/workbenchChartRuntime/chartModelRuntime.ts` | 26 |
| `frontend/src/features/workbenchChartRuntime/chartWindowRuntime.ts` | 131 |
| `frontend/src/features/workbenchChartRuntime/displayRenderViewportHarness.ts` | 244 |
| `frontend/src/features/workbenchChartRuntime/displayRenderViewportParity.test.ts` | 463 |
| `frontend/src/features/workbenchChartRuntime/index.ts` | 22 |
| `frontend/src/features/workbenchChartRuntime/interactionRuntime.ts` | 161 |
| `frontend/src/features/workbenchChartRuntime/marketBundleRuntime.ts` | 224 |
| `frontend/src/features/workbenchChartRuntime/marketFetchPlanRuntime.ts` | 95 |
| `frontend/src/features/workbenchChartRuntime/marketLoadHarness.ts` | 95 |
| `frontend/src/features/workbenchChartRuntime/marketLoadRuntime.ts` | 218 |
| `frontend/src/features/workbenchChartRuntime/marketPhase3aRuntime.test.ts` | 277 |
| `frontend/src/features/workbenchChartRuntime/marketPhase3bFetchPlanLoader.test.ts` | 457 |
| `frontend/src/features/workbenchChartRuntime/marketPhase3cBundleParity.test.ts` | 349 |
| `frontend/src/features/workbenchChartRuntime/marketViewRuntime.ts` | 84 |
| `frontend/src/features/workbenchChartRuntime/marketWindowRuntime.ts` | 177 |
| `frontend/src/features/workbenchChartRuntime/panRuntime.ts` | 72 |
| `frontend/src/features/workbenchChartRuntime/renderWindowRuntime.ts` | 194 |
| `frontend/src/features/workbenchChartRuntime/runtimeDebug.ts` | 111 |
| `frontend/src/features/workbenchChartRuntime/runtimeInputAdapter.ts` | 10 |
| `frontend/src/features/workbenchChartRuntime/runtimeOutputAdapter.ts` | 30 |
| `frontend/src/features/workbenchChartRuntime/runtimeTypes.test.ts` | 42 |
| `frontend/src/features/workbenchChartRuntime/runtimeTypes.ts` | 148 |
| `frontend/src/features/workbenchChartRuntime/traceDisplayRuntime.ts` | 20 |
| `frontend/src/features/workbenchChartRuntime/traceRuntime.ts` | 19 |
| `frontend/src/features/workbenchChartRuntime/useWorkbenchChartRuntime.ts` | 138 |
| `frontend/src/features/workbenchChartRuntime/viewportRuntime.ts` | 126 |

No runtime module exceeds the 500-line limit. `useWorkbenchChartRuntime.ts` is 138 lines.

`frontend/src/shared/context/WorkbenchContext.tsx` line count remains 2876 (unchanged in Phase 4).

Old owner symbols still present in `WorkbenchContext.tsx` as expected before cutover/deletion:

- market identity/windows: `runMarketViewIdentity`, `marketFocusWindow`, `marketCoverageWindow`.
- market load/cache/bundle: `marketLoadStatus`, `cachedBundle`, `composeDisplayMarketWindowBundle`, `renderWindowFoundationKey`.
- render-window: `chartRuntimeRef`, `renderWindowRevision`, `renderWindowShiftSeq`.
- viewport command stream: `chartViewportCommand`.
- trace display/cache: `signalTraceDisplayCacheRef`.
- chart window/model: `chartWindowSlice`, `chartViewModel`.
- pan prefetch: `attemptMarketPanPrefetch`, `dispatchChartInteraction`.

New runtime v2 symbols introduced in Phase 4:

- `resolveChartWindowRuntime`, `resolveChartWindowFromRenderController`, `createChartWindowStabilizeCaches`
- `createRenderWindowRuntimeController`, `initializeRenderWindowRuntime`, `applyRenderWindowForTradeRuntime`, `resolveRenderWindowRuntimeSnapshot`
- `createViewportRuntimeState`, `filterViewportCommandCandidate`, `recordViewportCommandCandidate`, `resolveViewportRuntimeCandidate`
- `evaluatePanPrefetchCandidate`, `dispatchInteractionCandidate`, `applyWindowSwapCommitCandidate`
- `createDisplayRenderViewportHarness`, `resolveDisplayRenderViewportShadow`

These symbols are not production owners. Candidates and debug snapshots only.

## Checks

| Command | Result | Notes |
|---|---|---|
| `openspec validate "workbench-chart-runtime-v2" --strict` | Passed | Change is valid. |
| Phase 4 targeted tests (`displayRenderViewportParity.test.ts`) | Passed | 14 tests |
| Phase 3A/3B/3C targeted tests | Passed | 28 tests (unchanged) |
| IDE lints for `frontend/src/features/workbenchChartRuntime/` | Passed | No linter errors |
| `npm run build` | Failed | Existing TS unused-symbol blockers outside Phase 4; no errors in new runtime modules after unused import fix |

Build blockers observed (unchanged, outside Phase 4 scope):

- `src/api/client.marketWindow.test.ts`, `client.signalTrace.test.ts` — unused `init`
- `src/features/chart/marketWindowPlanner.test.ts` — unused imports
- `src/shared/context/chartEventsDisplayLoad.test.tsx`, `chartEventsDistantTradeDisplay.test.tsx` — unused symbols
- `src/shared/context/WorkbenchContext.tsx` — unused `AnchorStackPeriods`, `composePartialRunMarketWindowBundle`

## Stop For Review

Phase 4 is complete and intentionally stops here. Do not begin Phase 5 trace/events/overlays parity until review approves continuing.
