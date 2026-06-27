# Phase 6.3C — Viewport Command Cutover Report

**Status:** Complete — STOP FOR REVIEW  
**Branch:** `new-workbench-chart-runtime-v2`  
**Base:** `584b93c` (Phase 6.3B)

## Owner matrix (after 6.3C)

```json
{
  "model": "runtime_v2_production",
  "render_window": "runtime_v2_production",
  "viewport": "runtime_v2_production",
  "trace": "old_production",
  "aux_overlay": "old_production",
  "market": "old_production"
}
```

`cutoverPhase: "6.3C"` in `chartRuntimeCutoverConfig.ts`.

## Files changed

| File | Change |
|---|---|
| `frontend/src/features/workbenchChartRuntime/chartRuntimeCutoverConfig.ts` | Phase 6.3C config + `isViewportDomainRuntimeV2Production()` |
| `frontend/src/features/workbenchChartRuntime/phase63CViewportCommandBridge.ts` | **New** thin viewport command bridge |
| `frontend/src/shared/context/WorkbenchContext.tsx` | Wire v2 viewport owner; remove `chartRuntimeRef` dual-instance split |
| `frontend/src/features/workbenchChartRuntime/phase63CViewportCommandBridge.test.ts` | **New** 6.3C contract tests |
| `frontend/src/features/workbenchChartRuntime/phase6CutoverTelemetry.test.ts` | Update defaults to 6.3C |
| `frontend/src/features/workbenchChartRuntime/phase63AModelAdapterBridge.test.ts` | Model bridge compatibility at 6.3C |
| `frontend/src/features/workbenchChartRuntime/phase63BRenderWindowBridge.test.ts` | Update config expectations |
| `frontend/src/features/workbenchChartRuntime/phase6SingleOwnerContract.test.ts` | Allow phase63C bridge imports |
| `frontend/src/features/workbenchChartRuntime/phase6StaticGuards.test.ts` | Update ownership symbols |
| `openspec/changes/workbench-chart-runtime-v2/tasks.md` | Mark 6.3C complete |

## Old viewport responsibilities moved to runtime v2

From `WorkbenchContext` old `chartRuntimeRef.viewport` path:

- Viewport command candidate filtering (`noViewportChange`, `preserveUserRange`, focus-intent gate)
- Command seq bump + duplicate dedupe
- Command ack (`acknowledgeChartViewportCommand`)
- Pointer-down command cancel + swap-transaction cancel bookkeeping
- Window-swap settle protocol (`settleWindowSwapCommit` / `isWindowSwapTransactionCancelled`)
- Viewport plan sync from `chartView` (`setViewportPlan`)
- Interaction dispatch viewport half (`viewport.dispatch`)
- Trade-select focus command emission (`selectTrade` → `focusTrade`)
- Window-swap restore command (`onWindowSwapCommitted`)
- Trace-ready viewport command (`onTraceReady`)

## Context fields/callbacks now owned by runtime v2 viewport

Still exposed to ChartPanel via same WorkbenchContext API:

- `chartViewportCommand`
- `chartViewportCommandSeq`
- `acknowledgeChartViewportCommand`
- `isWindowSwapTransactionCancelled`
- `settleWindowSwapCommit` (callback from ChartPanel)

Implementation now routes through `phase63CViewportOwner` sharing the v2 `chartRuntime.viewport` controller from phase 6.3B render owner.

## Viewport fields still old / external

None for command stream ownership. Pan-driven **market coverage expansion** remains old (`attemptMarketPanPrefetch` / `executeMarketWindowLoad`) — viewport may observe pan interaction state but does not plan market fetch.

## Remains old passthrough

- Market load/cache/fetch/readiness
- Trace loading/fetch/cache/chart-events
- Aux/HTF overlay loading and context selector
- Report/composer/shell state
- Render-window slicing (6.3B owner, unchanged)
- Final model/adapter (6.3A owner, unchanged)

## Proof: market/trace/aux stayed `old_production`

- Central config: only `model`, `render_window`, `viewport` = `runtime_v2_production`
- `WorkbenchContext` still contains `executeMarketWindowLoad`, `signalTraceDisplayCacheRef`
- Viewport bridge has no market fetch/cache helpers
- No `useWorkbenchChartRuntime` hook wired

## Proof: no fallback / dual owner

- Single `chartRuntimeCutoverConfig` source of truth
- Removed `chartRuntimeRef` — viewport and render-window now share one v2 `chartRuntime` instance
- No `buildChartViewModel` / no old-pipeline fallback patterns
- `recordViewportCommandCandidate` dedupes without seq bump

## Tests / checks

| Check | Result |
|---|---|
| `phase63CViewportCommandBridge.test.ts` | pass (10) |
| `phase63BRenderWindowBridge.test.ts` | pass |
| `phase6CutoverTelemetry.test.ts` | pass |
| `phase63AModelAdapterBridge.test.ts` | pass |
| `phase6SingleOwnerContract.test.ts` | pass |
| `phase6StaticGuards.test.ts` | pass |
| `phase6OutputStabilization.test.ts` | pass |
| `workbenchLoad.test.tsx` | pass (22) |
| `npm run build` | pass |
| `openspec validate --strict` | CLI not available in CI sandbox |

## Browser smoke evidence

Environment: `./scripts/dev-workbench.sh --pipeline-debug`.

Cold Chart open (Playwright headless):

- `wb.cutover.domain_owners`: `phase: 6.3C`, model/render_window/viewport = `runtime_v2_production`, trace/aux/market = `old_production`
- `wb.viewport.command_emit`: `owner: runtime_v2_production`, `domain: viewport`
- `wb.chart_window_slice`: `owner: runtime_v2_production`, `domain: render_window`
- `wb.load.market_bundle_ready`: `owner: old_production`, `domain: market`
- `wb.model_adapter.apply`: `owner: runtime_v2_production`, `domain: model`
- `wb.trace_display.apply_current_window`: `owner: old_production`, `domain: trace`
- Chart: candles + EMA visible, trade focus hint present, no blank chart

## Known risks before 6.3D

1. **Trace display cutover (6.3D):** Viewport `onTraceReady` commands still coordinate with old trace display cache; trace domain transfer may require additional viewport/trace handshake review.
2. **Market pan prefetch:** Pan interaction dispatches through v2 viewport/render-window but market expansion remains old until 6.3F.
3. **Command dedupe:** Duplicate `focusTrade` while `lastCommand` is pending is suppressed; callers must ack before expecting re-emit.

## STOP FOR REVIEW

Do not start 6.3D until approved.
