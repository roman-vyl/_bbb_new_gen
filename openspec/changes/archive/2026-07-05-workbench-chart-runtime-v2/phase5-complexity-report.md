# Phase 5 Complexity / Ownership Report

Recorded after Phase 5 — Trace, Events, Overlays, and Chart-Model Parity.

## Runtime module line counts

| Module | Lines |
|--------|-------|
| `traceDisplayRuntime.ts` | 209 |
| `traceRuntime.ts` | 616 |
| `chartEventsRuntime.ts` | 97 |
| `auxOverlayRuntime.ts` | 300 |
| `chartModelRuntime.ts` | 92 |
| `traceEventsOverlaysHarness.ts` | 352 |
| `traceEventsOverlaysParity.test.ts` | 454 |
| `useWorkbenchChartRuntime.ts` | 196 |
| (other runtime modules unchanged from Phase 4) | — |

`traceRuntime.ts` exceeds the 500-line gate; split before Phase 6 cutover if orchestration grows further.

## WorkbenchContext.tsx

- Current line count: **2876** (baseline lock was 3096 in tasks Phase 0).
- Old chart/runtime owner symbols remain in `WorkbenchContext.tsx` (trace effect, display cache refs, aux EMA effect, chart model memo, etc.).
- Production Chart tab still owned by the current `WorkbenchContext` pipeline.

## New owner symbols (runtime v2 — isolated / shadow only)

- `createTraceDisplayRuntimeController`, `resetTraceDisplayRuntimeCache`, `applyTraceDisplayForWindow`
- `createTraceRuntimeController`, `runTraceLoadCycle`, `resolveTraceRuntimeSnapshot`
- `resolveChartEventsRuntimeSnapshot`, `mapChartEventsDisplayLoadOutcome`
- `createAuxOverlayRuntimeController`, `resolveAuxOverlayRuntimeSnapshot`, `loadBffAuxOverlaysRuntime`
- `resolveChartModelRuntime`, `createTraceEventsOverlaysHarness`, `resolveTraceEventsOverlaysShadow`

## Production-mounted constraints (verified)

- `inactiveChartRuntimeOwnerFlags` on shadow `ChartRuntimeOutput.debug.ownerFlags`
- No production `marketResourceCache` writes from runtime v2 orchestrator
- Trace display/session caches created per harness/controller instance (not production refs)
- Network loads only in isolated harness tests via injectable `loadDisplayTraceChunk` / `loadDenseLanesTrace`
- No production viewport commands or `ChartPanel` interaction dispatch

## Parity notes (reviewed)

- Component event counts in harness match `deriveTraceDisplayStateForCandles` for seeded windows.
- Chart-events enabled path commits display from `/chart-events`; disabled path uses dense `/signal-trace` for display merge.
- HTF overlays require `htf_context.state` in dense bundles (same invariant as display cache slice).
- Marker count in debug snapshot remains `null` (trade markers derived in renderer; not runtime-owned in Phase 5).

## Tests

- `npm test -- --run src/features/workbenchChartRuntime/` → **49 passed**

## STOP FOR REVIEW

Phase 5 complete. Do not begin Phase 6 atomic cutover until reviewed.
