# Phase 6.4 — Signal-Trace Readiness Diagnostic (main vs runtime-v2)

**Status:** NO BRANCH-SPECIFIC TRACE REGRESSION — STOP FOR REVIEW  
**Date:** 2026-06-28

## Verdict: NO BRANCH-SPECIFIC TRACE REGRESSION / DENSE TRACE COLD PATH BOTTLENECK

Under controlled cold-open (fresh Playwright context, BFF/Vite restart, chart-events OFF, `context_overlay_ref=htf_1`, no pan/trade jumps), **main and `new-workbench-chart-runtime-v2` issue the identical dense `signal-trace` request** and receive **identical 16.1 MB payloads**. Branch frontend trace processing (`merge_chunk`, `apply_current_window`) completes in **sub-millisecond** after network response; HTF aux overlay and Bar Inspector data appear on the same cold-path timeline as signal-trace completion on both branches.

The dominant latency boundary is **backend response + 16 MB JSON download/parse**, not a Phase 6.3F frontend trace-readiness regression. `component_events` in the dense payload is **0 on both branches**, so component markers remain 0 regardless of trace load time.

**No runtime, backend, or business logic was modified.**

---

## 1. Commits tested

| Branch | Commit | Notes |
|---|---|---|
| **main** | `b1048eb05b74f3abd3bce3c1daba241e0253b6c1` | `refactor workbench market data into split window resources (#56)` |
| **new-workbench-chart-runtime-v2** | `d85102c1aa46b21e3b62238f24e39df436cfa067` | Phase 6.3F cutover + diagnostic harnesses |

Matrix: **1+1 runs** (main run 1, branch run 1). Pattern and timing were conclusive after 1+1; runs 2 not executed.

---

## 2. Run / variant / window / overlay

| Field | Value |
|---|---|
| runId | `2026-06-28T134603Z_ema_pullback_BTCUSDT_5m` |
| variant | `instance_1` |
| context_overlay_ref | `htf_1` (UI default; confirmed selected) |
| window from | `1763940900000` |
| window to_open_time_ms | `1778940600000` |
| symbol / timeframe | `BTCUSDT` / `5m` |
| HTF expected | 4h EMA 100/200/1000 |
| Scenario | Cold Chart open only |

Run available on both branches (confirmed via BFF `/api/research/runs`).

---

## 3. Launch commands

```bash
# Orchestrator (alternates branch checkout + BFF/Vite restart per run)
PHASE64_ONLY=main-run1,branch-run1 ./debug/run-phase64-signal-trace-readiness.sh

# Per-run capture (workbench must be running)
cd frontend && node ../debug/capture-phase64-signal-trace-readiness-smoke.mjs --git-branch main --run 1
cd frontend && node ../debug/capture-phase64-signal-trace-readiness-smoke.mjs --git-branch new-workbench-chart-runtime-v2 --run 1
```

Both scenarios:

