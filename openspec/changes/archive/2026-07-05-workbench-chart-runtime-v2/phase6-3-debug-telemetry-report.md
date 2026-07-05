# Phase 6.3-debug — Owner/Domain/Phase Telemetry Report

**Status:** Complete — STOP FOR REVIEW  
**Branch:** `new-workbench-chart-runtime-v2`  
**Phase tag:** `6.3-debug`

## Summary

Wired cutover ownership telemetry before any production owner transfer. All six chart-runtime domains remain `old_production`; no runtime v2 production owner, no dual owner, no cutover behavior change.

## Changed files

| File | Change |
|---|---|
| `frontend/src/features/workbenchChartRuntime/runtimeTypes.ts` | Added `ChartRuntimeOwner`, `ChartRuntimeDomain`, `ChartRuntimeCutoverPhase`, `ChartRuntimeDomainOwners`, `ChartRuntimeCutoverConfig`; extended `ChartRuntimeDebugSnapshot` with `cutoverPhase` + `domainOwners` |
| `frontend/src/features/workbenchChartRuntime/chartRuntimeCutoverConfig.ts` | **New** — single source of truth for `cutoverPhase` and per-domain owners |
| `frontend/src/features/workbenchChartRuntime/chartRuntimeCutoverTelemetry.ts` | **New** — `cutoverDebugMeta`, `dbgMarkCutover`, `dbgTimedSyncCutover`, `emitCutoverDomainOwnersSnapshot`, export helpers |
| `frontend/src/features/workbenchChartRuntime/runtimeDebug.ts` | Empty debug snapshot includes cutover fields from config |
| `frontend/src/features/workbenchChartRuntime/index.ts` | Export cutover config/telemetry modules |
| `frontend/src/features/workbenchChartRuntime/phase6ContractFixtures.ts` | Fixture debug snapshot includes cutover fields |
| `frontend/src/features/workbenchChartRuntime/phase6CutoverTelemetry.test.ts` | **New** — config/telemetry contract tests |
| `frontend/src/features/workbenchChartRuntime/phase6StaticGuards.test.ts` | Allow telemetry-only WorkbenchContext import |
| `frontend/src/features/workbenchChartRuntime/phase6SingleOwnerContract.test.ts` | Allow telemetry-only WorkbenchContext import |
| `frontend/src/features/workbenchChartRuntime/runtimeTypes.test.ts` | Assert default cutover fields on initial runtime output |
| `frontend/src/shared/diagnostics/pipelineDebug.ts` | `dbgExport()` returns `{ steps, debug: { cutoverPhase, domainOwners } }`; added `PIPELINE_DEBUG_STEPS.cutover.domainOwners` |
| `frontend/src/shared/diagnostics/pipelineDebug.test.ts` | Updated for new export shape + cutover debug fields |
| `frontend/src/shared/context/WorkbenchContext.tsx` | Cutover-tagged domain marks; emit `wb.cutover.domain_owners` on Chart IO activation |
| `frontend/src/features/chart/marketWindowPlanner.ts` | Cutover tags on `wb.market_candles_decision` / `wb.market_ema_decision` |
| `frontend/src/features/chart/runtime/workbenchTraceNetworkLoad.ts` | Cutover tags on trace merge/fetch/chart-events marks |
| Test files using `dbgExport()` | Migrated to `dbgExport().steps` |
| `openspec/changes/workbench-chart-runtime-v2/tasks.md` | Mark 6.3-debug complete |

## Central cutover config

Location: `frontend/src/features/workbenchChartRuntime/chartRuntimeCutoverConfig.ts`

```ts
cutoverPhase: "6.3-debug"
domainOwners: {
  model: "old_production",
  render_window: "old_production",
  viewport: "old_production",
  trace: "old_production",
  aux_overlay: "old_production",
  market: "old_production",
}
```

No scattered boolean flags (`chartRuntimeV2ProductionEnabled` etc.). Later slices (6.3A–6.3F) update only this config.

## Console emission

On Chart tab activation (`chartHeavyIoEnabled`):

```
[pipeline] wb.cutover.domain_owners {
  phase: "6.3-debug",
  owners: { model, render_window, viewport, trace, aux_overlay, market → old_production }
}
```

`__pipelineDebugExport().debug.domainOwners` and `.debug.cutoverPhase` mirror the config (when `VITE_EMA_PIPELINE_DEBUG=true`).

