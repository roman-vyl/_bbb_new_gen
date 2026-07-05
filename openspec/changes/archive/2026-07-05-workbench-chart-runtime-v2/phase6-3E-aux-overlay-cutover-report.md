# Phase 6.3E — Aux/HTF Overlay Cutover Report

**Status:** Complete — STOP FOR REVIEW  
**Branch:** `new-workbench-chart-runtime-v2`  
**Base:** `2f83342` (Phase 6.3D)

## Owner matrix (after 6.3E)

```json
{
  "model": "runtime_v2_production",
  "render_window": "runtime_v2_production",
  "viewport": "runtime_v2_production",
  "trace": "runtime_v2_production",
  "aux_overlay": "runtime_v2_production",
  "market": "old_production"
}
```

`cutoverPhase: "6.3E"` in `chartRuntimeCutoverConfig.ts`.

## Files changed

| File | Change |
|---|---|
| `frontend/src/features/workbenchChartRuntime/chartRuntimeCutoverConfig.ts` | Phase 6.3E config + `isAuxOverlayDomainRuntimeV2Production()` |
| `frontend/src/features/workbenchChartRuntime/phase63EAuxOverlayBridge.ts` | **New** thin aux/HTF overlay owner bridge |
| `frontend/src/features/workbenchChartRuntime/phase63EAuxOverlayBridge.test.ts` | **New** 6.3E contract tests |
| `frontend/src/features/workbenchChartRuntime/phase63AModelAdapterBridge.ts` | Accept v2 aux overlay snapshot in model input |
| `frontend/src/shared/context/WorkbenchContext.tsx` | Wire v2 aux owner; remove inline aux/HTF overlay logic |
| `frontend/src/shared/diagnostics/pipelineDebug.ts` | Add `wb.aux_overlay.*` debug steps |
| Phase 6.3A–6.3D tests + guards | Update defaults to 6.3E |
| `openspec/changes/workbench-chart-runtime-v2/tasks.md` | Mark 6.3E complete |

## Old aux/HTF responsibilities moved to runtime v2

From `WorkbenchContext` inline aux path:

- Aux EMA spec resolution sync (`collectAuxEmaSpecs` → `syncPhase63EAuxOverlaySpecs`)
- BFF aux overlay load lifecycle (`loadBffAuxOverlaysRuntime` via bridge)
- HTF overlay from trace display slice (`applyHtfOverlaysFromDisplaySlice`)
- HTF overlay dense-trace fallback (`applyHtfOverlaysFromDenseTrace`)
- Display aux overlay slicing for render window (`resolveAuxOverlayRuntimeSnapshot`)
- HTF stale/current/missing status (`resolveHtfAuxEmaOverlayStale`)
- `wb.trace_display.slice_htf` telemetry (domain: `aux_overlay`)
- Model adapter aux input (`resolvePhase63EModelRuntimeSlice` with `implemented: true`)

Removed: `auxEmaOverlays` React state, `lastSlicedHtfOverlaysRef`, inline `applyHtfOverlaysFromDisplaySlice`, inline BFF fetch effect, inline display aux slicing.

## Aux fields now owned by runtime v2

- `phase63EAuxOverlayOwner().controller` (auxEmaOverlays, frozenHtfOverlays, auxEmaSpecs)
- `auxOverlaySnapshot` (displayAuxEmaOverlays, htfAuxEmaOverlayStale)
- Model-facing aux fields via `resolvePhase63EModelRuntimeSlice` + v2 aux boundary
- Aux pipeline marks: `wb.aux_overlay.apply_current_window`, `wb.aux_overlay.slice`, `wb.aux_overlay.stale`, `wb.aux_overlay.merge`, `wb.trace_display.slice_htf`

## Inputs consumed

| Input | Source |
|---|---|
| Render-window bounds / candles | v2 render-window owner (6.3B) |
| Trace display cache / HTF slice | v2 trace owner (6.3D) |
| Dense signal trace bundle | v2 trace lanes state |
| Market readiness | old market owner (read-only gate for BFF load) |
| Report symbol/range | provider state (read-only for BFF aux fetch) |
| Context overlay selector | provider/UI state (read-only `effectiveContextOverlayRef`) |

## Remains old passthrough (market)

- `executeMarketWindowLoad`, market fetch/cache writes, pan coverage expansion
- Base candle + base EMA loading from market bundle
- Market source/count/range decisions
- Report/composer/shell state
- Context overlay selector UI ownership

## Proof: market stayed `old_production`

- Central config: only `market` = `old_production`
- `WorkbenchContext` still contains `executeMarketWindowLoad`, `composeDisplayMarketWindowBundle`
- Aux bridge has no market fetch/cache helpers
- BFF aux overlay fetch uses report range API, not market cache writes

## Proof: no fallback / dual owner

- Single `chartRuntimeCutoverConfig` source of truth
- One `phase63EAuxOverlayOwner` controller — no parallel aux React state
- Model consumes v2 aux snapshot, not old pre-sliced aux fields
- No `useWorkbenchChartRuntime` hook wired as full owner

## Tests / checks

| Check | Result |
|---|---|
| `phase63EAuxOverlayBridge.test.ts` | pass |
| Phase 6.3D/C/B/A tests | pass |
| `phase6CutoverTelemetry.test.ts` | pass |
| `phase6SingleOwnerContract.test.ts` | pass |
| `phase6StaticGuards.test.ts` | pass |
| `workbenchLoad.test.tsx` | pass |
| `npm run build` | pass |
| `openspec validate --strict` | CLI not available in environment |

## Browser smoke evidence

Environment: `./scripts/dev-workbench.sh --pipeline-debug`.

Cold Chart open (Playwright headless):

- `cutoverPhase`: `6.3E`
- `domainOwners`: model/render_window/viewport/trace/aux_overlay = `runtime_v2_production`, market = `old_production`
- `wb.aux_overlay.apply_current_window`: `owner: runtime_v2_production`, `domain: aux_overlay`
- `wb.trace_display.slice_htf`: `owner: runtime_v2_production`, `domain: aux_overlay`
- `wb.load.market_bundle_ready`: `owner: old_production`, `domain: market`
- `wb.signal_trace.bootstrap_ready`: `owner: runtime_v2_production`, `domain: trace`
- Chart: candles + EMA visible; no blank chart

## Known risks before 6.3F

- Market remains last domain; aux BFF load still gated on old `marketLoadStatus === "ready"`
- BFF aux overlay fetch is not market-cache-owned but depends on report range + market readiness
- Full chart-events-enabled path under v2 trace owner not re-smoked in 6.3E (see follow-up)

## Follow-up for Phase 6.4 smoke matrix

Run **chart-events-enabled path** under v2 trace owner with `VITE_CHART_EVENTS_API=1`. Phase 6.3D manual smoke validated dense fallback only; 6.4 must cover chart-events enabled/disabled matrix explicitly.
