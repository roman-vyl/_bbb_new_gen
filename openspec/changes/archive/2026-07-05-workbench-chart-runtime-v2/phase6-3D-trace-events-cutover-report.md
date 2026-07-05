# Phase 6.3D — Trace/Events Cutover Report

**Status:** Complete — STOP FOR REVIEW  
**Branch:** `new-workbench-chart-runtime-v2`  
**Base:** `57c1637` (Phase 6.3C)

## Owner matrix (after 6.3D)

```json
{
  "model": "runtime_v2_production",
  "render_window": "runtime_v2_production",
  "viewport": "runtime_v2_production",
  "trace": "runtime_v2_production",
  "aux_overlay": "old_production",
  "market": "old_production"
}
```

`cutoverPhase: "6.3D"` in `chartRuntimeCutoverConfig.ts`.

## Files changed

| File | Change |
|---|---|
| `frontend/src/features/workbenchChartRuntime/chartRuntimeCutoverConfig.ts` | Phase 6.3D config + `isTraceDomainRuntimeV2Production()` |
| `frontend/src/features/workbenchChartRuntime/phase63DTraceEventsBridge.ts` | **New** thin trace/events owner bridge |
| `frontend/src/features/workbenchChartRuntime/phase63DTraceEventsBridge.test.ts` | **New** 6.3D contract tests |
| `frontend/src/shared/context/WorkbenchContext.tsx` | Wire v2 trace owner; replace inline trace load effect with bridge |
| `frontend/src/features/workbenchChartRuntime/phase6CutoverTelemetry.test.ts` | Update defaults to 6.3D |
| `frontend/src/features/workbenchChartRuntime/phase63AModelAdapterBridge.test.ts` | Model bridge compatibility at 6.3D |
| `frontend/src/features/workbenchChartRuntime/phase63BRenderWindowBridge.test.ts` | Update config expectations |
| `frontend/src/features/workbenchChartRuntime/phase63CViewportCommandBridge.test.ts` | Update config expectations |
| `frontend/src/features/workbenchChartRuntime/phase6SingleOwnerContract.test.ts` | Allow phase63D bridge; update owner symbols |
| `frontend/src/features/workbenchChartRuntime/phase6StaticGuards.test.ts` | `phase63DTraceOwner` symbol + import guard |
| `frontend/src/features/workbenchChartRuntime/runtimeTypes.test.ts` | Initial runtime debug reflects 6.3D owners |
| `openspec/changes/workbench-chart-runtime-v2/tasks.md` | Mark 6.3D complete |

## Old trace responsibilities moved to runtime v2

From `WorkbenchContext` inline trace path (refs + ~660-line load `useEffect`):

- Trace bootstrap gate (`evaluateSignalTraceBootstrap` orchestration)
- Trace request key / window key selection (`runTraceLoadCycle`)
- Chart-events request lifecycle (`loadDisplayTraceChunk` via instrumented loader)
- Dense signal-trace fallback/request lifecycle (`loadDenseLanesTrace` via instrumented loader)
- Trace display cache ownership (`traceDisplayController.cache` in `phase63DTraceOwner`)
- Trace display chunk merge + coverage (`applyTraceDisplayForWindow`, `resolveDisplayCacheCoverage`)
- `apply_current_window` (`runPhase63DApplyTraceDisplayForWindow`)
- Stale/current/missing range status handling inside `runTraceLoadCycle`
- Component events output for chart markers (display slice → React state sync)
- Trace display revision/status fields for model/adapter (`lanesSignalTraceStatus`, bundle revision)
- Trace-ready notification via existing 6.3C viewport path (`runPhase63COnTraceReady`)

Removed scattered refs: `signalTraceDisplayCacheRef`, `signalTraceBundleSessionCacheRef`, `signalTraceRequestCoordinatorRef`, `traceLoadGenerationRef`, `previousChartWindowKeyRef` — consolidated into `phase63DTraceOwner().traceController` / `.traceDisplayController`.

## Trace fields now owned by runtime v2

- `traceController` (load generation, coordinator, session cache, previous window key)
- `traceDisplayController` (display cache, cache version, apply dedupe)
- `lanesSignalTraceStatus` / dense lanes React state driven from bridge cycle outcome
- `signalTraceBundle` / `componentEvents` / HTF display slice inputs from trace display apply (display only)
- Trace-related pipeline marks with `owner: runtime_v2_production`, `domain: trace`, `phase: 6.3D`

