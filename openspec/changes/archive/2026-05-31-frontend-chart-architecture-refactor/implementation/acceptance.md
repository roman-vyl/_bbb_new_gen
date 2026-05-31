# Chart runtime acceptance (OpenSpec §9) — manual

**Status:** **Complete — archived 2026-05-31** (`frontend-chart-architecture-refactor`). §9 manual heavy-run checks passed on operator BTCUSDT 5m. **CI gate:** `npm run build` + `npm test` green at archive time.

**Not automated in CI.** Heavy BTCUSDT 5m + pan UX cannot be asserted reliably with Playwright (multi-minute market bundle, full-range trace, visual flash, pipeline debug counters).

**Follow-up (out of scope):** `docs/frontend/follow-up-workbench-context-decomposition.md` — extract market/run/trace IO from `WorkbenchContext` without changing chart runtime policy.

Proof = operator run + optional `__pipelineDebugExport()` JSON under `debug/reports/`.

## Prerequisites

```bat
scripts\dev-workbench-debug-mode.bat
```

Open latest **BTCUSDT 5m** run → Chart tab. Wait for `Full report range cached` or fallback hint (`Showing` + `OHLC`, no *Market data unavailable*) — 60s+ on heavy runs.

## CI gate (required for archive)

```bat
cd frontend
npm run build
npm test
```

## Checklist (record)

| ID | Result |
|----|--------|
| 9.0 | `npm run build` + `npm test` green |
| 9.1–9.9b | OK — pan, viewport, trace invariants on heavy 5m (manual) |
| 9.10–9.18 | OK — API + inspector data surfaces unchanged (manual) |

Details per item: `tasks.md` §9.

## Pipeline debug (9.4, 0.4)

```js
__pipelineDebugReset()
// scenario…
__pipelineDebugFlush("pan-window-shift")
copy(JSON.stringify(__pipelineDebugExport(), null, 2))
```

Save as `debug/reports/baseline-post-cutover-<date>.json`. Compare qualitatively to pre-cutover baseline (fewer `setData` / `fetch_start` during active pan).

## HTF aux stabilize cache (post-cutover bugfix)

**Symptom:** Bar Inspector showed HTF EMA values but chart had no dashed HTF lines and hint lacked `+N aux EMA (exit/HTF)`.

**Cause:** `stabilizeByWindowBoundsKey` for aux overlays reused an empty slice when render bounds unchanged but HTF merged after trace apply.

**Fix:** `buildAuxOverlaysStabilizeKey` in `chartRenderWindowDisplay.ts` (fingerprint in aux stabilize key).

**Unit test:** `chartRenderWindowDisplay.test.ts` — `must not return stale aux when bounds key unchanged but aux content grew`.

Manual: confirm hint `+3 aux EMA (exit/HTF)` on initial load after trace ready (tasks §9.2).

## Anchor-stack EMA stabilize cache (post-cutover bugfix)

**Symptom:** After switching report variant (e.g. `instance_1` → `instance_2`), solid anchor stack (100/200/500) missing on chart; Bar Inspector showed `— / — / —` for fast/anchor/slow while hint still listed stack periods from strategy spec.

**Cause:** `stabilizeByWindowBoundsKey` for anchor EMA used render bounds only; empty slice cached before new variant market bundle arrived.

**Fix:** `buildEmaOverlaysStabilizeKey(boundsKey, overlays, marketCacheKey)` in `chartRenderWindowDisplay.ts`; `chartWindowSlice` uses it for `chartEmaCacheRef`.

**Unit test:** `chartRenderWindowDisplay.test.ts` — `must not return stale anchor EMA when bounds unchanged but variant market bundle arrives`.

**Manual:** variant switch at same viewport — anchor lines and Bar Inspector EMA values appear after bundle load (tasks §9.12 / §10.1).

**Known UX:** First visit to a new variant on a 600k+ bar run may take 15–60s for cold `fetchChartMarketBundle` (per-variant cache key); repeat switch to same variant is cache-hit fast. Not a stabilize regression.

## Already covered by unit tests (not a substitute for 9.x UI)

- `renderWindowController.test.ts` — pending shift, pointerup commit, idle debounce
- `viewportController.test.ts` — traceReady → noViewportChange, pan suppresses focus
- `signalTraceLoadPolicy.test.ts` — pan-back display cache hit
- `traceDisplayOrchestrator.test.ts` — pan_block / display_cache_hit plan
- `chartViewport.test.ts` — time-anchor restore
- `chartRenderWindowDisplay.test.ts` — aux + anchor stabilize keys / frozen HTF re-slice

## Backend (separate from chart archive gate)

| Scope | Command | Status (2026-05) |
|-------|---------|------------------|
| Workbench API | `python -m pytest -q -m workbench_api` | **64 passed** |
| Full repo | `python -m pytest -q` | Green after fix: `test_feature_plan_includes_exit_ema_outside_stack` no longer passes empty `base.contexts` (let factory infer `htf` from exit_policy consumption). |
