# Signal trace window perf (trace-window-chunk-cache)

Acceptance gate for `MAX_SIGNAL_TRACE_BARS = 50_000` on the windowed signal-trace endpoint.

## How to measure

1. Start Workbench (`research_api` + `frontend` dev server).
2. Open a representative run (e.g. `ema_pullback` BTCUSDT 5m) with HTF context overlay.
3. Pan until render window is ~50k bars (market bundle cached).
4. In DevTools → Network, note `signal-trace` request for the render window:
   - **Duration** (ms)
   - **Response size** (KB)
5. Record below.

## Budget (set after first measure)

| Metric | signal-trace (dense) | chart-events (sparse) | Budget | Pass |
|--------|----------------------|------------------------|--------|------|
| Fetch duration (ms) | | | TBD | |
| Payload size (KB) | | | TBD | |
| Response span vs request | | | full window | |
| Payload ratio (dense / sparse) | — | — | TBD | |

Fill **chart-events** columns after Phase 4 backend deploy or Phase 6 acceptance (`openspec/changes/chart-events-backend-layer`).

If duration or payload is unacceptable, rollback BFF limit and implement frontend sub-chunk orchestration (see `openspec/changes/trace-window-chunk-cache/tasks.md` §4.3).

## Notes

- Frontend records `wb.signal_trace_merge` with `truncated: true/false` when pipeline debug is enabled.
- Display cache coverage uses **actual returned bounds** only — truncated responses must not mark the full 50k window as covered.
- **Stale error on pan (§5.8):** after trace fails on window B, pan to cached window A — banner/lanes must show loading (not B's error) until fetch for A completes.
