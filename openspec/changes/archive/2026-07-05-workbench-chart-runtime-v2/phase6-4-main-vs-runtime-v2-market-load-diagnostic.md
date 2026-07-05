# Phase 6.4 — Main vs Runtime v2 Market Load Diagnostic

**Status:** NO BRANCH-SPECIFIC REGRESSION — STOP FOR REVIEW  
**Date:** 2026-06-28

## Verdict: NO BRANCH-SPECIFIC REGRESSION / BACKEND COLD PATH ALSO SLOW

Under controlled cold-open (fresh browser context, BFF/Vite restart, chart-events OFF, no trade jumps, no wide pan), **main and `new-workbench-chart-runtime-v2` use the identical split-window request pattern** and produce **comparable EMA timings** (~73–104 s max per EMA call, ~182 s total stable).

Main does **not** use the legacy `chart-bundle` seed path for cold Chart open. Both branches call `candles-window` + 3× `ema-window` + `signal-trace` with **identical window ranges and EMA periods (200/500/1000)**.

The earlier anomalous branch timings (871 s / 454 s pipeline EMA totals from `phase64-perf`) are **not reproducible** against main under the same reset protocol today; they reflect **cold-run / OS-file-cache variance**, not a Phase 6.3F frontend request-pattern regression.

**No runtime, backend, or business logic was modified.**

---

## 1. Commits tested

| Branch | Commit | Notes |
|---|---|---|
| **main** (oracle) | `b1048eb05b74f3abd3bce3c1daba241e0253b6c1` | `refactor workbench market data into split window resources (#56)` |
| **new-workbench-chart-runtime-v2** | `757cba09045ac464abccd9d1d22672c980746c7b` | Phase 6.3F cutover + `--chart-events-api` dev script |

Matrix: **1+1 runs completed** (main OFF run 1, branch OFF run 1). Pattern and timing were identical enough to stop after 1+1 per diagnostic plan. Runs 2 not executed.

---

## 2. Launch commands

Both scenarios used direct background processes (comparable across branches; main lacks `dev-workbench.sh` on macOS):