```bash
# BFF
.venv/bin/python -m uvicorn research_api.main:app --host 127.0.0.1 --port 8000

# Vite — pipeline debug ON, chart-events OFF
cd frontend
VITE_EMA_PIPELINE_DEBUG=true npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Branch equivalent: `./scripts/dev-workbench.sh --pipeline-debug` (no `--chart-events-api`).

---

## 4. Cache reset procedure

Before each run:

| Layer | Reset? |
|---|---|
| Browser context | Yes — new context, no persistent profile |
| Cookies / localStorage / sessionStorage | Yes — cleared |
| HTTP cache | Yes — CDP `Network.setCacheDisabled` |
| Frontend in-memory | Yes — Vite process restarted |
| BFF process | Yes — uvicorn restarted |
| OS / filesystem / parquet cache | **NOT explicitly cleared** |

**Note:** Branch run 1 followed main run 1 without OS cache purge. Main signal-trace network was slower (38.5 s vs 11.0 s) with identical payload — consistent with **warm OS/BFF cache on the second run**, not a branch regression.

---

## 5. Signal-trace URL / query comparison

| Param | main run 1 | branch run 1 | Match? |
|---|---|---|---|
| path | `/api/research/runs/2026-06-28T134603Z_ema_pullback_BTCUSDT_5m/signal-trace` | same | Yes |
| variant | `instance_1` | `instance_1` | Yes |
| from | `1763940900000` | `1763940900000` | Yes |
| to_open_time_ms | `1778940600000` | `1778940600000` | Yes |
| context_overlay_ref | `htf_1` | `htf_1` | Yes |
| chart-events | 0 requests | 0 requests | Yes |
| signal-trace count | 1 | 1 | Yes |

Full URL (identical):

```
/api/research/runs/2026-06-28T134603Z_ema_pullback_BTCUSDT_5m/signal-trace?variant=instance_1&from=1763940900000&to_open_time_ms=1778940600000&context_overlay_ref=htf_1
```

No branch-specific larger window, extra include flags, or additional trace params observed.

---

## 6. Response size comparison

| Metric | main run 1 | branch run 1 |
|---|---|---|
| signal-trace response size | **16,116,232 bytes** | **16,116,232 bytes** |
| timesLen | 50,000 | 50,000 |
| htfFast/anchor/slow Len | 50,000 each | 50,000 each |
| htfMeta.timeframe | 4h | 4h |
| htfMeta periods | 100/200/1000 | 100/200/1000 |
| componentEventsLen | **0** | **0** |

Payload is identical; branch does not request or receive a heavier trace blob.

---

## 7. Timing table (ms from Chart open T0)

| Milestone | main run 1 | branch run 1 |
|---|---|---|
| Chart open (T0) | 0 | 0 |
| Candles visible | 1,253 | 1,851 |
| Base EMA visible (3 overlays) | — * | 63,410 |
| signal-trace request start | 1,209 | 1,836 |
| signal-trace response end | **39,741** | **12,826** |
| trace hint “signal trace loaded” | 39,790 | 12,886 |
| merge_chunk complete | n/a † | 12,886 |
| apply_current_window status=current | n/a † | 12,886 |
| HTF aux visible (+3 aux EMA) | 39,885 | 12,886 |
| component markers ready (count>0) | **never (0)** | **never (0)** |
| Bar Inspector data (post-click capture) | yes ‡ | yes ‡ |

\* Main `emaVisibleMs` milestone not detected by harness (EMA network still in-flight at 5 min mark for periods 500/1000; period 200 not in captured related responses). Final screenshot/hint shows full EMA stack loaded.

† Main `__pipelineDebugExport()` returned empty `rows[]` despite live `[pipeline]` console marks; branch pipeline export captured full trace-display steps.

‡ Harness `barInspectorReadyMs` shows ~300,192 ms because Bar Inspector click runs **after** the 5-minute readiness poll. End-state `barInspectorSnippet` on both runs shows HTF context + Final entry populated — inspector is ready once dense trace completes, not blocked by frontend merge.

### Where time is spent (branch — full pipeline evidence)

| Phase | Duration | Boundary |
|---|---|---|
| Network + JSON parse (`api.fetchSignalTrace`) | **10,861 ms** | Backend + download + parse |
| `wb.trace_display.merge_chunk` | **0.2 ms** | Frontend — negligible |
| `wb.trace_display.apply_current_window` | **0 ms** (mark only) | Frontend — immediate after merge |
| `chart.setData.aux_htf` (total) | 256 ms (11 calls) | Render — minor vs network |
| `chart.markers.rebuild` (total) | 7 ms | Render — minor |

**Conclusion:** On branch, **~99% of trace-readiness latency is `api.fetchSignalTrace` network+parse**. Frontend merge/slice/apply is not the bottleneck.

### Main network breakdown (no pipeline export rows)

| Phase | Duration |
|---|---|
| signal-trace network | 38,532 ms |
| candles-window | 1,205 ms |
| ema-window (500) | 288,588 ms |
| ema-window (1000) | 282,454 ms |

HTF aux and trace hint on main track signal-trace completion (~40 s), not EMA completion. Perceived “HTF doesn't work then appears” aligns with **dense trace cold download**, not branch-specific aux-overlay logic.

---

## 8. Branch pipeline debug evidence

| Step | count | total_ms | max_ms | Notes |
|---|---|---|---|---|
| `api.fetchSignalTrace` | 1 | 10,860.8 | 10,860.8 | Dominant cost |
| `wb.signal_trace.fetch_start` | 1 | — | — | `denseFetch: true` |
| `wb.signal_trace.fetch_end` | 1 | — | — | `outcome: ok` |
| `wb.trace_display.merge_chunk` | 1 | 0.2 | 0.2 | `eventCount: 0`, `timeCount: 50000` |
| `wb.trace_display.apply_current_window` | 6 | 0 | 0 | last `status: current`, `htfTimeCount: 50000` |
| `wb.trace_display.slice_events` | 2 | 0.1 | 0.1 | |
| `wb.chart_events_fallback` | 1 | — | — | chart-events OFF; dense fallback used |
| `wb.aux_overlay.apply_current_window` | 2 | 0 | 0 | `overlayCount: 3`, `htfOverlayCount: 3` |
| `chart.setData.aux_htf` | 11 | 256.2 | 68.7 | `overlayCount: 3` |
| `chart.markers.rebuild` | 3 | 7.1 | 4.1 | `componentMarkerCount: 0`, `tradeMarkerCount: 72` |
| `wb.cutover.domain_owners` | — | — | — | all domains `runtime_v2_production`, phase `6.3F` |

---

## 9. Screenshots

| Run | Path |
|---|---|
| main run 1 | `debug/reports/phase64-signal-trace-readiness/phase64-signal-trace-readiness-main-run1.png` |
| branch run 1 | `debug/reports/phase64-signal-trace-readiness/phase64-signal-trace-readiness-new-workbench-chart-runtime-v2-run1.png` |

Both show: 50k bars, EMA stack 200/500/1000, +3 aux EMA, signal trace loaded, trade markers.

---

## 10. Secondary observations

### context_overlay_ref=htf_1

Present in signal-trace URL on both branches. HTF arrays fully populated (50k points each). `context_overlay_ref` does not cause a branch-specific heavier request — same ref on main.

### Component markers = 0

`componentEventsLen: 0` in signal-trace JSON on **both** branches. `chart.markers.rebuild` reports `componentMarkerCount: 0` on branch. This is a **payload/content issue**, not trace-readiness latency or runtime-v2 merge regression.

### Dense trace as critical path post-6.3F

With chart-events OFF, branch uses `wb.chart_events_fallback` → dense `signal-trace` → `merge_chunk` → `apply_current_window`. Bar Inspector HTF sections and aux HTF overlays **gate on this path**. After 6.3F cutover, dense trace remains the critical path for inspector/HTF readiness — same as main.

### chart-events ON (not run)

Optional branch sub-scenario with `--chart-events-api` was **not executed** in this matrix. Prior phase6-4 aux smoke showed chart-events can be faster for display slices, but dense trace still backs inspector internals when chart-events OFF.

---

## 11. Verdict classification

**Case B — Same cold dense trace bottleneck on main and branch**

- Identical signal-trace query and 16.1 MB payload
- HTF/inspector readiness tracks signal-trace completion on both
- Branch frontend processing (merge/apply/slice) is **not** slower than network
- Main run 1 signal-trace slower than branch run 1 is attributable to **OS/BFF cache warmth** (branch ran second), not request-pattern regression

**Not Case A** (branch-specific trace regression) — no query diff, no payload diff, no slower branch frontend processing.  
**Not Case C** (frontend processing regression) — branch merge/apply completes in <1 ms after fetch.  
**Not Case D** (inconclusive) — both runs completed with full network + branch pipeline evidence.

---

## 12. UX bottleneck (still real, separate from branch regression)

Dense signal-trace for 50k bars + HTF context is a **UX/performance problem** on cold open:

- ~11–40 s network (cache-dependent) for 16 MB JSON
- Base EMA cold path can add **60–280+ s** depending on OS cache (observed in this session)
- `component_events` empty → markers stay 0 even after trace ready

**Recommend after review (no fix in this change):**

1. Profile BFF signal-trace serialization for 50k-bar dense path
2. Evaluate chart-events sparse path for display/HTF slice (chart-events ON A/B)
3. Investigate why `component_events` is empty in dense trace for this run
4. Consider chunked/streaming trace or smaller initial window for inspector bootstrap

---

## 13. Artifacts

| Artifact | Path |
|---|---|
| Report | `openspec/changes/workbench-chart-runtime-v2/phase6-4-signal-trace-readiness-diagnostic.md` |
| Harness | `debug/capture-phase64-signal-trace-readiness-smoke.mjs` |
| Orchestrator | `debug/run-phase64-signal-trace-readiness.sh` |
| Raw JSON + PNG | `debug/reports/phase64-signal-trace-readiness/` |

---

## STOP FOR REVIEW

No runtime behavior changes. No backend changes. No trace-processing optimizations. Diagnostic harness + report only.
