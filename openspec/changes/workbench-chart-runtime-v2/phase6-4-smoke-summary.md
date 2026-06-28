# Phase 6.4 — Smoke Matrix Summary

**Status:** PASS for runtime-v2 cutover correctness — STOP FOR REVIEW  
**Branch:** `new-workbench-chart-runtime-v2`  
**HEAD:** `d85102c1aa46b21e3b62238f24e39df436cfa067`  
**Date:** 2026-06-28

## Executive summary

Phase 6.4 browser smoke and diagnostic matrix confirms that the Phase 6.3F staged cutover to `runtime_v2_production` across all six chart domains is **correct**. No branch-specific regression was found in market load pattern, chart-events path, aux/HTF overlay chain, or signal-trace readiness. Remaining issues are **known backlog** (dense trace cold-path UX, cold EMA backend latency, ChartPanel paint freezes on fast pan, component markers absent in tested payload) and are **not** Phase 6.4 cutover blockers.

**Proceed to Phase 6.5 ownership report.** Do **not** start Phase 7 cleanup until 6.5 explicitly confirms removable dead code.

---

## Smoke matrix

| Smoke / Diagnostic | Scenario | Verdict | Evidence | Notes |
|---|---|---|---|---|
| Cold open | Fresh Chart tab, first load | **PASS** | `debug/reports/phase63F-cold-open.json`; `phase6-3F-market-load-cache-cutover-report.md` §A; chart-events smoke `phase64-chart-events-smoke.json` | Candles visible (`barCount: 50000`); 3 base EMA (`overlayCount: 3`); trade markers (`tradeMarkerCount: 72`); chart not blank; all 6 domains `runtime_v2_production`, `cutoverPhase: 6.3F` |
| Cache revisit / Chart tab revisit | Reports → Chart or tab re-activation | **PASS** | `debug/reports/phase63F-cache-revisit.json` (`scenario: D-cache-revisit`, `ok: true`); `phase6-3F-market-load-cache-cutover-report.md` §D (completed in 6.4 matrix) | No fetch storm; cached display remains alive; candles + 3 EMA remain visible |
| Fast pan / window shift | Left/right pan, coverage shift | **PASS** (performance note) | `debug/reports/phase63F-left-pan.json` (`fetchStarts: 0`, `wb.market_pan_prefetch_decision`); `phase6-3F-market-load-cache-cutover-report.md` §C | Window shift applied/settled; viewport restored; candles + 3 EMA alive; no fetch storm; trace current after shift. **Performance note:** ChartPanel `setData` can still cause visible freezes during fast pan — paint-layer optimization backlog, not market/cache correctness |
| Jump to old trade / around-trade window | Trade focus, distant trade | **PASS** (trace note) | `debug/reports/phase63F-trade-focus.json` (`tradeFocus: true`, around-trade hint); `phase6-3F-market-load-cache-cutover-report.md` §B | Trade focus applied; around-trade window displayed; candles + 3 EMA visible. **Trace note:** older trade/window may show stale/empty trace depending on component event availability — do not classify as viewport failure |
| Chart-events correctness | `VITE_CHART_EVENTS_API=1` under v2 trace owner | **PASS** | `phase6-4-chart-events-smoke-diagnostic.md`; `debug/reports/phase64-chart-events-smoke.json`, `.png` | `/chart-events` 200; `api.fetchChartEvents` present; `wb.chart_events_merge` present; `wb.chart_events_fallback` `flag_disabled` absent; chart healthy: 50k candles, 3 EMA, trade markers. Initial manual failures: `dev-workbench.sh` did not forward `VITE_CHART_EVENTS_API` — fixed in `757cba0` (`--chart-events-api`) |
| Events-vs-trace performance / EMA suspicion | Controlled cold-open A/B OFF vs ON | **PASS** — chart-events does not reproduce EMA regression | `phase6-4-events-vs-trace-perf-smoke.md`; `debug/reports/phase64-perf/` | Chart-events ON not slower than OFF in controlled A/B; EMA count and market cycles identical (3 EMA, 1/1 market cycle); prior slow EMA not attributable to chart-events |
| Main vs runtime-v2 market-load diagnostic | Cold-open request-pattern oracle | **NO BRANCH-SPECIFIC REGRESSION** / backend cold path also slow | `phase6-4-main-vs-runtime-v2-market-load-diagnostic.md`; `debug/reports/phase64-main-vs-branch/` | Main and branch identical: `chart-bundle` 0/0; `candles-window` 1/1; `ema-window` 3/3; `signal-trace` 1/1; EMA periods 200/500/1000; window identical; market cycles 1/1. Phase 6.3F did not introduce branch-specific EMA request-pattern regression |
| Non-empty aux/HTF overlay | Run with `contexts.htf_1`, signal-trace path | **PASS** | `phase6-4-non-empty-aux-htf-overlay-smoke.md`; `debug/reports/phase64-aux-htf-overlay/` | Run `2026-06-28T134603Z_ema_pullback_BTCUSDT_5m`; `context_overlay_ref=htf_1`; BFF 3 HTF EMA × 50k; 4h periods 100/200/1000; `wb.aux_overlay` `overlayCount=3`, `htfOverlayCount=3`; `chart.setData.aux_htf overlayCount=3`; legend 100/4h, 200/4h, 1000/4h. Earlier BFF-only PASS invalid; second run confirmed frontend-visible PASS (chart-events OFF) |
| Signal-trace readiness | Main vs branch dense trace cold path | **NO BRANCH-SPECIFIC TRACE REGRESSION** / dense trace cold-path bottleneck | `phase6-4-signal-trace-readiness-diagnostic.md`; `debug/reports/phase64-signal-trace-readiness/` | Identical request/payload (~16.1 MB, 50k window, `context_overlay_ref=htf_1`); `componentEventsLen=0` on both; main response ~40s, branch ~13s (cache warmth); branch `merge_chunk` ~0.2 ms; `apply_current_window` immediate. Bar Inspector / HTF readiness track dense signal-trace completion |
| Component markers | Trace payload component events | **KNOWN ISSUE** / not a Phase 6.4 cutover blocker | `phase6-4-signal-trace-readiness-diagnostic.md` §10; chart-events smoke `componentMarkerCount: 0` | `componentEventsLen=0` on main and branch; `componentMarkerCount=0`. Data/trace-generation semantics or selected-run issue — not v2 ChartPanel drop/render proof. Separate investigation only if component events expected for run/config |

