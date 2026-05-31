# Chart runtime acceptance (OpenSpec §9) — manual

**Status:** Passed on heavy BTCUSDT 5m (operator, 2026-05). `tasks.md` §9 items marked complete.

**Not automated in CI.** Heavy BTCUSDT 5m + pan UX cannot be asserted reliably with Playwright (multi-minute market bundle, full-range trace, visual flash, pipeline debug counters).

Proof = operator run + optional `__pipelineDebugExport()` JSON under `debug/reports/`.

## Prerequisites

```bat
scripts\dev-workbench-debug-mode.bat
```

Open latest **BTCUSDT 5m** run → Chart tab. Wait for `Full report range cached` or fallback hint (`Showing` + `OHLC`, no *Market data unavailable*) — 60s+ on heavy runs.

## Checklist (record)

| ID | Result |
|----|--------|
| 9.1–9.9b | OK — pan, viewport, trace invariants on heavy 5m |
| 9.10–9.18 | OK — API + inspector data surfaces unchanged |

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

## Already covered by unit tests (not a substitute for 9.x UI)

- `renderWindowController.test.ts` — pending shift, pointerup commit, idle debounce
- `viewportController.test.ts` — traceReady → noViewportChange, pan suppresses focus
- `signalTraceLoadPolicy.test.ts` — pan-back display cache hit
- `traceDisplayOrchestrator.test.ts` — pan_block / display_cache_hit plan
- `chartViewport.test.ts` — time-anchor restore
- `chartRenderWindowDisplay.test.ts` — aux stabilize key / frozen HTF re-slice
