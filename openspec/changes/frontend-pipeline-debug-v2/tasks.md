## 1. pipelineDebug helpers

- [ ] 1.1 Add `dbgTimedSync<T>(step, fn, meta?: () => Record<string, unknown>)` — check `pipelineDebugEnabled()` before `performance.now()`, stats, console, and before calling `meta`
- [ ] 1.2 Extend `dbgFlush` table with `avg_ms` column (`total_ms / count`)
- [ ] 1.3 Export step-id constants or comment block listing `wb.*` / `chart.*` ids (design D3)
- [ ] 1.4 Ensure debug-off path is cheap: no `performance.now()`, no console calls, and no expensive meta construction when `VITE_EMA_PIPELINE_DEBUG !== "true"` (audit all new call sites)
- [ ] 1.5 Add `window.__pipelineDebugExport()` returning serializable stats rows for Playwright/bat runner (no file I/O in browser)

## 2. WorkbenchContext instrumentation

- [ ] 2.1 Time `chartWindowSlice` memo body (`wb.chart_window_slice`) with bar/overlay counts in meta
- [ ] 2.2 Mark/time `applyRenderWindowForTrade` (`wb.render_window.trade_select`, meta `rebuilt` / `skipped`)
- [ ] 2.3 Mark/time `onRenderWindowShiftRequest` (`wb.render_window.shift`); optional auto `dbgFlush("after-render-window-shift")` only in debug mode, debounced 1000–1500ms
- [ ] 2.4 Extend `wb.signal_trace_decision` meta with `displayCacheCoversWindow`; add `wb.trace_display.cache_hit` / `cache_miss`
- [ ] 2.5 Wrap display-cache calls from Context only (`mergeDisplayChunk`, slice memos) — do **not** instrument `signalTraceDisplayCache.ts` internals unless call-site timing is insufficient (document exception if any)
- [ ] 2.6 Add load-chain marks when report + market bundle + render-window init complete (`wb.load.*`)

## 3. ChartPanel instrumentation

- [ ] 3.1 Wrap candle + anchor EMA `setData` effect (`chart.setData.candles`, `chart.setData.anchor_ema`)
- [ ] 3.2 Wrap aux HTF `setData` effect (`chart.setData.aux_htf`, meta `overlayCount`)
- [ ] 3.3 Wrap markers effect (`chart.markers.rebuild`, meta event/trade counts)
- [ ] 3.4 Time viewport apply and post-shift restore (`chart.viewport.apply`, `chart.viewport.restore_after_shift`, meta `method`)
- [ ] 3.5 Debounced pan only (no raw `subscribeVisibleLogicalRangeChange` spans): `wb.pan.suppressed_programmatic` | `wb.pan.no_shift` | `wb.pan.shift_requested`; pair with `wb.render_window.shift` in Context when bounds change

## 4. Bat runner and saved reports

- [ ] 4.1 Add `debug/run-workbench-pipeline-debug.bat`: stamp `workbench_YYYYMMDD_HHmmss.log`, copy to `workbench-latest.log`, run Playwright from `frontend/`
- [ ] 4.2 Add `frontend/e2e/workbench-pipeline-debug.spec.ts`: four scenarios (trade select, pan safe zone, pan shift, cache hit); flush/export after each; write logs via Node to `debug/reports/`
- [ ] 4.3 Update `debug/README.md` and `research/diagnostics/README.md`: two bats — `run-pipeline-debug.bat` (Python) vs `run-workbench-pipeline-debug.bat` (frontend); both output under `debug/reports/`
- [ ] 4.4 Extend `debug/.gitignore` for `workbench_*.log` / `workbench_*.txt` (keep committed samples optional)

## 5. Verification

- [ ] 5.1 Run `debug\run-workbench-pipeline-debug.bat` once; confirm `debug/reports/workbench_*.log` contains `[pipeline]` lines and flush tables for all scenarios
- [ ] 5.2 Verify HTF context EMA overlays still render on variant with `strategy.contexts` after instrumentation (workbench-chart-htf-context-overlays)