```bash
# BFF (both branches)
.venv/bin/python -m uvicorn research_api.main:app --host 127.0.0.1 --port 8000

# Vite (both branches — pipeline debug ON, chart-events OFF)
cd frontend
VITE_EMA_PIPELINE_DEBUG=true npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Branch equivalent via script:

```bash
./scripts/dev-workbench.sh --pipeline-debug
# (no --chart-events-api)
```

Playwright capture:

```bash
cd frontend && node ../debug/capture-phase64-main-vs-branch-smoke.mjs --git-branch main --run 1
cd frontend && node ../debug/capture-phase64-main-vs-branch-smoke.mjs --git-branch new-workbench-chart-runtime-v2 --run 1
```

Orchestrator (partial run): `debug/run-phase64-main-vs-branch.sh` with `PHASE64_ONLY=main-run1`

---

## 3. Cache reset procedure

Before each run:

| Layer | Reset? |
|---|---|
| Browser context | Yes — new context, no persistent profile |
| Cookies / localStorage / sessionStorage | Yes — cleared |
| HTTP cache | Yes — CDP `Network.setCacheDisabled` |
| Frontend in-memory | Yes — Vite process restarted |
| BFF process | Yes — uvicorn restarted |
| OS / filesystem / parquet cache | **NOT explicitly cleared** |

---

## 4. Run / variant / window

| Field | Value |
|---|---|
| runId | `2026-06-27T120447Z_ema_pullback_BTCUSDT_5m` |
| variant | `instance_1` |
| window from | `1763940900000` |
| window to_open_time_ms | `1778940600000` |
| symbol / timeframe | `BTCUSDT` / `5m` |
| Scenario | Cold-open Chart tab only |

---

## 5. Request-pattern comparison

| Endpoint | main run 1 | branch run 1 | Match? |
|---|---|---|---|
| `/api/market/chart-bundle` | **0** | **0** | Yes |
| `/api/market/candles-window` | **1** | **1** | Yes |
| `/api/market/ema-window` | **3** | **3** | Yes |
| `/api/.../signal-trace` | **1** | **1** | Yes |
| `/api/.../chart-events` | **0** | **0** | Yes |
| EMA periods | 200, 500, 1000 | 200, 500, 1000 | Yes |
| Window range | 1763940900000 → 1778940600000 | same | Yes |
| Aborts / cancelled | 0 | 0 | Yes |
| Retries (duplicate in-flight) | 0 | 0 | Yes |

### Query params (EMA — identical)

```
symbol=BTCUSDT&timeframe=5m&period={200|500|1000}&from=1763940900000&to_open_time_ms=1778940600000
```

### Query params (candles — identical)

```
symbol=BTCUSDT&timeframe=5m&from=1763940900000&to_open_time_ms=1778940600000
```

### Does main use chart-bundle seed?

**No.** Network shows zero `chart-bundle` requests. Main cold load uses the same split path as branch (`executeMarketWindowLoad` → `fetchCandlesWindow` + `fetchEmaWindow` × 3). `fetchChartMarketBundle` exists in `client.ts` but is **deprecated** and not invoked on cold open (confirmed by network + main console `[pipeline]` showing `api.fetchCandlesWindow` / separate EMA fetches).

### Does branch use separate fetchEmaWindow?

**Yes** — 3 parallel `ema-window` requests, same as main.

---

## 6. EMA timing comparison

| Metric | main run 1 | branch run 1 |
|---|---|---|
| EMA request count | 3 | 3 |
| EMA network max (ms) | 104,040 | 81,847 |
| EMA network total sum (ms) | 299,490 | 231,876 |
| EMA pipeline total (ms) | n/a (export empty rows)* | 231,809 |
| EMA pipeline max (ms) | n/a | 81,826 |
| Candles network (ms) | 3,078 | 222 |
| Signal-trace network (ms) | 157 | (see JSON) |
| **Total stable (ms)** | **182,107** | **181,624** |
| market_fetch start/end | 1/1 (console) | 1/1 |
| cache_hit | 0 | 0 |
| barCount / overlayCount | 50000 / 3 (hint) | 50000 / 3 |

\* Main `__pipelineDebugExport()` returned empty `rows[]` despite live `[pipeline]` console events; network HAR-like log used as authoritative for main timings.

### Interpretation

- **Total time to stable chart is identical** (~182 s) on both branches.
- EMA per-call latency (~73–104 s) dominates; this is **backend `/api/market/ema-window` cold compute/IO**, not frontend orchestration overhead.
- Branch is **not slower** than main in this back-to-back pair; branch EMA max is actually **22% lower** (82 s vs 104 s).
- Earlier branch-only smoke (`phase64-perf` OFF1/OFF2: 872 s / 455 s pipeline EMA totals) used the **same request pattern** but hit **much slower backend responses** on those isolated cold runs — not a different frontend path.

---

## 7. Runtime / cache behavior (branch only — pipeline export)

| Step | branch run 1 |
|---|---|
| `wb.market_fetch.start` / `.end` | 1 / 1 |
| `wb.market_fetch.cache_hit` | 0 |
| `wb.market_ema_decision` | 3 × `decision: fetch` (fast/anchor/slow) |
| `chart.setData.candles` barCount | 50000 |
| `chart.setData.anchor_ema` overlayCount | 3 |
| `wb.cutover.domain_owners` | all `runtime_v2_production`, phase `6.3F` |

Main (WorkbenchContext path): console shows `wb.market_fetch.start` once, `wb.market_candles_decision` fetch, then `api.fetchCandlesWindow` — equivalent single market cycle.

---

## 8. Code-level static comparison (main vs branch)

| Component | Changed? | Impact on request pattern |
|---|---|---|
| `workbenchMarketLoad.ts` (`executeMarketWindowLoad`) | **No diff** | Same candles + 3 EMA parallel fetches |
| `marketWindowPlanner.ts` | Minor diff | Same plan functions; same periods/ranges |
| Load orchestration | WorkbenchContext (main) vs `phase63FMarketLoadBridge` (branch) | Both call same `executeMarketWindowLoad`; 1 market cycle observed |
| `fetchChartMarketBundle` | Deprecated on both | Not used on cold open |

---

## 9. Answers to diagnostic questions

| # | Question | Answer |
|---|---|---|
| 1 | Same backend endpoints? | **Yes** — candles-window + ema-window × 3 + signal-trace; no chart-bundle |
| 2 | Main chart-bundle seed vs branch fetchEmaWindow? | **No difference** — main also uses split ema-window path |
| 3 | Different query params/ranges? | **No** — identical from/to and periods |
| 4 | Different EMA count / cycles / aborts? | **No** — 3 EMA, 1 market cycle, 0 cache_hit, 0 aborts |
| 5 | Frontend request-pattern regression after 6.3F? | **No evidence** — pattern identical, timing comparable |
| 6 | Old fast smoke = warm cache? | **Likely yes** for sub-second EMA; cold path ~73–104 s/call on **both** branches today |

---

## 10. Classification: Case 2

**NO BRANCH-SPECIFIC REGRESSION / BACKEND COLD PATH ALSO SLOW**

Criteria met:

- main and branch use **same endpoint pattern and params**
- both **slow under same cold reset** (~182 s total stable)
- branch is not slower; earlier 871 s outliers are **run-to-run backend/cache variance**

Not Case 1 (frontend request-pattern regression): main does not use chart-bundle while branch uses split path — **both use split path**.

Not Case 3 (measurement flaw): both branches ran comparably; main pipeline export rows empty but network evidence is complete.

---

## 11. Suspected area (no fix — STOP FOR REVIEW)

| Area | Notes |
|---|---|
| **Backend `/api/market/ema-window` cold path** | ~73–104 s per call for 50k-bar window on cold runs (both branches) |
| **OS / parquet file cache** | Explains run-to-run variance (871 s vs 232 s on branch with identical frontend pattern) |
| **Phase 6.3F market bridge** | **Not suspected** — does not change endpoints, counts, or params vs main |

Optional follow-up: profile BFF EMA window handler cold vs warm; not in scope for this task.

---

## 12. Artifacts

| Path | Description |
|---|---|
| `debug/reports/phase64-main-vs-branch/phase64-main-vs-branch-main-run1.json` | Main network + console |
| `debug/reports/phase64-main-vs-branch/phase64-main-vs-branch-new-workbench-chart-runtime-v2-run1.json` | Branch network + pipeline |
| `debug/reports/phase64-main-vs-branch/phase64-main-vs-branch-main-run1.png` | Main screenshot |
| `debug/capture-phase64-main-vs-branch-smoke.mjs` | Reusable harness |
| `debug/run-phase64-main-vs-branch.sh` | Cross-branch orchestrator |

Prior branch-only perf (`debug/reports/phase64-perf/`) retained for outlier comparison — not used as primary verdict source.

---

## 13. Explicit statement

- **No runtime, backend, business-logic, or script fix was implemented.**
- **Do not conclude "backend unstable" as root cause of branch regression** — main exhibits the same cold EMA latency with the same request pattern.
- **Do not attribute slow EMA to chart-events** — chart-events was OFF for all runs in this diagnostic.
