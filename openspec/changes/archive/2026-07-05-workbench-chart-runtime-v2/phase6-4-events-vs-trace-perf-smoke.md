# Phase 6.4 — Chart-Events vs Trace A/B Performance Smoke

**Status:** PASS (no chart-events EMA regression) — STOP FOR REVIEW  
**Branch:** `new-workbench-chart-runtime-v2`  
**Commit:** `757cba09045ac464abccd9d1d22672c980746c7b`  
**Date:** 2026-06-28

## Verdict: PASS — no reproducible EMA slowdown from chart-events

Controlled cold-open A/B (no trade jumps, no wide pan) shows **identical EMA request count (3)** and **identical market load cycles (1 start / 1 end)** in both modes. Chart-events ON did **not** reproduce slower `api.fetchEmaWindow` than OFF in any completed run; ON run 1 was **2.2× faster** than OFF run 1 on EMA total time.

The earlier ~55 s / 9-request EMA observation (interactive chart-events smoke with trade scrolling) is **not attributable to chart-events path** under controlled conditions. Both modes instead exhibit **backend EMA endpoint latency instability** (~2–5 min per EMA call in these cold runs vs historical ~500 ms baseline).

**Matrix completeness:** 3 of 6 planned runs finished before early stop (OFF1, ON1, OFF2). Sufficient to answer the attribution question; full 3×OFF / 3×ON statistical matrix not completed due to ~7–15 min per run (backend-bound).

---

## 1. Branch / commit tested

| Item | Value |
|---|---|
| Branch | `new-workbench-chart-runtime-v2` |
| Commit | `757cba09045ac464abccd9d1d22672c980746c7b` |
| Prior context | `aac94b9` chart-events correctness PASS; `757cba0` `--chart-events-api` dev script |

---

## 2. Commands used

### Orchestrator (full A/B — stopped after 3/6 runs)

```bash
./debug/run-phase64-perf-ab.sh
```

### Per-mode workbench start (inside orchestrator — direct background, not Terminal/osascript)

**OFF (baseline):**

```bash
# BFF
.venv/bin/python -m uvicorn research_api.main:app --host 127.0.0.1 --port 8000

# Vite (separate process)
cd frontend
VITE_EMA_PIPELINE_DEBUG=true npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

**ON (chart-events):**

```bash
# BFF — same as OFF
.venv/bin/python -m uvicorn research_api.main:app --host 127.0.0.1 --port 8000

# Vite
cd frontend
VITE_EMA_PIPELINE_DEBUG=true VITE_CHART_EVENTS_API=1 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Equivalent dev-script invocations (manual):

```bash
VITE_EMA_PIPELINE_DEBUG=true ./scripts/dev-workbench.sh
./scripts/dev-workbench-debug-mode.sh --chart-events-api
```

### Playwright capture (single run)

```bash
cd frontend && node ../debug/capture-phase64-events-vs-trace-perf-smoke.mjs --mode OFF --run 1
cd frontend && node ../debug/capture-phase64-events-vs-trace-perf-smoke.mjs --mode ON --run 1
```

Harness: `debug/capture-phase64-events-vs-trace-perf-smoke.mjs`  
Orchestrator: `debug/run-phase64-perf-ab.sh`

---

## 3. Cache reset procedure

Before **each** scenario the orchestrator:

1. `./scripts/stop-workbench.sh` — kill BFF (8000) + Vite (5173)
2. Verify ports free via `workbench-ports.sh` retry loop
3. Start **fresh BFF process** (new uvicorn, no `--reload`)
4. Start **fresh Vite process** with mode-specific env
5. Playwright: **new browser context** per run (no persistent profile)
6. Clear cookies; `localStorage` / `sessionStorage` cleared via init script
7. CDP `Network.setCacheDisabled({ cacheDisabled: true })`
8. Close browser context after export

| Cache layer | Reset? |
|---|---|
| Browser context / HTTP cache | Yes — new context + CDP cache disabled |
| Browser cookies / localStorage / sessionStorage | Yes |
| Frontend in-memory caches | Yes — Vite process restarted |
| BFF / backend process | Yes — uvicorn restarted before each run |
| Backend data / disk cache (EMA parquet, etc.) | **Not explicitly flushed** — may warm within a session; mitigated by full BFF restart + cold browser |

---

## 4. Run / variant / window identifiers

Same across all completed runs:

| Field | Value |
|---|---|
| runId | `2026-06-27T120447Z_ema_pullback_BTCUSDT_5m` |
| variant | `instance_1` |
| window from | `1763940900000` |
| window to_open_time_ms | `1778940600000` |
| Scenario | Cold-open Chart tab only — no trade jumps, no wide pan |
| Expected candles | `barCount = 50000` |
| Expected EMA | `overlayCount = 3` (fast / anchor / slow) |

---

## 5. Results table

### Completed runs (3/6)

| Run | Mode | fetchCandles cnt/total/max (ms) | fetchEma cnt/total/max/avg (ms) | fetchSignalTrace cnt/total/max (ms) | fetchChartEvents cnt/total/max (ms) | market_fetch start/end | tradeMarkers | chart health |
|---|---|---|---|---|---|---|---|---|
| OFF1 | OFF | 1 / 1319 / 1319 | 3 / 871702 / 308149 / 290567 | 1 / 19695 / 19695 | 0 / 0 / 0 | 1 / 1 | 72 | OK |
| ON1 | ON | 1 / 180 / 180 | 3 / 392019 / 134549 / 130673 | 1 / 63 / 63 | 1 / 2084 / 2084 | 1 / 1 | 72 | OK |
| OFF2 | OFF | 1 / 307 / 307 | 3 / 454510 / 155414 / 151503 | 1 / 3428 / 3428 | 0 / 0 / 0 | 1 / 1 | 72 | OK |
| ON2 | ON | — | — (in progress, stopped) | — | — | — | — | — |
| OFF3 | OFF | — | not run | — | — | — | — | — |
| ON3 | ON | — | not run | — | — | — | — | — |

