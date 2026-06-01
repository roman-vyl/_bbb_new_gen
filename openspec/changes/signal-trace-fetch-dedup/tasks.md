## 0. Ownership audit (before code)

Read `design.md` module boundaries and §7 delete/replace list. Do not start coordinator wiring until this block is done.

- [ ] 0.1 Locate the signal-trace `useEffect` in `WorkbenchContext.tsx` and list every dependency.
- [ ] 0.2 For each dep, classify: **input** (committed identity) | **output** (merge/apply) | **cache revision** (`displayCacheVersion`) | **unrelated** (object identity noise).
- [ ] 0.3 Locate all current dedupe / fetch guards and note call sites:
  - `loadingTraceWindowKeyRef`
  - `signalTraceStatus === "loading"` used as fetch gate
  - `inFlightTraceRequestRef` + `skip_identical_in_flight` in `decideSignalTraceLoad`
  - `skip_display_cache_hit` / `load_start` in policy
  - `displayCacheVersion` in effect deps (re-run after merge)
- [ ] 0.4 For each guard from 0.3, record **delete** | **replace with coordinator** | **keep only as stale-generation helper** (not fetch authorization).
- [ ] 0.5 Confirm file scope: **no** edits to ChartPanel, BFF/research_api, backtest engine, market bundle cache, viewport/render-window/pan modules beyond existing policy call sites.
- [ ] 0.6 Confirm `coordinator.reset()` is **not** called on committed render-window change / pan / new `traceRequestKey` — only on run, variant, context overlay, or full trace/session identity reset (see `design.md` §2a).
- [ ] 0.7 Confirm `traceRequestKey` is built from the **exact normalized** `fetchSignalTrace` params (shared normalizer; key fields = BFF query `from`, `to_open_time_ms`, `variant`, `context_overlay_ref`, run id).

## 1. Coordinator module

`frontend/src/features/chart/runtime/signalTraceRequestCoordinator.ts` — network intent only (no merge, React, markers, BFF).

- [ ] 1.1 Shared `normalizeSignalTraceFetchParams` (or equivalent) → used by `buildTraceRequestKey` and `fetchSignalTrace` call site; no divergent from/to semantics.
- [ ] 1.1b `buildTraceRequestKey` only from that normalized param object (must match factual BFF URL).
- [ ] 1.2 `inFlightKeys`: `Map<traceRequestKey, requestGeneration>`; `markInFlight` / `clearInFlight`.
- [ ] 1.3 `mergedKeys`: bounded `Set` or LRU (e.g. max 128 keys) — **not** a single `lastMergedKey` ref.
- [ ] 1.4 `failedKeys`: bounded map; `markFailed`; `evaluate` returns `skip` / `failed_same_key` (no immediate retry for same key).
- [ ] 1.5 `evaluate`: exclusive decisions `fetch` | skip (`cache_hit`, `in_flight`, `already_merged`, `failed_same_key`, `superseded`).
- [ ] 1.6 `markMerged(key, source: "network" | "session_restore")`.
- [ ] 1.7 `isSuperseded(key, generation)` — stale response must not merge or update trace state.
- [ ] 1.8 `reset()` clears ledgers **only** on run / variant / context overlay / full trace-session identity reset — **never** on pan or committed window / `traceRequestKey` change (`design.md` §2a).
- [ ] 1.9 Unit tests: `cache_hit`, `in_flight`, `already_merged` with `coversRange === false` (truncated), pan A→B→A, `failed_same_key`, `superseded`, session_restore → merged.

## 2. Policy refactor

- [ ] 2.1 **Remove** from `decideSignalTraceLoad`: `skip_display_cache_hit`, `skip_already_loading`, `skip_identical_in_flight`, `load_start` (no durable network dedupe in policy).
- [ ] 2.2 `planTraceDisplayLoad`: bootstrap / session / pan only; `network_fetch` path requires coordinator `fetch` (Workbench wires both).
- [ ] 2.3 Move former policy dedupe tests to coordinator tests; policy tests = session / idle / pan gates only.

## 3. Workbench wiring

Follow `design.md` §10 target pipeline.

