# Phase 6.3B — Render-Window Cutover Report

**Status:** Complete — STOP FOR REVIEW  
**Branch:** `new-workbench-chart-runtime-v2`  
**Base:** `a1f7519` (Phase 6.3A)

## Owner matrix (after 6.3B)

```json
{
  "model": "runtime_v2_production",
  "render_window": "runtime_v2_production",
  "viewport": "old_production",
  "trace": "old_production",
  "aux_overlay": "old_production",
  "market": "old_production"
}
```

`cutoverPhase: "6.3B"` in `chartRuntimeCutoverConfig.ts`.

## Files changed

| File | Change |
|---|---|
| `frontend/src/features/workbenchChartRuntime/chartRuntimeCutoverConfig.ts` | Phase 6.3B config + `isRenderWindowDomainRuntimeV2Production()` |
| `frontend/src/features/workbenchChartRuntime/phase63BRenderWindowBridge.ts` | **New** thin bridge: init/trade/offset/slice → v2 render-window + chart-window |
| `frontend/src/shared/context/WorkbenchContext.tsx` | Wire v2 render-window owner; model consumes v2-sliced `chartView`; viewport/dispatch split (v2 render + old viewport) |
| `frontend/src/features/workbenchChartRuntime/phase63AModelAdapterBridge.ts` | Remove unused import (build fix) |
| `frontend/src/features/workbenchChartRuntime/phase63BRenderWindowBridge.test.ts` | **New** 6.3B contract tests |
| `frontend/src/features/workbenchChartRuntime/phase6CutoverTelemetry.test.ts` | Update defaults to 6.3B |
| `frontend/src/features/workbenchChartRuntime/phase63AModelAdapterBridge.test.ts` | Model bridge compatibility at 6.3B |
| `frontend/src/features/workbenchChartRuntime/phase6SingleOwnerContract.test.ts` | Allow phase63B bridge imports |
| `frontend/src/features/workbenchChartRuntime/phase6StaticGuards.test.ts` | Allow phase63B bridge import |
| `openspec/changes/workbench-chart-runtime-v2/tasks.md` | Mark 6.3B complete |

## Old render-window responsibilities moved to runtime v2

From `WorkbenchContext` old `chartRuntimeRef.renderWindow` manager path:

- Render-window init on foundation key change (`reset` + tail/trade window build)
- Trade-select window rebuild (`applyRenderWindowForTrade`)
- Bundle-prepend window offset (`offsetWindowStart` on coverage expand left)
- Chart candle / EMA / aux overlay slicing for display window (`chartWindowSlice` memo)
- `chartView` construction from sliced window (mode, center, first/last/count)
- Render-window shift commit handling (`onCommit` → `applyWindowCommit`, `shiftSeq`)
- Render-window interaction dispatch for pan/shift (`renderWindow.dispatch`, `recordBoundaryIntent`)
- Window-swap settle (`settleWindowSwap`)

## Old market fields consumed (read-only)

Runtime v2 render-window bridge reads from old market owner output only:

- `cachedBundle` / `cachedBundle.candles` (loaded candles)
- `cachedBundle.ema_overlays` (loaded EMA overlays)
- `auxEmaOverlays` (old aux overlay state, sliced by window)
- `marketLoadStatus`, `renderWindowFoundationKey`, `intendedRunMarketViewIdentity`
- `selectedTradeEntryTimeMs`, `selectedVariantKey` (trade-centered window metadata)

No `executeMarketWindowLoad`, cache writes, or market fetch from v2 bridge.

## Render-window fields now owned by runtime v2

- Display window selection (tail vs around-trade)
- Chart candle slicing for current window
- EMA overlay slicing for current window
- Aux overlay slicing for current window (from old aux state)
- `chartView` window metadata: `mode`, `centerTimeSec`, `firstTimeSec`, `lastTimeSec`, `count`
- Render-window shift seq on commit
- Render-window revision driving slice recompute

## Remains old passthrough

