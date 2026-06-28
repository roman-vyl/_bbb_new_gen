# Phase 6.3F — EMA Overlay Cold-Start Regression Diagnostic

**Status:** Diagnostic only — STOP FOR REVIEW (no fix)  
**Branch:** `new-workbench-chart-runtime-v2`  
**Base:** `d0fc534` (Phase 6.3F market/load/cache cutover)

## 1. Reproduced

Manual cold Chart open with pipeline debug (`debug/manual_smoke_cold_start`):

| Signal | Value |
|---|---|
| `cutoverPhase` | `6.3F` |
| All domains | `runtime_v2_production` |
| `chart.setData.candles` | `barCount: 50000` |
| `wb.load.market_bundle_ready` | `barCount: 50000` (no overlay count before this diagnostic) |
| `api.fetchEmaWindow` | `count: 6` |
| `wb.market_ema_decision` | `count: 9`, last `decision: fetch` |
| `wb.market_fetch.abort_frontend` | `count: 1` |
| `wb.market_fetch.end` (last) | `candlesFetched: false`, `emaFetched: 0` |
| `wb.chart_window_slice` (last) | `barCount: 50000`, `overlayCount: 0` |
| `chart.setData.anchor_ema` (last) | `overlayCount: 0` |

**Symptom:** candles render; anchor EMA overlays never reach chart model / ChartPanel.

## 2. Counters / marks confirming the problem

- Candles path healthy: `market_bundle_ready.barCount=50000`, `chart.setData.candles.barCount=50000`
- EMA network activity happened: `api.fetchEmaWindow.count=6`
- Market planner still wants EMA fetch: `wb.market_ema_decision` last meta `decision: fetch`
- Final market load cycle did **not** commit EMA fetches: `wb.market_fetch.end.emaFetched=0`
- Frontend abort observed: `wb.market_fetch.abort_frontend.count=1`
- Render/model receive zero overlays: `wb.chart_window_slice.overlayCount=0`, `chart.setData.anchor_ema.overlayCount=0`

## 3. First point where `overlayCount` becomes 0

**`composeDisplayMarketWindowBundle` → `bundle.ema_overlays.length === 0`**

Chain (all confirmed zero downstream, not caused by slicing/model):

| Stage | Input EMA count | Output EMA count |
|---|---|---|
| Overlay cache at compose window | miss (`getOverlay` undefined) | — |
| `resolveMarketBundleRuntime` / `composeDisplayMarketWindowBundle` | — | `0` |
| `cachedBundle.ema_overlays` | `0` | — |
| `resolvePhase63BChartWindowSlice` (`wb.render_window.input_overlay_count`) | `0` | `0` (`wb.chart_window_slice`) |
| `resolvePhase63AModelRuntimeSlice` (`wb.model_adapter.input_overlay_count`) | `0` | `0` (`chart.setData.anchor_ema`) |
| ChartPanel | receives `overlayCount: 0` | honest passthrough |

**Render-window slicing does not zero populated overlays** — characterization test with seeded cache passes.

**Model adapter does not zero populated overlays** — passes through `chartView.emaOverlays`.

## 4. Comparison 6.3E (`c4f23ad`) vs 6.3F (`d0fc534`)

### Same (not a regression in these modules)

- `executeMarketWindowLoad` / `planEmaWindowFetchesForView` / `seedEmaWindow` / overlay cache keys
- `composeDisplayMarketWindowBundle` semantics
- `resolveMarketBundleRuntime` uses same compose helper as 6.3E inline `cachedBundle` useMemo
- `phase63BRenderWindowBridge` / `phase63AModelAdapterBridge` slicing/model path unchanged
- Market marks `ready` on **candles only** (not waiting for full EMA coverage) — both phases

### Different in 6.3F (suspect divergence)

| Area | 6.3E | 6.3F |
|---|---|---|
| Market load owner | Inline `WorkbenchContext` + `marketLoadGenRef` | `phase63FMarketLoadBridge` + `runMarketLoadCycle` |
| Effect cleanup | `abort()` + `marketLoadGenRef++` | `abort()` + `cancelPhase63FMarketLoad()` (`generation++`, **inFlightKeys not cleared**) |
| Focus sync | Inline refs | `syncPhase63FMarketFocusWindows` resets `readyTargetKey`, prefetch keys on window change |
| Bundle snapshot | Inline `useMemo` → `composeDisplayMarketWindowBundle` | `resolvePhase63FMarketBundleSnapshot` → `resolveMarketBundleRuntime` (same compose) |
| Telemetry | `market_bundle_ready` barCount only | + diagnostic `anchorEmaOverlayCount` (this commit) |

### Working hypothesis (needs fixup review)

Cold start hits **load-cycle abort + candles-ready-without-EMA**:

1. First market load starts; `api.fetchEmaWindow` runs (6 calls in export).
2. Effect cleanup aborts in-flight load (`wb.market_fetch.abort_frontend`).
3. Subsequent cycle(s): candles `cache_hit`, market `ready`, `emaFetched: 0`.
4. Overlay cache does **not** fully cover compose window (`1763940900–1778940900` ms) at bundle compose time.
5. `composeDisplayMarketWindowBundle` returns candles + **empty** `ema_overlays`.
6. Downstream render/model/ChartPanel correctly propagate `overlayCount: 0`.

Secondary factor: `cancelPhase63FMarketLoad` does not clear `controller.inFlightKeys`; overlapping cycles may silently skip EMA plans (`executeMarketWindowLoad` returns early when key in set, no `wb.market_fetch.skip_in_flight` mark emitted).

