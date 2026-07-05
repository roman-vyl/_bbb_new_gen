# Phase 6.4 — Non-Empty Aux/HTF Overlay Smoke

**Status:** PASS — STOP FOR REVIEW (diagnostic only; no runtime fix)  
**Branch:** `new-workbench-chart-runtime-v2`  
**Commit:** `757cba09045ac464abccd9d1d22672c980746c7b`  
**Captured:** 2026-06-28T14:11:46Z

## Verdict: PASS (with user-visible frontend evidence)

Full HTF overlay chain is intact for run `2026-06-28T134603Z_ema_pullback_BTCUSDT_5m` when workbench is started with pipeline debug and the chart finishes loading.

**Previous aux/HTF PASS is invalid.** Earlier acceptance relied on BFF-only or headless evidence without confirmed user-visible chart rendering. The user initially reported **no HTF EMA on the live frontend**. That state correctly classified as **BUG / NOT PASS**. Re-test after workbench stabilised shows the chain working end-to-end; user confirmed visually: *«заработала — вижу глазами»*.

No runtime/backend fix was implemented in this diagnostic.

---

## 1. Run / expected HTF context

| Field | Value |
|---|---|
| Run | `2026-06-28T134603Z_ema_pullback_BTCUSDT_5m` |
| Variant | `instance_1` |
| Config context | `contexts.htf_1` |
| HTF timeframe | `4h` |
| HTF EMA periods | 100 / 200 / 1000 |
| Exit policy ref | `exit_policy.context_consumption.context_ref = htf_1` |

---

## 2. Workbench setup

```bash
./scripts/dev-workbench.sh --pipeline-debug
```

| Flag | Value |
|---|---|
| `VITE_EMA_PIPELINE_DEBUG` | `"true"` |
| `VITE_CHART_EVENTS_API` | off (signal-trace path) |

Harness: `debug/capture-phase64-aux-htf-overlay-smoke.mjs`

---

## 3. UI state

| Check | Result |
|---|---|
| HTF/context overlay dropdown visible | **yes** (`.chart-panel__overlay-ref`) |
| Options | `— select context —`, `htf_1` |
| Selected value | **`htf_1`** (auto-selected from run config) |
| Chart hint | `… OHLC + EMA stack 200/500/1000 … **+3 aux EMA (exit/HTF)** … signal trace loaded` |
| Manual selection possible | yes (`htf_1` in dropdown) |

---

## 4. Network — request / response

**Path:** `signal-trace` (not chart-events; `wb.chart_events_fallback { reason: flag_disabled }`).

**Request (contains ref — not BUG A):**

```
GET /api/research/runs/2026-06-28T134603Z_ema_pullback_BTCUSDT_5m/signal-trace
  ?variant=instance_1
  &from=1763940900000
  &to_open_time_ms=1778940600000
  &context_overlay_ref=htf_1
```

| Response field | Value |
|---|---|
| HTTP status | 200 |
| `times` length | 50 000 |
| `htf_context.fast` length | 50 000 |
| `htf_context.anchor` length | 50 000 |
| `htf_context.slow` length | 50 000 |
| `htf_context.meta.context_ref` | `htf_1` |
| `htf_context.meta.timeframe` | `4h` |
| `htf_context.meta.fast_period` | 100 |
| `htf_context.meta.anchor_period` | 200 |
| `htf_context.meta.slow_period` | 1000 |

No `/chart-events` request in this run (`hasContextOverlayRefInChartEvents: false`).

---

## 5. Pipeline export evidence

`window.__pipelineDebugExport()` after `__pipelineDebugFlush('phase64-aux-htf-overlay-smoke')`:

| Step | Key fields |
|---|---|
| `wb.cutover.domain_owners` | all domains `runtime_v2_production`; **`aux_overlay`: `runtime_v2_production`** |
| `wb.trace_display.apply_current_window` | `htfTimeCount: 50000`, `status: current` |
| `wb.trace_display.slice_htf` | `source: display_slice` |
| `wb.aux_overlay.apply_current_window` | **`overlayCount: 3`, `htfOverlayCount: 3`** |
| `wb.aux_overlay.slice` | `htfTimeCount: 50000` |
| `wb.chart_window_slice` | `barCount: 50000`, **`overlayCount: 6`** (3 anchor + 3 aux) |
| `chart.setData.anchor_ema` | `overlayCount: 3` |
| `chart.setData.aux_htf` | **`overlayCount: 3`** (10 apply cycles) |
| `api.fetchSignalTrace` | 1 call, 354 ms |

