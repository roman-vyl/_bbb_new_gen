## 1. pipelineDebug helpers

- [x] 1.1 Add `dbgTimedSync<T>(step, fn, meta?: () => Record<string, unknown>)` — check `pipelineDebugEnabled()` before `performance.now()`, stats, console, and before calling `meta`
- [x] 1.2 Extend `dbgFlush` table with `avg_ms` column (`total_ms / count`)
- [x] 1.3 Export step-id constants or comment block listing `wb.*` / `chart.*` ids (design D3)
- [x] 1.4 Ensure debug-off path is cheap: no `performance.now()`, no console calls, and no expensive meta construction when `VITE_EMA_PIPELINE_DEBUG !== "true"` (audit all new call sites)
- [x] 1.5 Add `window.__pipelineDebugExport()` returning serializable stats rows (no file I/O in browser)
- [x] 1.6 `dbgExport` includes `last_meta` per step; `dbgFlush` table shows last_meta

## 2. WorkbenchContext instrumentation

- [x] 2.1 Time `chartWindowSlice` memo body (`wb.chart_window_slice`) with bar/overlay counts in meta
- [x] 2.2 Mark/time `applyRenderWindowForTrade` (`wb.render_window.trade_select`, meta `rebuilt` / `skipped`)
- [x] 2.3 Mark/time `onRenderWindowShiftRequest` (`wb.render_window.shift`); optional auto `dbgFlush("after-render-window-shift")` only in debug mode, debounced 1000–1500ms
- [x] 2.4 Extend `wb.signal_trace_decision` meta with `displayCacheCoversWindow`; add `wb.trace_display.cache_hit` / `cache_miss`
- [x] 2.5 Wrap display-cache calls from Context only (`mergeDisplayChunk`, slice memos) — do **not** instrument `signalTraceDisplayCache.ts` internals unless call-site timing is insufficient (document exception if any)
- [x] 2.6 Add load-chain marks when report + market bundle + render-window init complete (`wb.load.*`)

## 3. ChartPanel instrumentation

- [x] 3.1 Wrap candle + anchor EMA `setData` effect (`chart.setData.candles`, `chart.setData.anchor_ema`)
- [x] 3.2 Wrap aux HTF `setData` effect (`chart.setData.aux_htf`, meta `overlayCount`)
- [x] 3.3 Wrap markers effect (`chart.markers.rebuild`, meta event/trade counts)
- [x] 3.4 Time viewport apply and post-shift restore (`chart.viewport.apply`, `chart.viewport.restore_after_shift`, meta `method`)
- [x] 3.5 Debounced pan only (no raw `subscribeVisibleLogicalRangeChange` spans): `wb.pan.suppressed_programmatic` | `wb.pan.no_shift` | `wb.pan.shift_requested`; pair with `wb.render_window.shift` in Context when bounds change

## 4. Documentation (manual only)

- [x] 4.1 `debug/README.md` — manual DevTools workflow; save export to `debug/reports/`
- [x] 4.2 `research/diagnostics/README.md` — same manual path
- [x] 4.3 Removed automated workbench runner (`run-workbench-pipeline-debug.bat`, e2e spec)

## 5. Verification

- [ ] 5.1 Manual: `VITE_EMA_PIPELINE_DEBUG=true`, `__pipelineDebugFlush` + `__pipelineDebugExport` with `last_meta` after load-chart / trade-select
- [ ] 5.2 Verify HTF context EMA overlays on variant with `strategy.contexts` (workbench-chart-htf-context-overlays)