## 5. Candles path confirmed healthy

- `wb.market_candles_decision`: `cache_hit`
- `wb.load.market_bundle_ready`: `barCount: 50000`
- `wb.chart_window_slice`: `barCount: 50000`
- No repeated empty `chart.setData.candles`

## 6. Owner matrix confirmed all v2

`wb.cutover.domain_owners`: phase `6.3F`, all six domains `runtime_v2_production`. Regression is not an owner-matrix misconfiguration.

## 7. Related: component markers / trace stale

From same export:

- `chart.markers.rebuild`: `componentMarkerCount: 0`
- `wb.trace_display.apply_current_window`: `status: stale`, `eventCount: 0`, full-window `missingRange`
- `wb.trace_display.cache_miss`: present

Likely **separate timing issue** (trace display cache not ready for render window at cold start). Not root cause of anchor EMA loss (EMA comes from market bundle, not trace). Track in 6.4 smoke matrix.

## 8. Tests added

File: `phase63FEmaOverlayRegressionDiagnostic.test.ts`

| Test | Status | Purpose |
|---|---|---|
| candles-only cache → bundle `ema_overlays.length === 0` | **PASS** | Documents first-zero point at compose |
| seeded EMA cache → bundle retains overlays | **PASS** | Proves compose path works when cache populated |
| empty bundle → render-window slice `0` | **PASS** | Slicing not the drop point |
| seeded bundle → render-window slice nonzero | **PASS** | Slicing preserves overlays |
| empty chartView → model `emaOverlays.length === 0` | **PASS** | Model adapter passthrough |
| no old-market fallback patterns in bridge | **PASS** | Guard |

**No failing tests left in repo** — regression is load/abort/cache-timing, not compose/slice/model logic (characterization tests pass).

## 9. Diagnostic instrumentation added (temporary)

New pipeline marks (pipeline debug only):

| Mark | Domain | Purpose |
|---|---|---|
| `wb.market_overlay_cache_debug` | market | Per-ref cache coverage at compose/focus/coverage windows |
| `wb.market_bundle_overlay_count` | market | Composed bundle `anchorEmaOverlayCount` + point counts |
| `wb.render_window.input_overlay_count` | render_window | `bundle.ema_overlays.length` before slice |
| `wb.model_adapter.input_overlay_count` | model | `chartView.emaOverlays.length` before adapter |
| `wb.load.market_bundle_ready` | market | Now includes `anchorEmaOverlayCount` |

Module: `phase63FEmaOverlayDiagnostics.ts` (clearly diagnostic; remove after fixup).

## 10. Minimal fixup plan (separate step — NOT implemented)

1. **Ensure EMA cache commit + bundle recompose after overlay seeds** even when market already `ready` on candles (verify `bumpMarketOverlayRevision` triggers compose with populated cache).
2. **On `cancelPhase63FMarketLoad`**: clear or invalidate `controller.inFlightKeys` to prevent silent EMA skip across aborted/overlapping cycles.
3. **Consider gating chart-ready bundle** on anchor EMA coverage for compose window, or allow progressive partial `ema_overlays` without emptying chart (match 6.3E observed UX).
4. Re-smoke cold start; expect `wb.market_bundle_overlay_count.anchorEmaOverlayCount > 0` before `wb.chart_window_slice`.
5. Remove temporary diagnostic marks in Phase 7 / post-fixup cleanup.

---

## 11. Fix applied (`5220752` follow-up — pending verification)

**Root cause addressed:** aborted/overlapping market load cycles left EMA fetches unseeded (`api.fetchEmaWindow` without cache commit) and stale `inFlightKeys` blocked retries.

| Change | File |
|---|---|
| `cancelMarketLoadCycle` clears `inFlightKeys` | `marketLoadRuntime.ts` |
| Per-plan `AbortError` swallow for candles/EMA (preserve partial seeds) | `workbenchMarketLoad.ts` |
| `wb.market_fetch.skip_in_flight` telemetry when EMA skipped | `workbenchMarketLoad.ts` |
| `chartWindowSlice` deps include `marketOverlayRevision` + `marketCandlesRevision` | `WorkbenchContext.tsx` |

**Verify:** cold start should show `wb.market_bundle_overlay_count.anchorEmaOverlayCount > 0` and `chart.setData.anchor_ema.overlayCount > 0`.

## Files changed (this diagnostic commit)

| File | Change |
|---|---|
| `phase63FEmaOverlayDiagnostics.ts` | **New** diagnostic emitters |
| `phase63FEmaOverlayRegressionDiagnostic.test.ts` | **New** characterization tests |
| `phase63FMarketLoadBridge.ts` | Wire bundle/cache diagnostics |
| `phase63BRenderWindowBridge.ts` | Input overlay diagnostic |
| `phase63AModelAdapterBridge.ts` | Input overlay diagnostic |
| `pipelineDebug.ts` | Register diagnostic step ids |

## Browser evidence to collect post-merge

Re-run cold open with `./scripts/dev-workbench.sh --pipeline-debug`, then `copy(JSON.stringify(__pipelineDebugExport(), null, 2))`.

Expect new marks to localize cache miss vs compose drop:

- If `wb.market_overlay_cache_debug` shows `composeCovers: false` for all refs → cache/abort/fetch gap.
- If `wb.market_bundle_overlay_count.anchorEmaOverlayCount: 0` but cache shows covers → compose window mismatch.
- If bundle count > 0 but `wb.render_window.input_overlay_count: 0` → impossible (same bundle); would indicate wiring bug.
