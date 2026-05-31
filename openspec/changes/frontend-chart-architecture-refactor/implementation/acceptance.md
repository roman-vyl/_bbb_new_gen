# Chart runtime acceptance (OpenSpec §9) — manual

**Not automated in CI.** Heavy BTCUSDT 5m + pan UX cannot be asserted reliably with Playwright here (multi-minute market bundle, full-range trace, visual flash, pipeline debug counters).

Proof = operator run + optional `__pipelineDebugExport()` JSON saved under `debug/reports/`.

## Prerequisites

```bat
scripts\dev-workbench-debug-mode.bat
```

Open latest **BTCUSDT 5m** run → Chart tab. Wait for `Full report range cached` or fallback hint (`Showing` + `OHLC`, no *Market data unavailable*) — 60s+ on heavy runs.

## Checklist (mark in `tasks.md` when done)

| ID | What to verify |
|----|----------------|
| 9.1 | Chart opens; component events in hint without manual pan |
| 9.2 | HTF/context lines visible; stable after pan + release |
| 9.3 | Fast pan May→Feb/Jan: no May→Feb→May→Feb flash |
| 9.4 | During drag: no `setData` / `fetch_start` storm in pipeline table |
| 9.5 | Select trade while panning: no `apply_trade_focus` (skipped pan) |
| 9.6 | One `shift_applied` per committed pending shift after release |
| 9.7 | Late trace merge: markers/HTF update, viewport unchanged |
| 9.8 | Pan back to cached window: `cache_hit` / `session_hit`, no new fetch |
| 9.9 | Pending pan: `chartWindowKey` unchanged until commit; one key bump on commit |
| 9.9a | Pointer drag commits on pointerup; wheel uses idle debounce |
| 9.9b | Restore uses `restore_by_time_anchor_applied`, not index-only restore |
| 9.10–9.18 | Data surfaces unchanged (API + inspector); see `tasks.md` bullets |

## Pipeline debug (9.4, 0.4)

```js
__pipelineDebugReset()
// scenario…
__pipelineDebugFlush("pan-window-shift")
copy(JSON.stringify(__pipelineDebugExport(), null, 2))
```

Save as `debug/reports/baseline-post-cutover-<date>.json`. Compare qualitatively to pre-cutover baseline (fewer `setData` / `fetch_start` during active pan).

## Already covered by unit tests (not a substitute for 9.x UI)

- `renderWindowController.test.ts` — pending shift, pointerup commit, idle debounce
- `viewportController.test.ts` — traceReady → noViewportChange, pan suppresses focus
- `signalTraceLoadPolicy.test.ts` — pan-back display cache hit
- `traceDisplayOrchestrator.test.ts` — pan_block / display_cache_hit plan
- `chartViewport.test.ts` — time-anchor restore