---

## Suspicions checked and cleared

| Suspicion | Check | Outcome |
|---|---|---|
| Chart-events path breaks chart health or ownership | `phase6-4-chart-events-smoke-diagnostic.md` | **Cleared** — PASS under correct Vite env; all domains remain `runtime_v2_production` |
| Chart-events causes EMA slowdown / extra fetches | `phase6-4-events-vs-trace-perf-smoke.md` A/B | **Cleared** — identical EMA count (3) and market cycles; ON not slower than OFF |
| Phase 6.3F market bridge changed request pattern vs main | `phase6-4-main-vs-runtime-v2-market-load-diagnostic.md` | **Cleared** — identical split-window pattern; no `chart-bundle` on cold open |
| Branch-specific EMA regression (871 s outliers) | Main oracle + perf A/B | **Cleared** — run-to-run backend/OS cache variance; main equally slow on cold path |
| Aux/HTF overlay dropped by v2 runtime | `phase6-4-non-empty-aux-htf-overlay-smoke.md` re-test | **Cleared** — full chain to visible dashed HTF legend; prior BFF-only PASS was invalid |
| Branch-specific trace merge/apply regression | `phase6-4-signal-trace-readiness-diagnostic.md` | **Cleared** — identical payload; branch frontend merge/apply sub-ms; bottleneck is network+parse |
| `dev-workbench.sh` env forwarding for chart-events | Commit `757cba0` | **Cleared** — `--chart-events-api` exports `VITE_CHART_EVENTS_API=1` into Vite terminal |
| Viewport failure on old trade focus | `phase63F-trade-focus.json` | **Cleared** — around-trade window applied; stale trace is separate trace-availability issue |

---

## Known issues / backlog after Phase 6.4

### 1. Dense signal-trace cold-path UX bottleneck

16 MB payload can delay Bar Inspector / HTF overlays / deep diagnostics by 10–40s+ (observed up to ~40s on main, ~13s on warmed branch run). Reproduces on main with identical request/payload. **Not introduced by runtime-v2 frontend.** Future work: trace payload slimming, lazy inspector, backend profiling, streaming/chunking, or reducing critical-path dependence.

### 2. Cold EMA backend/data-path latency

`/api/market/ema-window` can be slow in cold cache scenarios (~73–104 s per call observed; historical warm baseline ~500 ms). Main and branch use identical request pattern. **Out of scope for chart runtime v2.**

### 3. ChartPanel paint freezes on fast pan

Synchronous `setData` for candles/EMA can still freeze UI during fast window shifts. Not a fetch storm. Future paint-layer optimization.

### 4. Component events/markers absence

`componentEventsLen=0` in tested dense trace payload; `componentMarkerCount=0` on main and branch. Separate data/trace-generation semantics investigation — only if component events are expected for that run/config.

### 5. Phase 7 cleanup not started

Old `WorkbenchContext` chart/runtime code must **not** be deleted until Phase 6.5 ownership report explicitly maps removable code and confirms no domain still depends on old owner.

