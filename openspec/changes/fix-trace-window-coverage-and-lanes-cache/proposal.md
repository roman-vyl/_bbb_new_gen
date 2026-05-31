## Why

Pipeline debug on a 646k-bar run showed `api.fetchSignalTrace` dominating UX (~44 s per window, 10 calls) while `SignalTraceDisplayCache` never reported a hit. Root cause: the signal-trace BFF resolves `to_open_time_ms` without adding one bar for half-open `TimeWindow`, so the last render-window candle is missing from trace → `coversRange` is always false → perpetual cache miss and unnecessary refetches. Pan-back to a previously visited 50k window also refetches lanes (~44 s) because v1 dual model has no session cache for full `SignalTraceBundle` by `chartWindowKey`. Debug metric `wb.render_window.shift` (120) conflates handler invocations with actual bounds changes (7 real shifts).

## What Changes

- **research_api:** When `to_open_time_ms` is provided on `GET .../signal-trace`, resolve exclusive end via `exclusive_end_for_report_to` (same as market bundle endpoints) so OHLCV load includes the last candle open time.
- **frontend:** Add in-memory **`SignalTraceBundleSessionCache`** keyed by `chartWindowKey` (scoped to run + variant + context ref); restore lanes/diagnostics bundle on pan-back without network when cached.
- **frontend:** Evolve `decideSignalTraceLoad` to skip fetch when session bundle exists for current window (display cache hit path unchanged).
- **frontend debug:** Replace misleading `wb.render_window.shift` timed counter with `wb.render_window.shift_applied` and `wb.render_window.shift_noop`; keep `wb.pan.shift_requested` as pan-side intent.
- **tests:** BFF integration test for `to_open_time_ms` last-bar inclusion; frontend policy/cache unit tests; optional pipeline-debug export assertion.

## Capabilities

### New Capabilities

_(none — fixes extend existing capabilities)_

### Modified Capabilities

- `workbench-trace-window-chunk-cache`: BFF `to_open_time_ms` contract alignment; lanes bundle session cache on pan-back; update dual-model requirement so pan-back restores from session cache without refetch when bundle exists.
- `pipeline-debug-instrumentation`: Split render-window shift debug marks into applied vs noop.

## Impact

**Layers:** `research_api/` (signal-trace router/service), `frontend/` (WorkbenchContext, signalTraceLoadPolicy, new session cache module, pipelineDebug).

**Reference:** `openspec/specs/workbench-trace-window-chunk-cache/spec.md`, `openspec/specs/pipeline-debug-instrumentation/spec.md`, `research_api/services/market_reader.py` (`exclusive_end_for_report_to`).

**Non-goals:**

- Faster signal-trace compute on BFF (still ~40s for new uncached 50k windows)
- Sub-chunk fetch strategy or raising `MAX_SIGNAL_TRACE_BARS` beyond current 50k
- Disk persistence of trace caches
- setData / chart rendering performance optimizations
- Changing signal trace payload schema
