# Phase 6.3F — Market/Load/Cache Cutover Report

**Status:** Complete — STOP FOR REVIEW  
**Branch:** `new-workbench-chart-runtime-v2`  
**Base:** `c4f23ad` (Phase 6.3E)

## Owner matrix (after 6.3F)

```json
{
  "model": "runtime_v2_production",
  "render_window": "runtime_v2_production",
  "viewport": "runtime_v2_production",
  "trace": "runtime_v2_production",
  "aux_overlay": "runtime_v2_production",
  "market": "runtime_v2_production"
}
```

`cutoverPhase: "6.3F"` in `chartRuntimeCutoverConfig.ts`. No `old_production` domain remains.

## Files changed

| File | Change |
|---|---|
| `frontend/src/features/workbenchChartRuntime/chartRuntimeCutoverConfig.ts` | Phase 6.3F config + `isMarketDomainRuntimeV2Production()` |
| `frontend/src/features/workbenchChartRuntime/phase63FMarketLoadBridge.ts` | **New** thin market/load/cache owner bridge |
| `frontend/src/features/workbenchChartRuntime/phase63FMarketLoadBridge.test.ts` | **New** 6.3F contract tests |
| `frontend/src/shared/context/WorkbenchContext.tsx` | Wire v2 market owner; remove inline market load/bundle/pan logic |
| Phase 6.3A–6.3E tests + guards | Update defaults to 6.3F |
| `openspec/changes/workbench-chart-runtime-v2/tasks.md` | Mark 6.3F complete |

## Old market responsibilities moved to runtime v2

From `WorkbenchContext` inline market path:

- Market view resolution + error handling (`resolvePhase63FMarketView`)
- Focus/coverage window sync + reset keys (`syncPhase63FMarketFocusWindows`)
- Chart IO gate integration (heavy IO blocked telemetry unchanged)
- Candles/EMA fetch via `runPhase63FMarketLoad` → `runMarketLoadCycle` → `executeMarketWindowLoad`
- Cache hit/miss, in-flight dedupe, abort/generation lifecycle (controller in bridge)
- Market load status/error/identity React sync (`resolvePhase63FMarketReactSync`)
- Bundle composition (`resolvePhase63FMarketBundleSnapshot` → `resolveMarketBundleRuntime`)
- Render-window foundation key derivation
- Pan-driven coverage expansion (`evaluatePhase63FPanPrefetch`)
- Compose focus fallback telemetry (`logPhase63FComposeFocusFallback`)
- Market bundle ready telemetry (deduped by foundation key)

Removed from WorkbenchContext direct use: `executeMarketWindowLoad`, `composeDisplayMarketWindowBundle`, inline load effect (~160 lines), scattered market prefetch refs.

## Market fields now owned by runtime v2

- `phase63FMarketLoadOwner().controller` (status, error, readyIdentity, readyTargetKey, generation, inFlightKeys, revisions)
- Pan prefetch / compose / bundle-ready dedupe state in owner
- `marketBundleSnapshot` (bundle, foundationKey, market output fields)
- Market pipeline marks with `owner: runtime_v2_production`, `domain: market`, `phase: "6.3F"`

## Fetch/cache/bundle contracts preserved

- Heavy chart IO only after Chart tab activation (`chartHeavyIoEnabled`)
- Selected trade focus uses `resolveMarketTargetWindow` around trade entry
- Reset on market identity/window change via `syncPhase63FMarketFocusWindows`
- Unchanged reset key preserves focus/coverage object refs where possible
- Cache-hit does not repeatedly promote (`lastBundleReadyKey` dedupe)
- In-flight duplicate requests dedupe via controller `inFlightKeys`
- Abort/generation on identity/window change via `cancelPhase63FMarketLoad`
- Pan prefetch no-op when clamped/unchanged (expansion key dedupe)
- EMA overlays load progressively via chunk seeded callbacks

## Proof: all six domains `runtime_v2_production`

- Central config: `PHASE_63F_DOMAIN_OWNERS` — all six domains v2
- `runtimeV2ProductionDomains()` returns length 6
- No `old_production` in active config

## Proof: no old market fallback / dual owner

- Single `chartRuntimeCutoverConfig` source of truth
- One `phase63FMarketLoadOwner` — WorkbenchContext does not call `executeMarketWindowLoad` directly
- No `?? oldMarketBundle` / hidden fallback patterns
- Guards assert `executeMarketWindowLoad` absent from WorkbenchContext

## Tests / checks

| Check | Result |
|---|---|
| `phase63FMarketLoadBridge.test.ts` | pass (8) |
| Phase 6.3E/D/C/B/A tests | pass |
| `phase6CutoverTelemetry.test.ts` | pass |
| `phase6SingleOwnerContract.test.ts` | pass |
| `phase6StaticGuards.test.ts` | pass |
| `workbenchLoad.test.tsx` | pass (22) |
| All `workbenchChartRuntime/` (170) | pass |
| `npm run build` | pass |
| `openspec validate --strict` | CLI not available in environment |

## Browser smoke evidence

Environment: `./scripts/dev-workbench.sh --pipeline-debug`. Playwright headless (`debug/capture-phase63F-smoke.mjs`).

### A. Cold Chart open — PASS

Evidence: `debug/reports/phase63F-cold-open.json`

- `cutoverPhase`: `6.3F`
- All six domains `runtime_v2_production`
- `wb.load.market_bundle_ready`: `owner: runtime_v2_production`, `domain: market`, barCount > 0
- `wb.market_fetch.start` / `end`: v2 market owner
- Chart: candles + EMA visible; no blank chart

### B. Selected trade focus — PASS

Evidence: `debug/reports/phase63F-trade-focus.json`

- Trade focus hint visible (`trade focus`, around-trade window)
- Domain owners remain 6.3F / all v2

### C. Left pan / boundary expansion — PASS

Evidence: `debug/reports/phase63F-left-pan.json`

- `wb.market_pan_prefetch_decision`: `owner: runtime_v2_production`, `domain: market`, `phase: 6.3F`
- No fetch storm (`fetchStarts: 0` after reset)
- Pan prefetch clamped no-op path exercised

### D. Cache hit / revisit — DEFERRED to 6.4

Not completed in this review cycle (smoke run interrupted). Covered by unit tests for cache-hit dedupe; full revisit matrix belongs in Phase 6.4 smoke.

## Known risks before 6.4

- Full staged cutover complete but old WorkbenchContext code paths still physically present until Phase 7
- Chart-events-enabled path not re-smoked in 6.3F
- Real non-empty aux/HTF overlay scenario needs dedicated smoke

## Follow-ups for Phase 6.4 smoke matrix

- Chart-events-enabled path under v2 trace owner with `VITE_CHART_EVENTS_API=1`
- Real non-empty aux/HTF overlay scenario
- Churn/reference stability review (`phase6OutputStabilization` + live counts)
- Temporary debug/cutover telemetry cleanup deferred to Phase 7/post-cutover cleanup