## Inputs consumed from transferred / old domains

| Input | Source |
|---|---|
| Render-window bounds | v2 render-window owner (`phase63B` / `v2ChartRuntime`) |
| Viewport trace-ready command | v2 viewport owner (`runPhase63COnTraceReady`) |
| Market readiness + loaded candles | old market owner (`marketLoadStatus`, `chartCandles`, bundle compose) |
| Run/report/variant identity | WorkbenchContext provider state |
| Chart-events enabled flag | report / feature flags (unchanged) |
| Context overlay ref (cache key only) | old aux passthrough selector value |

## Remains old passthrough (market / aux)

- `executeMarketWindowLoad`, market fetch/cache writes, pan coverage expansion
- Market source/count/range decisions
- Aux/HTF overlay **ownership** (`applyHtfOverlaysFromDisplaySlice` slicing stays in WorkbenchContext; aux BFF load unchanged)
- Context overlay selector ownership
- Report/composer/shell state
- Model (6.3A), render-window (6.3B), viewport (6.3C) paths unchanged

## Proof: market and aux stayed `old_production`

- Central config: only `model`, `render_window`, `viewport`, `trace` = `runtime_v2_production`
- `WorkbenchContext` still contains `executeMarketWindowLoad`, `composeDisplayMarketWindowBundle`
- `phase63DTraceEventsBridge` has no market fetch/cache helpers
- Browser smoke: `wb.market_fetch.*`, `wb.load.market_bundle_ready` → `owner: old_production`, `domain: market`
- No `useWorkbenchChartRuntime` hook wired as full owner

## Proof: no fallback / dual owner

- Single `chartRuntimeCutoverConfig` source of truth (no scattered boolean flags)
- One `phase63DTraceOwner` state object — no parallel `signalTraceDisplayCacheRef`
- Bridge delegates to `runTraceLoadCycle` / `applyTraceDisplayForWindow` (existing v2 modules)
- No `buildChartViewModel` / no old-pipeline fallback patterns
- Repeated apply for same window/cache/status remains no-op (bridge + display runtime dedupe)

## Tests / checks

| Check | Result |
|---|---|
| `phase63DTraceEventsBridge.test.ts` | pass |
| `phase63CViewportCommandBridge.test.ts` | pass |
| `phase63BRenderWindowBridge.test.ts` | pass |
| `phase63AModelAdapterBridge.test.ts` | pass |
| `phase6CutoverTelemetry.test.ts` | pass |
| `phase6SingleOwnerContract.test.ts` | pass |
| `phase6StaticGuards.test.ts` | pass |
| `phase6OutputStabilization.test.ts` | pass |
| `runtimeTypes.test.ts` | pass |
| `workbenchLoad.test.tsx` | pass (22) |
| `npm run build` | pass |
| `openspec validate workbench-chart-runtime-v2 --strict` | CLI not installed in environment |

## Browser smoke evidence

Environment: `./scripts/dev-workbench.sh --pipeline-debug` (BFF `:8000`, Vite `:5173`).

Cold Chart open (Playwright headless):

- `debug.cutoverPhase`: `6.3D`
- `debug.domainOwners`: model/render_window/viewport/trace = `runtime_v2_production`, aux_overlay/market = `old_production`
- `wb.signal_trace.bootstrap_ready`: `owner: runtime_v2_production`, `domain: trace`
- `wb.signal_trace.fetch_start` / `fetch_end`: `owner: runtime_v2_production`, `domain: trace`
- `wb.trace_display.apply_current_window`: present with v2 trace owner
- `wb.load.market_bundle_ready`: `owner: old_production`, `domain: market`
- `wb.market_fetch.start` / `end`: `owner: old_production`, `domain: market`
- `wb.model_adapter.apply`: `owner: runtime_v2_production`, `domain: model`
- Chart hint: candles + EMA + trade markers visible; no blank chart

## Known risks before 6.3E

- Aux/HTF overlay still slices from trace display output in WorkbenchContext while `aux_overlay` owner remains `old_production` — 6.3E must transfer aux ownership without dual-slicing
- Market pan prefetch still old-owned; trace window keys depend on old market candle coverage
- Chart-events vs dense fallback path needs 6.3E+ market/aux coordination when aux overlay moves
- Large `WorkbenchContext` still hosts market + aux orchestration until Phase 6.3E–6.3F