Domain-relevant marks gain `{ owner, domain, phase }` via `cutoverDebugMeta` / `dbgMarkCutover` / `dbgTimedSyncCutover`.

## dbgMark steps tagged with owner/domain/phase

| Step | Domain |
|---|---|
| `wb.cutover.domain_owners` | snapshot (all domains) |
| `wb.load.report_ready` | `market` |
| `wb.market_fetch.start` | `market` |
| `wb.market_fetch.end` | `market` |
| `wb.market_fetch.cache_hit` | `market` |
| `wb.market_candles_decision` | `market` |
| `wb.market_ema_decision` | `market` |
| `wb.load.market_bundle_ready` | `market` |
| `wb.market_pan_prefetch_decision` | `market` |
| `wb.render_window.init` | `render_window` |
| `wb.render_window.trade_select` | `render_window` |
| `wb.chart_window_slice` | `render_window` |
| `wb.signal_trace.bootstrap_blocked` | `trace` |
| `wb.signal_trace.bootstrap_ready` | `trace` |
| `wb.signal_trace_decision` | `trace` |
| `wb.signal_trace.fetch_start` | `trace` |
| `wb.signal_trace.fetch_end` | `trace` |
| `wb.load.market_bundle_ready` | `market` |
| `wb.trace_display.apply_current_window` | `trace` |
| `wb.trace_display.coverage` | `trace` |
| `wb.trace_display.cache_miss` | `trace` |
| `wb.trace_display.merge_chunk` | `trace` |
| `wb.trace_display.slice_events` | `trace` |
| `wb.trace_display.slice_htf` | `aux_overlay` |
| `wb.chart_events_merge` | `trace` |

## Confirmations

- **All domains `old_production`:** yes — config + export + `wb.cutover.domain_owners` payload
- **No owner transfer:** `useWorkbenchChartRuntime` not wired to production; no `runtime_v2_production` in 6.3-debug config
- **No dual owner:** each domain has exactly one entry in `domainOwners`
- **No Phase 6.3A:** adapter/model cutover not started

## Checks run

| Check | Result |
|---|---|
| `npm run build` | green |
| `phase6CutoverTelemetry.test.ts` | 7/7 pass |
| `pipelineDebug.test.ts` | 4/4 pass |
| `runtimeTypes.test.ts` | pass |
| Phase 6.1 static guards | pass (telemetry import allowed) |
| Phase 6.1 single-owner contract | pass |
| Phase 6.2 stabilization | 10/10 pass |
| `workbenchLoad.test.tsx` | 22/22 pass (stdout shows `owner/domain/phase` on trace marks) |
| `workbenchTraceNetworkLoad.test.ts` | pass |

## Browser smoke evidence

**Automated integration (VITE_EMA_PIPELINE_DEBUG=true, workbenchLoad tests):**

Cold chart path emits cutover-tagged marks, e.g.:

```
[pipeline] wb.trace_display.apply_current_window {
  owner: 'old_production',
  domain: 'trace',
  phase: '6.3-debug',
  ...
}
```

**Manual browser gate (operator):**

1. Start workbench with pipeline debug: `./scripts/dev-workbench.sh --pipeline-debug`
2. Cold open Chart tab
3. Filter console: `[pipeline]`
4. Expect `wb.cutover.domain_owners` with `phase: 6.3-debug` and all six domains `old_production`
5. Expect domain marks above include `owner`, `domain`, `phase`
6. `copy(JSON.stringify(__pipelineDebugExport(), null, 2))` → `debug.domainOwners` matches console

Candles render unchanged (old pipeline still owns all domains).

## Known risks before 6.3A

1. **Config vs. reality drift** — until 6.3A, `domainOwners.model` is always `old_production` even if someone adds adapter code; telemetry is the guard rail.
2. **Partial mark coverage** — marks outside the Phase 6.3-debug list (e.g. `wb.trace_display.cache_hit`, viewport chart marks) still lack cutover tags; extend in 6.3A if needed for model domain.
3. **`dbgExport` shape change** — export is now `{ steps, debug }`; saved JSON scripts must use `.steps` for step rows and `.debug.domainOwners` for cutover snapshot.
4. **6.3A field map** — adapter cutover blocked until `phase6-3A-model-adapter-cutover.md` §2 field map is reviewed.

## STOP FOR REVIEW

Do not start 6.3A until browser gate passes with live `wb.cutover.domain_owners` evidence.
