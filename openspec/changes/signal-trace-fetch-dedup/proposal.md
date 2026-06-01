## Why

After a single backtest click, Workbench fires **hundreds of identical** `GET .../signal-trace` requests (same `run_id`, `variant`, `from`, `to_open_time_ms`). Pipeline debug shows `api.fetchSignalTrace` ×362 with matching `wb.trace_display.cache_miss` ×362 — not slow BFF compute, but a **frontend orchestration loop**: each fetch merges a chunk, bumps `displayCacheVersion`, re-runs the signal-trace effect, and starts another fetch because display-cache coverage for the committed window is still false and there is no durable **per-request-key** dedup for “already fetched / in flight / merged”.

## What Changes

- Introduce **`SignalTraceRequestCoordinator`** (`frontend/src/features/chart/runtime/signalTraceRequestCoordinator.ts`) as the **only** owner of network fetch intent: `traceRequestKey`, in-flight ledger, merged/already-fetched ledger, failed/superseded handling, decision `fetch` | `skip` (`cache_hit`, `in_flight`, `already_merged`, `superseded`).
- Deterministic **`traceRequestKey`** from **exact normalized** `fetchSignalTrace` params (same `from` / `to_open_time_ms` as BFF URL — no separate key vs request semantics).
- **`coordinator.reset()`** only on run / variant / context / full session reset — **not** on pan or committed window change (`mergedKeys` must survive K1→K2→K1).
- **Refactor `signalTraceLoadPolicy`**: bootstrap / session / idle / pan gates only — **remove** all network dedupe branches (`skip_display_cache_hit`, `skip_already_loading`, `skip_identical_in_flight`, `load_start` driven by cache or status). No split dedupe between policy and coordinator.
- **`SignalTraceDisplayCache`**: storage and `coversRange` only; `coversRange === false` does **not** authorize refetch (especially after truncated merge).
- **`traceDisplayOrchestrator`**: display / pan / coalescing only; no durable request dedupe.
- **`api/client.ts`**: transport only (`fetchSignalTrace` → HTTP GET).
- **WorkbenchContext**: shell — build key, `coordinator.evaluate()`, fetch on `fetch`, merge on success, ignore stale; no `lastUrlRef`, debounce, `status === loading` dedupe, object in-flight guard, or local already-fetched guard.
- Signal-trace effect deps: **primitives only** (`selectedRunId`, `selectedVariantKey`, `committedFromMs`, `committedToOpenTimeMs`, `contextOverlayRef`, `marketLoadStatus`, `renderWindowRevision` when bounds change) — no `report` / `selectedVariant` objects or merge/apply outputs.
- Coordinator ledgers: `mergedKeys` Set, `inFlightKeys` Map, bounded `failedKeys`; failure → `failed_same_key` skip (no tight retry loop).
- Session restore MUST `markMerged(K)` so session path cannot refetch.
- Enrich pipeline debug with coordinator decision fields.
- Unit tests: coordinator (dedupe); policy (session/idle only); manual acceptance.

## Capabilities

### New Capabilities

_(none — extends existing trace-cache and debug specs)_

### Modified Capabilities

- `workbench-trace-window-chunk-cache`: require per-`traceRequestKey` fetch dedup and post-merge skip when key unchanged; document interaction between display coverage miss (truncated window) and “no repeat network for same key”.
- `pipeline-debug-instrumentation`: new trace-decision debug fields and skip-reason marks.

## Impact

**Layer:** `frontend/` only. See **Module boundaries** in `design.md`.

**Touched modules:** `WorkbenchContext`, `signalTraceRequestCoordinator` (new), `signalTraceLoadPolicy` (dedupe removed), `signalTraceBootstrap`, `traceDisplayOrchestrator` (unchanged responsibility), `pipelineDebug`, tests.

**Explicitly not touched:** `api/client.ts` (behavior), `SignalTraceDisplayCache`, `ChartPanel`, BFF, backtest engine, market bundle cache.

**Reference:** `openspec/specs/workbench-trace-window-chunk-cache/spec.md`, `openspec/specs/pipeline-debug-instrumentation/spec.md`, `docs/frontend/implementation_plan.md` (Chart / signal trace slices).

**Non-goals:**

- BFF signal-trace performance, chunk size, or `MAX_SIGNAL_TRACE_BARS` changes
- Sub-chunk / incremental fetch strategy for windows larger than one BFF response
- Fixing truncated full-report display coverage in this change (may remain `cache_miss` for slice, but **must not** refetch the same key)
- Chart setData / marker rebuild optimizations
- Disk persistence of trace caches
- Debounce, `lastUrlRef` in WorkbenchContext, or `signalTraceStatus === loading` as primary dedup
- Changes to BFF, backtest engine, ChartPanel, market bundle cache, viewport/render-window/pan logic
- Pretending truncated `coversRange` covers the full committed window