- Market load/cache/fetch (`executeMarketWindowLoad`, `composeDisplayMarketWindowBundle`, pan prefetch expansion)
- Market error/status/source/count/range ownership
- Viewport command seq/callbacks (`chartRuntimeRef.viewport`)
- `dispatchChartInteraction` viewport half (old viewport controller)
- Selected trade focus command ownership
- Trace loading/fetch/cache, trace lanes, chart-events fetch
- Aux/context selector, HTF overlay loading
- Trace display cache slice/apply for component events and HTF

## Proof: market/viewport/trace/aux stayed `old_production`

- Central config: only `model` + `render_window` = `runtime_v2_production`
- `WorkbenchContext` still contains `executeMarketWindowLoad`, `signalTraceDisplayCacheRef`, `dispatchChartInteraction` (viewport via `chartRuntimeRef.viewport`)
- No `useWorkbenchChartRuntime` hook wired
- Static guards: no forbidden fallback patterns; ChartPanel does not import runtime v2 internals

## Proof: no fallback / dual owner

- Single `chartRuntimeCutoverConfig` source of truth (no scattered boolean flags)
- No `buildChartViewModel` in WorkbenchContext
- No `runtimeOutput ?? chartViewModel` fallback patterns
- One render-window controller (`phase63BRenderWindowOwnerRef`); old `chartRuntimeRef` render window not used for slicing
- Viewport intentionally remains on separate `chartRuntimeRef` instance until 6.3C (documented risk)

## Tests / checks

| Check | Result |
|---|---|
| `phase63BRenderWindowBridge.test.ts` | pass (8) |
| `phase6CutoverTelemetry.test.ts` | pass (7) |
| `phase63AModelAdapterBridge.test.ts` | pass (6) |
| `phase6SingleOwnerContract.test.ts` | pass (6) |
| `phase6StaticGuards.test.ts` | pass (5) |
| `phase6OutputStabilization.test.ts` | pass (10) |
| `phase6ReferenceStabilityContract.test.ts` | pass (5) |
| `phase6MarketTraceReadinessContract.test.ts` | pass (5) |
| `phase6SelectionViewportContract.test.ts` | pass (5) |
| `workbenchLoad.test.tsx` | pass (22) |
| `npm run build` | pass |
| `openspec validate "workbench-chart-runtime-v2" --strict` | CLI not available in CI sandbox; manual validate recommended |

## Browser smoke evidence

Environment: `./scripts/dev-workbench.sh --pipeline-debug` (BFF `:8000`, Vite `:5173`).

Cold Chart open (Playwright headless, first available run):

- Chart hint: `Showing 50000 bars · trade focus · … · OHLC + EMA stack 200/500/1000`
- `wb.cutover.domain_owners`: `phase: 6.3B`, owners matrix as above
- `wb.chart_window_slice`: `owner: runtime_v2_production`, `domain: render_window`, `phase: 6.3B`
- `wb.load.market_bundle_ready`: `owner: old_production`, `domain: market`, `barCount: 50000`
- `wb.model_adapter.apply`: `owner: runtime_v2_production`, `domain: model`, `phase: 6.3B`
- `wb.trace_display.apply_current_window`: `owner: old_production`, `domain: trace`, `phase: 6.3B`
- No blank chart; no fetch storm observed; 107 pipeline marks on cold open

## Known risks before 6.3C

1. **Split runtime instances:** Render-window pan/shift uses v2 `chartRuntime.renderWindow`; viewport commands still use `chartRuntimeRef.viewport`. Viewport/render-window state is not unified until 6.3C viewport cutover.
2. **Foundation-key skip:** Unchanged foundation key correctly skips re-init; trade-only changes rely on dedicated trade effect.
3. **Trace slice timing:** Trace/aux slicing still keyed off v2 `chartView` bounds; trace fetch ownership unchanged — window moves may briefly show stale trace until old trace path catches up (pre-existing behavior).

## STOP FOR REVIEW

Do not start 6.3C until approved.