### Matrix gaps (non-blocking)

| Item | Status |
|---|---|
| Full 3×OFF / 3×ON perf matrix | Stopped at 3/6 runs — sufficient for attribution; see `phase6-4-events-vs-trace-perf-smoke.md` |
| Reports → Chart, next/prev trade, variant switch, reload | Covered by 6.3F harness + unit contracts; not re-captured as dedicated Phase 6.4 artifacts |
| chart-events ON for signal-trace readiness | Not run — dense fallback path tested; chart-events correctness separately PASS |

---

## Phase 6.5 readiness

| Gate | Met? |
|---|---|
| All six domains `runtime_v2_production` | **Yes** — confirmed across all smokes |
| No branch-specific market/load regression | **Yes** — main oracle match |
| Chart-events path correct under v2 trace owner | **Yes** |
| Aux/HTF overlay chain with frontend-visible proof | **Yes** |
| Signal-trace readiness not regressed on branch | **Yes** |
| Known bottlenecks classified as out-of-scope backlog | **Yes** |

**Phase 6.5 ownership report may start.**

Phase 6.5 must deliver: final owner matrix, list of dead `WorkbenchContext` chart/runtime code, Phase 7 deletion plan, proof of single active owner per domain. **No deletion in 6.5.**

---

## Why Phase 7 cleanup must wait for 6.5

Phase 7 deletes old `WorkbenchContext` chart/runtime code. Starting cleanup before 6.5 risks removing code that still has hidden dependencies or dual-owner paths. Phase 6.5 must explicitly confirm:

- all six domains are `runtime_v2_production`;
- no `old_production` owner remains;
- no dual owner exists;
- `ChartPanel` is renderer-only;
- `WorkbenchContext` old chart/runtime code is dead/removable;
- known dense trace / EMA cold-path bottlenecks are out-of-scope and not confused with v2 ownership regressions.

Phase 6.4 proves **cutover correctness**; Phase 6.5 proves **ownership completeness and removability**.

---

## Source reports

| Report | Committed |
|---|---|
| `phase6-4-chart-events-smoke-diagnostic.md` | Yes (`aac94b9` / `757cba0`) |
| `phase6-4-events-vs-trace-perf-smoke.md` | Yes |
| `phase6-4-main-vs-runtime-v2-market-load-diagnostic.md` | Yes |
| `phase6-4-non-empty-aux-htf-overlay-smoke.md` | Yes |
| `phase6-4-signal-trace-readiness-diagnostic.md` | Added with this summary (`d85102c` harness commit context) |
| `phase6-3F-market-load-cache-cutover-report.md` | Yes — baseline smokes A–D |

## Raw artifact directories

| Directory | Status |
|---|---|
| `debug/reports/phase64-chart-events-smoke/` | **Flat files** — `phase64-chart-events-smoke.json`, `.png` at `debug/reports/` root (committed) |
| `debug/reports/phase64-perf/` | Committed (OFF1, OFF2, ON1) |
| `debug/reports/phase64-main-vs-branch/` | Committed |
| `debug/reports/phase64-aux-htf-overlay/` | Committed |
| `debug/reports/phase64-signal-trace-readiness/` | Committed with signal-trace diagnostic harness |
| `debug/reports/phase63F-*` | Committed — cold open, trade focus, left pan, cache revisit |

## Harnesses

| Harness | Committed |
|---|---|
| `debug/capture-phase64-chart-events-smoke.mjs` | Yes |
| `debug/capture-phase64-events-vs-trace-perf-smoke.mjs` | Yes |
| `debug/run-phase64-perf-ab.sh` | Yes |
| `debug/capture-phase64-main-vs-branch-smoke.mjs` | Yes |
| `debug/run-phase64-main-vs-branch.sh` | Yes |
| `debug/capture-phase64-aux-htf-overlay-smoke.mjs` | Yes |
| `debug/capture-phase64-signal-trace-readiness-smoke.mjs` | Yes (with this commit) |
| `debug/run-phase64-signal-trace-readiness.sh` | Yes (with this commit) |

---

## Final verdict

**Phase 6.4 smoke matrix: PASS for runtime-v2 cutover correctness.**

Proceed to **Phase 6.5 ownership report**.

Do **not** start **Phase 7 cleanup** until 6.5 explicitly confirms:

- all six domains are `runtime_v2_production`;
- no `old_production` owner remains;
- no dual owner exists;
- `ChartPanel` is renderer-only;
- `WorkbenchContext` old chart/runtime code is dead/removable;
- known dense trace / EMA cold-path bottlenecks are out-of-scope and not confused with v2 ownership regressions.

**STOP FOR REVIEW**
