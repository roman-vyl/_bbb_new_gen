# PR 1 review packet — optimize-workbench-chart-loading

**Branch:** `Workbench-chart-load-optimization`  
**Gate:** OpenSpec task 1.13 — baseline measurements required before PR 2.

## Scope delivered (code)

- Pipeline debug steps + browser helpers (`__pipelineDebugReset`, `__pipelineDebugFlush`, `__pipelineDebugExport`)
- Lazy chart activation (`chartHeavyIoEnabled`, `initialActiveTab` prop for tests)
- Abortable market/trace client + stale-response guards
- Abort + in-flight cleanup fix (market `inFlightKeyRef`, trace coordinator `clearInFlight` on effect cleanup)
- Focused tests: lazy activation, Reports-before-Chart trade selection, StrictMode abort/in-flight regression

## Known limitation (not a PR1 bug)

`WorkbenchProvider` defaults to `initialActiveTab = "chart"`. In the normal app route, chart-heavy IO still starts on cold open. PR 1 lazy activation benefits:

- future Composer/Reports-first routes
- testable activation model
- blocking chart IO until Chart is explicitly activated when starting on Reports

Cold Chart open optimization is **out of PR 1 scope** (later PRs + optional route change).

## Baseline capture procedure

1. Start BFF + frontend with debug flag:
   ```powershell
   cd frontend
   $env:VITE_EMA_PIPELINE_DEBUG="true"
   npm run dev
   ```
2. Open `http://127.0.0.1:5173`, DevTools console.
3. For each scenario below: `__pipelineDebugReset()` → perform scenario → wait until stable → `__pipelineDebugFlush("<name>")` → `copy(JSON.stringify(__pipelineDebugExport(), null, 2))` → save as `debug/reports/workbench-<name>.json`.

| Scenario | Steps | Expected file |
|----------|-------|---------------|
| `cold-chart-open` | Fresh load, default Chart tab, wait for `Full report range cached` (or fallback hints per chart-screenshots rule) | `workbench-cold-chart-open.json` |
| `tab-switch-chart` | Start on Reports (or navigate away from Chart), then switch to Chart tab | `workbench-tab-switch-chart.json` |
| `long-pan-boundary` | Pan until render-window shift crosses boundary; wait for shift settle | `workbench-long-pan-boundary.json` |
| `distant-trade-navigation` | Select a trade far from current viewport | `workbench-distant-trade-navigation.json` |

## Baseline measurements

| Scenario | Status | Key timings / notes |
|----------|--------|---------------------|
| cold-chart-open | **captured** | `api.fetchChartMarketBundle` ~113s; `api.fetchSignalTrace` ~1.4s; `market_fetch.start`×2 + `abort_frontend`×1 + `end`×1 (StrictMode, no orphan `skip_in_flight`); trace complete (`fetch_end`, 562 events) |
| tab-switch-chart | **captured** | After reset: `api.fetchSignalTrace` ~11s (cache warm BFF); chart `setData` only; no market refetch |
| long-pan-boundary | **needs manual re-capture** | Auto pan did not trigger `wb.render_window.shift_applied` (Playwright drag on canvas). Current JSON has only 2 steps — not valid baseline |
| distant-trade-navigation | **captured (thin)** | Auto: oldest trade from Reports → Chart; only `markers.rebuild` + `trace_display.apply` (same render window, no new `/signal-trace`). Consider manual re-capture if you want viewport-shift + trace decision steps |

Files: `debug/reports/workbench-*.json`. Re-capture script: `node debug/capture-pr1-baselines.mjs` (env `PR1_BASELINE_FROM=1..4`).

## Approval

- [ ] User reviewed baseline JSON for all four scenarios
- [ ] User approves starting PR 2 (WorkbenchContext split)
