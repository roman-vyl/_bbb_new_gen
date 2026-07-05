# Phase 6.4 — Chart-Events Path Smoke Diagnostic

**Status:** PASS — STOP FOR REVIEW (no business-logic fix)  
**Branch:** `new-workbench-chart-runtime-v2`  
**Base:** `7cbc669` (6.3F EMA cold-start fix)

## Verdict: PASS

With `VITE_CHART_EVENTS_API=1` and `VITE_EMA_PIPELINE_DEBUG=true` set **before** Vite startup, the chart-events display path activates under v2 trace owner. Chart remains healthy (candles + 3 EMA + trade markers). All domains stay `runtime_v2_production`.

---

## 1. Process stop / port cleanup

```bash
./scripts/stop-workbench.sh || true
kill 15745 15677   # lingering node (5173) + python (8000) after stop script reported busy ports
lsof -i :5173      # empty
lsof -i :8000      # empty
```

Initial `./scripts/stop-workbench.sh` reported ports still listening; manual `kill` of PIDs from `lsof` freed 5173 and 8000.

---

## 2. Env flags used for automated smoke

| Variable | Value | When set |
|---|---|---|
| `VITE_CHART_EVENTS_API` | `"1"` | Before `npm run dev` (Vite embeds at build/dev start) |
| `VITE_EMA_PIPELINE_DEBUG` | `"true"` | Before `npm run dev` |

**Start command (automation — direct, not `dev-workbench.sh` Terminal spawn):**

```bash
# BFF
python -m uvicorn research_api.main:app --host 127.0.0.1 --port 8000

# Vite (separate shell)
cd frontend
export VITE_CHART_EVENTS_API=1 VITE_EMA_PIPELINE_DEBUG=true
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

**Why manual runs failed:** `./scripts/dev-workbench.sh` launches Vite in a **new macOS Terminal** via `osascript`. The generated script only exports `VITE_EMA_PIPELINE_DEBUG=true` when `--pipeline-debug` is passed. It **never exports `VITE_CHART_EVENTS_API`**. Parent-shell env such as `VITE_CHART_EVENTS_API=1 ./scripts/dev-workbench.sh` is **not** forwarded into the Terminal session, so Vite bundles with the flag off → `wb.chart_events_fallback { reason: flag_disabled }`. Without `--pipeline-debug`, pipeline debug globals are also absent → no `[pipeline]` console output.

**Fixup (separate, not implemented):** extend `dev-workbench.sh` / `dev-workbench-debug-mode.sh` with e.g. `--chart-events-api` that exports `VITE_CHART_EVENTS_API=1` in the Vite terminal body (same pattern as `--pipeline-debug`).

---

## 3. Chart-events flag — code reference

| Item | Detail |
|---|---|
| **Exact name** | `VITE_CHART_EVENTS_API` |
| **Expected value** | string `"1"` (strict equality) |
| **Reader** | `isChartEventsApiEnabled()` in `frontend/src/features/chart/runtime/chartEventsLoad.ts` |
| **Condition** | `import.meta.env.VITE_CHART_EVENTS_API === "1"` |
| **When disabled** | `noteChartEventsFlagDisabledOnce()` → `wb.chart_events_fallback { reason: "flag_disabled" }` |
| **Fetch entry** | `fetchChartEvents()` in `frontend/src/api/client.ts` → `dbgTimed("api.fetchChartEvents", …)` → `GET /api/research/runs/{runId}/chart-events?…` |
| **Merge mark** | `loadDisplayTraceChunk()` in `workbenchTraceNetworkLoad.ts` → `dbgMarkCutover(DBG.chartEvents.merge, "trace", …)` |

---

## 4. Pipeline debug flag — code reference

| Item | Detail |
|---|---|
| **Exact name** | `VITE_EMA_PIPELINE_DEBUG` |
| **Expected value** | string `"true"` (strict equality) |
| **Reader** | `pipelineDebugEnabled()` in `frontend/src/shared/diagnostics/pipelineDebug.ts` |
| **Condition** | `import.meta.env.VITE_EMA_PIPELINE_DEBUG === "true"` |
| **When enabled** | Registers `window.__pipelineDebugExport`, `__pipelineDebugFlush`, `__pipelineDebugReset`, `__pipelineDebugHelp`; emits FAQ + live `[pipeline]` console.debug lines |
| **Dev script support** | `./scripts/dev-workbench.sh --pipeline-debug` or `./scripts/dev-workbench-debug-mode.sh` |

Values `"1"` or bare env presence are **not** sufficient for either flag.

---

## 5. Automated smoke (Playwright)

Script: `debug/capture-phase64-chart-events-smoke.mjs`

```bash
cd frontend && node ../debug/capture-phase64-chart-events-smoke.mjs
```

- Fresh browser context, no cache cookies
- Opens `http://127.0.0.1:5173/`, waits for report + chart
- Captures network, `[pipeline]` console, `__pipelineDebugExport()`, screenshot