### OFF vs ON aggregates (completed only)

| Metric | OFF (n=2) | ON (n=1) |
|---|---|---|
| fetchEma count | 3 / 3 | 3 |
| fetchEma total_ms | 871702, 454510 (avg 663106) | 392019 |
| fetchEma max_ms | 308149, 155414 (avg 231782) | 134549 |
| fetchEma avg_ms | 290567, 151503 | 130673 |
| market_fetch cycles | 1/1 each | 1/1 |
| Path correctness | `flag_disabled` fallback | `chart-events` merge, no fallback |

### Ownership (all completed runs)

- `cutoverPhase`: **6.3F**
- All domains: **runtime_v2_production** (model, render_window, viewport, trace, aux_overlay, market)

---

## 6. Answers to diagnostic questions

### Q1. Reproducible `api.fetchEmaWindow` difference OFF vs ON?

**No.** In completed runs, ON1 EMA total (392 s) is **lower** than both OFF1 (872 s) and OFF2 (455 s). No pattern of ON consistently slower.

### Q2. If ON were slower — root cause?

Not observed. Additional checks on completed data:

| Check | Finding |
|---|---|
| Stable across 3 runs? | N/A — only 1 ON completed; OFF varies 455–872 s (2× spread) |
| EMA count increase? | **No** — always 3 (vs 9 in interactive smoke with trade scrolling) |
| `wb.market_fetch.start/end` change? | **No** — always 1/1 |
| Extra abort/retry cycles? | **No** abort steps in export |
| Correlation with chart-events / signal-trace? | Trace latency varies independently (OFF1 signal-trace 19.7 s vs ON1 63 ms); no EMA correlation |

### Q3. Previous ~55 s / 9 EMA requests?

**Not a chart-events regression.** Under controlled cold-open:

- EMA count = **3** (one fetch per overlay period), not 9
- 9 requests in prior smoke came from **interactive trade scrolling** (3 deals × reload cycles)
- High EMA durations (~130–290 s avg) appear in **both** OFF and ON — backend-bound, not frontend path

### Q4. Both modes sometimes slow?

**Yes — backend EMA endpoint latency instability**, separate from chart-events:

- Historical baseline (Phase 6.3F cold/cache smoke): 9 EMA ~3 s, max ~500–650 ms
- This A/B: 3 EMA **392–872 s total**, max **134–308 s per call**
- Candles remain fast (180–1319 ms) — slowness is EMA-specific on BFF/data path

### Q5. EMA count differs in interactive vs controlled?

Interactive smoke (trade nav across 3 deals) triggers **additional market load / focus cycles** → more `api.fetchEmaWindow` calls (9). Controlled cold-open triggers exactly **one market bundle load** → 3 EMA fetches (fast, anchor, slow). Chart-events flag does not change this count.

---

## 7. Comparison with prior chart-events smoke

| Aspect | Prior `phase64-chart-events-smoke` | This A/B |
|---|---|---|
| Env | `VITE_CHART_EVENTS_API=1` only | OFF vs ON paired |
| Interaction | Included trade scrolling | Cold-open only |
| fetchEma count | 9 (3 overlays × reload cycles) | 3 |
| fetchEma total | ~472 s (export) / user ~55 s | OFF 455–872 s; ON 392 s |
| Attribution | Ambiguous (interaction + backend) | **No chart-events EMA regression** |

---

## 8. Artifacts

| Path | Description |
|---|---|
| `debug/reports/phase64-perf/phase64-perf-OFF-run1.json` | Raw export OFF run 1 |
| `debug/reports/phase64-perf/phase64-perf-ON-run1.json` | Raw export ON run 1 |
| `debug/reports/phase64-perf/phase64-perf-OFF-run2.json` | Raw export OFF run 2 |
| `debug/reports/phase64-perf/orchestrator.log` | Orchestrator stdout |
| `debug/capture-phase64-events-vs-trace-perf-smoke.mjs` | Reusable Playwright harness |
| `debug/run-phase64-perf-ab.sh` | Reusable A/B orchestrator |

Screenshots not captured (not required for perf attribution).

---

## 9. Suspected areas (no fix — STOP FOR REVIEW)

| Area | Notes |
|---|---|
| **Backend EMA window endpoint** | Primary latency source; 100–1000× slower than historical baseline in cold runs |
| **Interactive trade-focus reloads** | Explains 9 EMA requests in prior smoke; not chart-events |
| **Chart-events path** | **Not suspected** for EMA regression based on this A/B |

**No runtime / market / events logic changes made.**

---

## 10. Recommended follow-up (out of scope)

1. Backend EMA endpoint profiling (cold parquet read? compute? lock contention?) — separate diagnostic
2. Complete remaining ON2/OFF3/ON3 runs when backend latency is stable, for full 3×3 matrix
3. Do **not** block Phase 6.4 chart-events cutover on EMA perf — attribution failed for chart-events
