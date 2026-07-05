# Phase 6.3A — Final Chart Model + Adapter Cutover Report

**Status:** Complete — STOP FOR REVIEW  
**Branch:** `new-workbench-chart-runtime-v2`  
**Base:** `37adebdb6e7f788d35477b89f33591e9f2472fbe` (Phase 6.3-debug)

## Summary

Transferred **only** the `model` domain to `runtime_v2_production` via `phase63AModelAdapterBridge` + `chartModelRuntime` + `derivePhase63AModelDomainFieldsFromRuntime`. All other domains remain `old_production`. No fallback, no dual model owner, no `useWorkbenchChartRuntime` production wiring.

## Changed files

| File | Change |
|---|---|
| `chartRuntimeCutoverConfig.ts` | `cutoverPhase: "6.3A"`, `model: runtime_v2_production`, others `old_production` |
| `phase63AModelAdapterBridge.ts` | **New** — read-only old-pipeline → `resolveChartModelRuntime` bridge |
| `phase63AModelAdapterBridge.test.ts` | **New** — 6.3A config, bridge, guards |
| `runtimeOutputAdapter.contract.ts` | `derivePhase63AModelDomainFieldsFromRuntime`, field key lists |
| `runtimeOutputAdapter.contract.test.ts` | Model-domain derivation test |
| `cutoverPipelineDebug.ts` | **New** — `dbgTimedSyncChartModel` for ChartPanel without runtime internals import |
| `WorkbenchContext.tsx` | Replaced `buildChartViewModel` with 6.3A bridge; chartValue model fields from adapter |
| `ChartPanel.tsx` | `chart.setData.*` marks via `dbgTimedSyncChartModel` (domain `model`) |
| `phase6CutoverTelemetry.test.ts` | Updated for 6.3A defaults |
| `phase6StaticGuards.test.ts` | Allow bridge/contract imports; forbid `buildChartViewModel` |
| `phase6SingleOwnerContract.test.ts` | Allow 6.3A-only runtime imports |
| `runtimeTypes.test.ts`, `pipelineDebug.test.ts` | 6.3A cutover export expectations |
| `index.ts` | Export bridge module |
| `tasks.md` | Mark 6.3A complete |

## Old fields consumed by model bridge (§2.1)

| Old field | Bridge input |
|---|---|
| `chartView.candles` | `chartWindowParts.candles` |
| `chartView.emaOverlays` | `chartWindowParts.emaOverlays` |
| `chartView.auxEmaOverlays` | `chartWindowParts.auxEmaOverlays` |
| `chartDisplayComponentEvents` | `chartWindowParts.componentEvents` |
| `chartDisplayAuxEmaOverlays` | `displayAuxEmaOverlays` |
| `htfAuxEmaOverlayStale` | `auxOverlay.htfAuxEmaOverlayStale` |
| `componentEventsStale` | `traceDisplay.componentEventsStale` |
| `traceDisplayState.status` / `missingRange` | `traceDisplay.traceDisplayState` |
| `chartView.mode/center/first/last/count` | view metadata inputs |

## Adapter output owned by runtime v2 model (§2.2)

`chartViewModel`, `chartCandles`, `chartEmaOverlays`, `chartAuxEmaOverlays`, `chartDisplayAuxEmaOverlays`, `chartDisplayComponentEvents`, `htfAuxEmaOverlayStale`, `componentEventsStale`, `chartViewMode`, `chartViewCenterTimeSec`, `chartViewFirstTimeSec`, `chartViewLastTimeSec`, `chartViewCount` — all via `derivePhase63AModelDomainFieldsFromRuntime`.

## Old passthrough (§2.3) — unchanged

`marketLoadStatus`, `marketError`, `candlesSource`, `marketCandlesCount`, `fullCandleRange`, `displayApplyRevision`, `renderWindowShiftSeq`, `signalTrace*`, `lanesSignalTrace*`, `dispatchChartInteraction`, viewport command stream, selection/context/marker prefs, shell/composer state.

## Ownership proof

- `chartRuntimeCutoverConfig`: only `model` = `runtime_v2_production`
- `wb.cutover.domain_owners` emits updated config on Chart activation
- `wb.model_adapter.apply` → `owner: runtime_v2_production`, `domain: model`, `phase: 6.3A`
- `chart.setData.candles` → `dbgTimedSyncChartModel` → same owner/domain/phase
- Market/render/trace marks unchanged: `owner: old_production`, `phase: 6.3A`
- No `buildChartViewModel` in `WorkbenchContext`
- No forbidden fallback patterns (`?? chartView`, etc.)
- `useWorkbenchChartRuntime` not wired to production

## Checks

| Check | Result |
|---|---|
| `npm run build` | green |
| `phase63AModelAdapterBridge.test.ts` | 6/6 pass |
| `phase6CutoverTelemetry.test.ts` | pass |
| Phase 6.1 guards + single-owner | pass |
| Phase 6.2 stabilization | pass |
| `workbenchLoad.test.tsx` | 22/22 pass |
| `runtimeOutputAdapter.contract.test.ts` | pass |

## Browser smoke (manual gate)

1. `./scripts/dev-workbench.sh --pipeline-debug`
2. Cold Chart open
3. Expect `wb.cutover.domain_owners`: `phase: 6.3A`, `model: runtime_v2_production`, others `old_production`
4. Expect `wb.model_adapter.apply` and `chart.setData.candles` with `owner: runtime_v2_production`, `domain: model`
5. Expect `wb.trace_display.apply_current_window` with `owner: old_production`, `domain: trace`
6. Candles + anchor EMA visible; no blank chart

## Known risks before 6.3B

1. Model bridge recomputes on each relevant `useMemo` change (no stabilize cache in production) — intentional to match old `buildChartViewModel` deps; may revisit reference stability in 6.3B render-window slice.
2. `deriveLegacyWorkbenchChartFieldsFromRuntime` still documents full future cutover shape; only `derivePhase63AModelDomainFieldsFromRuntime` is used in production.
3. Render-window domain still old — `chartView` slice and `chartWindowSlice` remain in `WorkbenchContext`.

## STOP FOR REVIEW

Do not start 6.3B until browser gate passes.