- [ ] 3.1 WorkbenchContext: normalize fetch params once → `traceRequestKey` + `fetchSignalTrace` use same object (not `report` / `selectedVariant` objects).
- [ ] 3.2 Signal-trace effect deps: **only** `selectedRunId`, `selectedVariantKey`, `committedFromMs`, `committedToOpenTimeMs`, `effectiveContextOverlayRef`, `marketLoadStatus`, `renderWindowRevision` (when committed bounds change).
- [ ] 3.3 **Remove** from deps: `report`, `selectedVariant`, `chartWindowKey` (if redundant), `displayCacheVersion`, `displayCacheCoversWindow`, `chartViewModel`, `chartDisplayComponentEvents`, `chartDisplayAuxEmaOverlays`, chart window slice objects, any merge/apply output.
- [ ] 3.4 Read `coversRange` synchronously inside effect via `signalTraceDisplayCacheRef.current` (not as a dep).
- [ ] 3.5 Coordinator called **once per effect evaluation** after bootstrap/session/pan gates and **before** `api.fetchSignalTrace`.
- [ ] 3.5b `coordinator.reset()` wired only to identity-reset hooks (0.6) — not render-window commit / pan.
- [ ] 3.6 `api.fetchSignalTrace` only when `decision === "fetch"`.
- [ ] 3.7 `markInFlight(traceRequestKey)` before `await fetchSignalTrace`.
- [ ] 3.8 On success: `mergeDisplayChunkFromResponse` → `markMerged(traceRequestKey, "network")` → `clearInFlight`.
- [ ] 3.9 Session restore path: merge/restore display → `markMerged(traceRequestKey, "session_restore")` → no network.
- [ ] 3.10 On failure: `markFailed` — no tight retry loop on next effect pass for same key.
- [ ] 3.11 On response: if `isSuperseded` → ignore, `clearInFlight`, no merge, no lanes update for that key.
- [ ] 3.12 Delete/replace legacy guards per audit 0.4 (`loadingTraceWindowKeyRef`, `inFlightTraceRequestRef` as fetch auth, status-loading dedupe).
- [ ] 3.13 Grep: no parallel network dedupe left in policy or WorkbenchContext.

## 4. Debug

When `VITE_EMA_PIPELINE_DEBUG=true`:

- [ ] 4.1 Every `wb.signal_trace_decision` includes `traceRequestKey`, `decisionReason`, `skipReason` (when skip).
- [ ] 4.2 `wb.signal_trace.fetch_start` includes the same `traceRequestKey` as the authorized fetch.
- [ ] 4.3 Skip logs show `in_flight`, `cache_hit`, `already_merged`, `failed_same_key`, `superseded` as applicable.
- [ ] 4.4 After truncated merge for `K1`, a subsequent decision for `K1` shows `skipReason: already_merged` (or `cache_hit`).
- [ ] 4.5 Optional: `coverageFrom` / `coverageTo`, `requestedFrom` / `requestedTo`, `inFlightKey`, `effectTriggerReason`.

## 5. Acceptance (definition of done)

Success is **not** “feels faster”. Success is bounded counters after **one backtest click** and chart load (`__pipelineDebugFlush`).

### Required pipeline debug (one distinct `traceRequestKey` for committed window)

| Step | Expected max (same key) |
|------|-------------------------|
| `api.fetchSignalTrace` | **1** |
| `wb.signal_trace.fetch_start` | **1** |
| `wb.trace_display.merge_chunk` | **1** |
| `wb.trace_display.cache_miss` | **not** hundreds for same key |
| `wb.signal_trace_decision` | may be **> 1** (re-evaluations OK) |
| After first merge, later decisions for same key | `skipReason`: `already_merged` or `cache_hit` |

### Required BFF log

- **One** `GET .../signal-trace?...` per distinct query (same `run_id`, `variant`, `from`, `to_open_time_ms`, context ref).
- **Not** 362 identical GETs for the same URL.

### Regression (unchanged behavior)

- [ ] 5.1 HTF context EMA overlays still visible (`workbench-chart-htf-context-overlays`, variant with `strategy.contexts`).
- [ ] 5.2 Pan / viewport behavior unchanged (no edits to pan/viewport modules in this change).
- [ ] 5.3 ChartPanel untouched (no files changed under ChartPanel for this slice).

### Automated tests

- [ ] 5.4 `signalTraceRequestCoordinator.test.ts` passes (dedupe + failure + session_restore).
- [ ] 5.5 `signalTraceLoadPolicy.test.ts` passes (gates only, no network dedupe cases).
- [ ] 5.6 Pan K1 → K2 → K1: no refetch for `K1`; `skipReason` `already_merged` or `cache_hit` (`mergedKeys` survived pan).
- [ ] 5.7 Debug: `traceRequestKey` / decision meta fields match actual BFF URL query params (`from`, `to_open_time_ms`, `variant`, `context_overlay_ref`).