Note: `wb.aux_overlay.stale { stale: true }` appears while signal trace reloads; HTF lines are retained from previous display slice (hint: *«HTF EMA may lag…»*). Overlays still render.

---

## 6. ChartPanel / render evidence

| Check | Result |
|---|---|
| Canvas present | yes (1440×408) |
| `chart.setData.aux_htf` | 3 overlays applied |
| Legend labels (screenshot) | **`100/4h`**, **`200/4h`**, **`1000/4h`** (dashed aux series) |
| Anchor stack legend | EMA fast 200, anchor 500, slow 1000 (solid) |
| HTF context panel | `context_ref: htf_1`, `tf 4h`, EMA fast/anchor/slow values populated |

Code path: `ChartPanel.tsx` reads `chartViewModel.displayAuxEmaOverlays`; aux series use `lineStyle: overlay.dashed ? 2 : 0`.

---

## 7. User-visible confirmation

| Source | Evidence |
|---|---|
| Playwright screenshot | Dashed HTF lines + legend `100/4h`, `200/4h`, `1000/4h` |
| Live user (2026-06-28) | **Confirmed visible on frontend** — *«заработала — вижу глазами»* |

Screenshot: `debug/reports/phase64-aux-htf-overlay/phase64-aux-htf-overlay-smoke.png`

---

## 8. Chain summary

```
contexts.htf_1 (run config)
  → dropdown auto-selects htf_1
  → signal-trace request with context_overlay_ref=htf_1
  → BFF htf_context: 3×50k series, 4h, 100/200/1000
  → wb.aux_overlay: overlayCount=3, htfOverlayCount=3
  → wb.chart_window_slice: overlayCount=6
  → chart.setData.aux_htf: overlayCount=3
  → ChartPanel dashed aux series + legend 100/4h, 200/4h, 1000/4h
  → user-visible chart ✓ (PASS criteria met)
```

**Break point:** none in this successful re-test.

---

## 9. Prior failure vs this PASS

| Aspect | Prior (invalid PASS / user NOT visible) | This re-test |
|---|---|---|
| Evidence type | BFF-only or incomplete load | Full chain + screenshot + user eyes |
| Workbench state | Likely unstable / chart not fully loaded (capture timed out at 30s on first attempt) | Stable load (~6s capture); hint shows `+3 aux EMA` |
| User visibility | User reported **no HTF lines** | User confirms **visible** |
| Classification | **BUG / NOT PASS** (missing frontend display proof) | **PASS** |

Possible contributing factors for the earlier miss (diagnostic hypothesis, not fixed):
- Workbench/process died or chart cold-load not finished before inspection
- HTF lines appear only after signal-trace fetch completes (`htf_1` ref must be on request)
- Stale-retention path (`aux_overlay.stale: true`) may briefly show lag banner before lines appear

---

## 10. Bug-class checklist (this run)

| Class | Condition | This run |
|---|---|---|
| **BUG A** — ref not sent | UI knows `htf_1` but network lacks `context_overlay_ref` | **not triggered** — ref present on signal-trace |
| **BUG B** — runtime drops HTF | Response has HTF but pipeline counts = 0 | **not triggered** — aux counts = 3 throughout |
| **BUG C** — ChartPanel render fail | Window slice non-empty but no visible series | **not triggered** — `chart.setData.aux_htf overlayCount=3`; legend + user see lines |
| **BLOCKED** — no selector | Cannot select `htf_1` | **not triggered** — dropdown works, `htf_1` selected |
| **PASS** | All above + visible HTF EMA | **yes** |

---

## 11. Artifacts

| Artifact | Path |
|---|---|
| JSON capture | `debug/reports/phase64-aux-htf-overlay/phase64-aux-htf-overlay-smoke.json` |
| Screenshot | `debug/reports/phase64-aux-htf-overlay/phase64-aux-htf-overlay-smoke.png` |
| Harness | `debug/capture-phase64-aux-htf-overlay-smoke.mjs` |

---

## 12. Fix status

**No fix implemented.** Diagnostic and report/harness only. Any change to stale-retention UX, chart-events path, or load timing requires separate review.

**STOP FOR REVIEW**
