## Why

After a single backtest click, Workbench issues **hundreds of identical** `GET /api/research/runs/{run_id}/signal-trace` requests (observed: **362** repeats with the same `run_id`, `variant`, `from`, and `to_open_time_ms`). BFF responds `200 OK`; the failure is **frontend signal-trace orchestration**, not slow backtest or backend bugs.

Pipeline debug confirms a tight loop: `merge_chunk` bumps `displayCacheVersion` → signal-trace `useEffect` re-runs → `SignalTraceDisplayCache.coversRange` stays `false` (truncated chunk vs full committed window) → hybrid policy/guards allow another fetch → prior in-flight guard cleared → same URL fetched again. With **2+ strategy instances**, multiple display paths can amplify identical network resource demand unless **network identity** is separated from **UI instance identity**.

This change replaces the incomplete draft `signal-trace-fetch-dedup` with an architecturally strict plan: one owner for durable network fetch authorization, multi-instance-safe, frontend-only.

## What Changes

- Introduce **`SignalTraceRequestCoordinator`** (`frontend/src/features/chart/runtime/signalTraceRequestCoordinator.ts`): deterministic `traceRequestKey`, in-flight / merged / failed ledgers, superseded response handling, `evaluate()` → `fetch` | skip reasons.
- **Split network identity from display identity**: `traceRequestKey` built only from params that appear on the BFF URL (`run_id`, `variant`, `from_ms`, `to_open_time_ms`, `context_overlay_ref`). `selectedStrategyInstanceId` and `chartWindowKey` are **not** network keys unless BFF accepts them as query params (they do not today).
- **Refactor `signalTraceLoadPolicy`**: remove durable network dedupe (`skip_display_cache_hit`, `skip_already_loading`, `skip_identical_in_flight`, `load_start` as fetch auth). Keep bootstrap / session / idle / pan gates only.
- **Refactor WorkbenchContext signal-trace effect**: stable primitive deps only; read `coversRange` from ref inside effect; coordinator is sole fetch authorizer; session restore calls `markMerged`; no `lastUrlRef`, debounce, or `signalTraceStatus === "loading"` dedupe.
- **Extend pipeline debug** (`wb.signal_trace_decision`, `wb.signal_trace.fetch_start`) with coordinator metadata (`traceRequestKey`, `decisionReason`, ledger hits, `selectedStrategyInstanceId` as display-only meta).
- **Tests**: coordinator unit tests (including multi-instance same-K, pan K1→K2→K1, `already_merged` when `coversRange=false`, `failed_same_key`); policy tests for gates only.

## Capabilities

### New Capabilities

- `signal-trace-request-coordinator`: Frontend module and contract for durable signal-trace **network** fetch authorization keyed by BFF resource identity; multi-instance-safe shared ledgers per Workbench session.

### Modified Capabilities

- `workbench-trace-window-chunk-cache`: Clarify that display cache `coversRange` governs **display slice** only; durable network dedupe is coordinator-owned; multi-instance instance filtering is post-cache; session restore must `markMerged` on coordinator.
- `pipeline-debug-instrumentation`: Coordinator decision metadata on signal-trace debug marks; prove ≤1 `api.fetchSignalTrace` per distinct `traceRequestKey`.

## Impact

**Layer:** `frontend/` only.

**Modules (expected):**

- `frontend/src/features/chart/runtime/signalTraceRequestCoordinator.ts` (new)
- `frontend/src/shared/context/signalTraceLoadPolicy.ts` (+ tests)
- `frontend/src/shared/context/WorkbenchContext.tsx` (signal-trace effect wiring only)
- `frontend/src/shared/diagnostics/pipelineDebug.ts` (debug meta fields)
- `frontend/src/features/chart/runtime/traceDisplayOrchestrator.ts` (if any network dedupe branches remain)

**Explicit non-goals (unchanged):**

- BFF / `research_api` / `signal_trace.py` / `api/client.ts` transport behavior
- `data_engine/`, backtest engine, `ChartPanel.tsx`
- Market bundle cache, viewport / render-window / pan logic
- `MAX_SIGNAL_TRACE_BARS`, chunk size, multi-chunk incremental fetch
- Debounce, `lastUrlRef`, hybrid dedupe in WorkbenchContext
- Trading semantics, strategy instance business rules on backend

**Regression:** HTF context EMA overlays (`workbench-chart-htf-context-overlays`) — verify on variant with `strategy.contexts` after implementation.

**Evidence (2026-06-01):** BFF log shows repeated identical `signal-trace` URLs; browser flush shows `REPEAT api.fetchSignalTrace` ×362 aligned with `wb.trace_display.cache_miss` ×362 and `merge_chunk` ×362 for one backtest click.