Artifact paths (local only, not committed): `debug/reports/phase64-chart-events-smoke.json`, `.png`

---

## 6. Network evidence

| Request | Status |
|---|---|
| `GET …/chart-events?variant=instance_1&from=1763940900000&to_open_time_ms=1778940600000` | **200** |
| `GET …/signal-trace?…` (same window) | **200** |

Both fired for the display window. Chart-events path is primary; signal-trace still runs (lanes / fallback path — expected, not a regression for this smoke).

---

## 7. Pipeline evidence

| Step | Count | Notes |
|---|---|---|
| `api.fetchChartEvents` | 1 | 33.8 ms |
| `wb.chart_events_merge` | 2 | last meta: `mergeSource: "chart-events"`, owner `runtime_v2_production`, domain `trace` |
| `wb.chart_events_fallback` | **0** | no `flag_disabled` |
| `wb.chart_events_fetch_fail` | 0 | |

Console: **121** lines matching `[pipeline]` / `[pipeline debug]` including FAQ banner on load.

`__pipelineDebugExport()` confirmed: `hasPipelineExport: true`, `hasPipelineHelp: true`.

---

## 8. Chart health

| Signal | Value |
|---|---|
| `cutoverPhase` | `6.3F` |
| All 6 domains | `runtime_v2_production` |
| `chart.setData.candles` | `barCount: 50000` |
| `chart.setData.anchor_ema` | `overlayCount: 3` |
| `chart.markers.rebuild` | `tradeMarkerCount: 72` |
| Chart panel | Not blank (screenshot captured) |
| `componentMarkerCount` | **0** — separate trace/component-events issue (see §10) |

---

## 9. Component markers (out of scope)

`componentMarkerCount: 0` while chart-events merge succeeded (`mergeSource: "chart-events"`). This is **not** a chart-events flag/path failure. Track under component-events / trace display slice unless chart-events response is confirmed empty on `component_events` (not investigated here per scope).

---

## 10. Checks

| Check | Result |
|---|---|
| `npm run build` (frontend) | **PASS** |
| `workbenchTraceNetworkLoad.test.ts` | **PASS** (20) |
| `traceEventsOverlaysParity.test.ts` | **PASS** (7) |
| `pipelineDebug.test.ts` | **1 pre-existing fail** — expects `cutoverPhase: "6.3A"`, runtime now `"6.3F"` (unrelated to chart-events; fixup: update test expectation) |

---

## 11. Root cause of prior manual confusion

| Symptom | Cause |
|---|---|
| `wb.chart_events_fallback reason: flag_disabled` | Vite started without embedded `VITE_CHART_EVENTS_API=1` (dev script does not pass flag) |
| No `[pipeline]` / missing `__pipelineDebugExport` | Vite started without `VITE_EMA_PIPELINE_DEBUG=true` (forgot `--pipeline-debug` or parent env not forwarded) |

**Not** env name mismatch, **not** runtime condition bug, **not** API 404 — path works when flags are set at Vite startup.

---

## 12. Minimal fixup plan (separate step — NOT implemented)

1. Add `--chart-events-api` to `scripts/dev-workbench.sh` → `export VITE_CHART_EVENTS_API=1` in Vite terminal body.
2. Optionally combine: `./scripts/dev-workbench-debug-mode.sh --chart-events-api` for 6.4 dev workflow.
3. Document in `debug/README.md`: both flags must be in Vite process env; parent-shell export alone is insufficient with current Terminal-spawn scripts.
4. Update `pipelineDebug.test.ts` cutover phase expectation `6.3A` → `6.3F`.
5. Re-run `debug/capture-phase64-chart-events-smoke.mjs` after script change to confirm operator path.

---

## 13. Fixup applied (post-diagnostic)

| Item | Status |
|---|---|
| `--chart-events-api` in `dev-workbench.sh` / `-ChartEventsApi` in `dev-workbench.ps1` | Done |
| `dev-workbench-debug-mode.sh --chart-events-api` forwards via `"$@"` | Done |
| `debug/README.md` chart-events env section | Done |
| `pipelineDebug.test.ts` expects `6.3F` | Done |
| Smoke re-run | **PASS** |

Operator command (macOS):

```bash
./scripts/dev-workbench-debug-mode.sh --chart-events-api
```

---

## Files in this diagnostic commit

| File | Change |
|---|---|
| `openspec/changes/workbench-chart-runtime-v2/phase6-4-chart-events-smoke-diagnostic.md` | **New** — this report |
| `debug/capture-phase64-chart-events-smoke.mjs` | **New** — Playwright smoke harness |

No business-logic, backend, or runtime ownership changes.
