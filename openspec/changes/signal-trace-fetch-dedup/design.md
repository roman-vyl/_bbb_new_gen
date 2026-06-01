## Context

Signal-trace loading in `WorkbenchContext` chains:

1. `evaluateSignalTraceBootstrap` → committed `windowKey` + `SignalTraceRequest`
2. `decideSignalTraceLoad` + `planTraceDisplayLoad` → fetch vs skip
3. `fetchSignalTrace` → `mergeDisplayChunkFromResponse` → `setDisplayCacheVersion(+1)`

Observed failure (one backtest click): **362** identical BFF URLs and **362** `cache_miss` / `merge_chunk` pairs. Root causes in current code:

| Symptom | Likely cause |
|--------|----------------|
| Effect re-runs after every merge | `displayCacheVersion` is in the signal-trace `useEffect` deps (line ~1707) |
| `cache_miss` after merge | Full committed window may exceed one BFF chunk (`isTraceResponseTruncated`); `coversRange` stays false |
| No stop after first fetch | `decideSignalTraceLoad` only skips on `displayCacheCoversWindow` or `signalTraceStatus === "loading"`; after merge, status becomes `ready`, in-flight refs clear, policy returns `load_start` again |
| Weak in-flight guard | `skip_identical_in_flight` compares `SignalTraceRequest` objects but `loadingTraceWindowKeyRef` is cleared in `finally` before the next effect pass; no “already merged for this key” ledger |

`chartWindowKey` embeds candle `first:last` times — stable for a fixed committed window but the effect still re-enters on unrelated state bumps.

Existing pieces to **reuse** (not replace): `SignalTraceDisplayCache`, session bundle cache, `traceDisplayOrchestrator` pan coalescing, `fetchSignalTrace` in `api/client.ts` (transport only).

## Module boundaries (single source of truth)

| Module | Owns | MUST NOT |
|--------|------|----------|
| **`api/client.ts`** | `fetchSignalTrace(params)` → HTTP GET | dedupe, cache, window, loaded/not-loaded |
| **`SignalTraceRequestCoordinator`** | `traceRequestKey`; in-flight ledger; merged/already-fetched ledger; failed/superseded; decision `fetch` \| `skip` | merge trace data; React state; chart markers; ChartPanel; BFF internals |
| **`SignalTraceDisplayCache`** | merge chunk; `coversRange`; slice events / HTF | decide whether to refetch; `coversRange === false` is **not** “fetch again” |
| **`traceDisplayOrchestrator`** | committed window display; apply chunk; active-pan coalescing | durable network request dedupe |
| **`signalTraceLoadPolicy`** | bootstrap / session / idle / pan **gates** only | `cache_hit`, `in_flight`, `already_merged`, `superseded`, `fetch` — those are coordinator-only |
| **`WorkbenchContext`** | committed inputs; build key; call `evaluate`; fetch + merge + `markMerged`; ignore stale | `lastUrlRef`, debounce, `status === loading` as sole guard, object in-flight guard, local already-fetched guard |
| **ChartPanel** | _(unchanged)_ | — |
| **BFF / research_api / backtest** | _(unchanged)_ | — |

**Policy vs coordinator (no “or”, no hybrid):**

- `decideSignalTraceLoad` / `planTraceDisplayLoad` = bootstrap / session / idle / pan policy layer only. They do **not** make durable network dedupe decisions.
- `SignalTraceRequestCoordinator` = **only** owner of `in_flight`, `cache_hit` (network intent), `already_merged`, `superseded`, `fetch` authorization.
- `WorkbenchContext` calls coordinator **after** bootstrap/session/pan gates and **before** `api.fetchSignalTrace`.

**Forbidden:** partial dedupe in policy and partial in coordinator; “extend policy with coordinator actions OR call coordinator” — pick coordinator-only for network (already chosen).

## Goals / Non-Goals

**Goals:**

- At most **one** `fetchSignalTrace` per `traceRequestKey` per session until the key changes.
- Coordinator owns dedupe via **ledger structures** (`mergedKeys` Set, `inFlightKeys` Map), not a single `lastMergedKey` ref.
- Effect deps = **stable primitives only**; merge/apply outputs must not re-trigger fetch evaluation.
- Failed keys do not tight-loop retry on 500/timeout.
- Rich pipeline debug explaining *why* each evaluation skipped or fetched.

**Non-Goals:**

- BFF / research_api / backtest changes
- ChartPanel, market bundle cache, viewport/render-window/pan logic changes
- Debounce, `lastUrlRef`, `signalTraceStatus === "loading"` as primary dedupe
- BFF changes, `MAX_SIGNAL_TRACE_BARS` changes, fixing `coversRange` to pretend truncated response covered full window
- Multi-chunk incremental fetch (future change)

## Decisions

### 1. `SignalTraceRequestCoordinator` in chart runtime zone

**Choice:** `frontend/src/features/chart/runtime/signalTraceRequestCoordinator.ts`

**Rationale:** Co-located with `traceDisplayOrchestrator.ts`; owns fetch *intent* adjacent to display orchestration. WorkbenchContext stays a thin shell.

**API (conceptual):**

```ts
buildTraceRequestKey(input: {
  runId: string;
  variant: string;
  fromMs: number;
  toOpenTimeMs: number;
  contextOverlayRef: string;
}): string;

type EvaluateInput = {
  traceRequestKey: string;
  displayCacheCoversWindow: boolean;
  coverageFromSec: number | null;
  coverageToSec: number | null;
  requestedFromSec: number;
  requestedToSec: number;
  // pan / bootstrap gates from existing planTraceDisplayLoad
};

type EvaluateResult =
  | { decision: "fetch"; reason: "cache_miss_uncovered" }
  | { decision: "skip"; skipReason: "in_flight" | "cache_hit" | "already_merged" | "superseded" | ...; ... };

class SignalTraceRequestCoordinator {
  // Ledgers (NOT single lastMergedKey — pan A→B→A must hit already_merged for A)
  mergedKeys: Set<TraceRequestKey>;
  inFlightKeys: Map<TraceRequestKey, RequestGeneration>;
  failedKeys: Map<TraceRequestKey, FailureRecord>; // optional bounded LRU, e.g. max 128 keys

  evaluate(input): EvaluateResult;
  markInFlight(key: TraceRequestKey, generation: RequestGeneration): void;
  markMerged(key: TraceRequestKey, source: "network" | "session_restore"): void;
  markFailed(key: TraceRequestKey): void;
  isSuperseded(key: TraceRequestKey, generation: RequestGeneration): boolean;
  clearInFlight(key: TraceRequestKey): void;
  reset(): void; // see §2a — NOT on pan / committed window change
}
```

**Alternatives considered:**

- Single `lastMergedKey` ref — **rejected**; user can visit window A, B, return to A; need per-key session ledger.
- `shared/context/` — rejected; chart-runtime concern.
- Inline refs in WorkbenchContext — rejected.

### 2. `traceRequestKey` format and fetch-param parity

**Choice:** `runId:variant:fromMs:toOpenTimeMs:contextOverlayRef` — string form of the **exact** query params sent to `api.fetchSignalTrace` (`from`, `to_open_time_ms`, `variant`, `context_overlay_ref`, run path).

**Hard rule:** `buildTraceRequestKey` input MUST be produced **after** the same from/to normalization used for `fetchSignalTrace` params. No separate rounding, inclusive/exclusive end, or candle-time interpretation between key and HTTP request. The key MUST match the factual BFF URL for dedupe.

**Implementation hint:** one helper e.g. `normalizeSignalTraceFetchParams(committedWindow, …) → { runId, variant, fromMs, toOpenTimeMs, contextOverlayRef }` used by both `buildTraceRequestKey` and `fetchSignalTrace({ … })`.

**Note:** `windowKey` / session cache may use a parallel string; network dedup identity is the fetch-param key only.

### 2a. `coordinator.reset()` — when and when NOT

**Call `reset()` only when:**

- run / report identity changes (`selectedRunId`),
- variant identity changes (`selectedVariantKey`),
- context overlay ref identity changes (`effectiveContextOverlayRef`),
- full trace/session cache reset (e.g. `reloadToken`, explicit session identity reset hook — same scope as `signalTraceBundleSessionCache.reset` / display cache reset for run+variant+context, **not** per-window).

**Do NOT call `reset()` when:**

- committed render window bounds change (pan to `K2`, pan back to `K1`),
- `traceRequestKey` changes because `fromMs` / `toOpenTimeMs` changed,
- `renderWindowRevision` bumps on window commit.

**Rationale:** `mergedKeys` must retain `K1` after load so pan K1→K2→K1 returns `already_merged` without refetch (acceptance + spec scenario).

**Forbidden:** tying `coordinator.reset()` to `traceDisplayCacheKey` reset effect if that effect also runs on unrelated bumps — only reset coordinator alongside **run / variant / context** identity, same as display-cache identity reset, never on ordinary pan.

### 3. Merged ledger (`already_merged`)

**Choice:** `mergedKeys: Set<traceRequestKey>`. After network merge **or** session restore for `K`, `markMerged(K)`. Subsequent `evaluate(K)` returns `skip` / `already_merged` even when `coversRange === false` (truncated BFF).

**Bounded growth:** optional LRU cap (~128 keys) on `mergedKeys` / `failedKeys`; evict oldest only when over cap — not required for MVP if session scope is bounded.

### 4. Failure policy (no retry storm)

**Choice:** `markFailed(K)` records failure. `evaluate(K)` thereafter returns `skip` / `failed_same_key` until:

- `traceRequestKey` changes to a **new** key (new window bounds) — coordinator evaluates fresh for `K2`; `K1` stays in `failedKeys` / not auto-retried, or
- explicit identity reset (`coordinator.reset()` on run / variant / context / full session reset per §2a).

**Forbidden:** automatic immediate re-fetch on the next effect pass after 500/timeout for the same `K`.

### 5. Session restore marks merged (hard requirement)

When session bundle restores display data for `K`, Workbench MUST `coordinator.markMerged(K, source: "session_restore")` before returning. Next `evaluate(K)` MUST skip with `cache_hit` or `already_merged` — session path must not bypass coordinator and refetch.

### 6. Effect dependencies — primitives only

**Allowed deps (stable primitive identity):**

- `selectedRunId` (or `reportRunId` — same string, not `report` object)
- `selectedVariantKey` (string, not `selectedVariant` object)
- `committedFromMs`, `committedToOpenTimeMs` (from committed render window candles)
- `effectiveContextOverlayRef`
- `marketLoadStatus`
- `renderWindowRevision` — **only** when it reflects a committed bounds change (not spurious bumps)

**Forbidden deps (delete from signal-trace effect):**

- `report`, `selectedVariant` (object identity)
- `chartWindowKey` if derived from unstable slice object — prefer `committedFromMs` + `committedToOpenTimeMs` instead
- `chartWindowSlice` object, `chartViewModel`
- `chartDisplayComponentEvents`, `chartDisplayAuxEmaOverlays`
- `displayCacheVersion`, `displayCacheCoversWindow` (read `coversRange` synchronously inside effect body)
- any merge/apply output object

**Inside effect:** `signalTraceDisplayCacheRef.current.coversRange(fromSec, toSec)` — not a React dep.

### 7. Delete / replace list (migration)

| Remove / replace | Replacement |
|------------------|-------------|
| `displayCacheVersion` in signal-trace effect deps | read cache ref inside effect |
| `chartDisplayComponentEvents`, `chartDisplayAuxEmaOverlays`, `chartViewModel`, chart window slice objects in deps | primitive committed bounds + run/variant keys |
| `loadingTraceWindowKeyRef` as fetch authorization | coordinator `inFlightKeys` |
| `inFlightTraceRequestRef` + `skip_identical_in_flight` object compare | coordinator `in_flight` |
| `signalTraceStatus === "loading"` as dedupe | coordinator only; status may remain for UI/lanes, not fetch gate |
| `decideSignalTraceLoad`: `skip_display_cache_hit`, `skip_already_loading`, `skip_identical_in_flight`, `load_start` | coordinator `evaluate` |
| Workbench `lastUrlRef`, debounce, local already-fetched guard | coordinator ledgers |

`traceLoadGenerationRef` MAY remain **only** for stale response drop alongside `coordinator.isSuperseded` — not as parallel fetch authorization.

### 8. Stale response handling

On response: if `coordinator.isSuperseded(traceRequestKey, generation)` → ignore response, `clearInFlight`, no merge, no React trace state update for that key.

### 9. Strict split: policy vs coordinator (no hybrid)

**Choice:** **Remove** from `decideSignalTraceLoad` all network-dedupe and cache-hit branches:

- Remove `skip_display_cache_hit` (coordinator `cache_hit`)
- Remove `skip_already_loading` (coordinator `in_flight`)
- Remove `skip_identical_in_flight` (coordinator `in_flight`)
- Remove `load_start` as “go fetch” (coordinator `fetch`)

**Policy keeps:** `skip_idle`, `restore_session_cache`, and inputs used only for lanes/session — not for “should we HTTP?”.

**`planTraceDisplayLoad`:** pan coalescing, `restore_session`, `pan_block`, `fetch_superseded`, `bootstrap_blocked` unchanged. **`network_fetch` plan action** is emitted only when policy gates pass **and** coordinator returns `fetch` (Workbench wires both).

**Coordinator owns exclusively:** `cache_hit`, `in_flight`, `already_merged`, `superseded`, `fetch`.

**Display cache:** Workbench passes `displayCacheCoversWindow` (from `coversRange`) **into** coordinator as input; display cache module never calls fetch and never interprets miss as refetch authorization.

### 10. Target pipeline (WorkbenchContext signal-trace effect)

1. Read committed trace inputs: `runId`, `variantKey`, `committedFromMs`, `committedToOpenTimeMs`, `contextOverlayRef`.
2. `traceRequestKey = buildTraceRequestKey(...)`.
3. Bootstrap / session / pan policy: trace disabled? market/report not ready? active pan deferred? session restore available?
4. If session restore applied: merge/restore display data → `coordinator.markMerged(traceRequestKey, "session_restore")` → no network fetch → apply display window → return.
5. Read coverage synchronously: `signalTraceDisplayCacheRef.current.coversRange(fromSec, toSec)`.
6. `decision = coordinator.evaluate({ traceRequestKey, cacheCoverage, requested/coverage bounds, generation })`.
7. If `skip`: `dbgMark(wb.signal_trace_decision, { skipReason, ... })` → return (apply display window if needed via separate apply effect).
8. If `fetch`: `markInFlight` → `dbgMark(fetch_start)` → `await fetchSignalTrace(...)`.
9. On response: if superseded → ignore, `clearInFlight`, return; else `mergeDisplayChunkFromResponse` → `markMerged` → `clearInFlight` → update lanes state.
10. Apply current display window (slice from display cache; separate effect OK).

**Invariant:** `mergeDisplayChunkFromResponse` must not authorize another fetch for the same key. If the effect runs again (any reason), step 6 returns `already_merged` for same `traceRequestKey`.

### 11. Debug metadata

Extend `dbgMark(DBG.signalTrace.decision, { ... })` with fields from proposal. Optional dedicated step `wb.signal_trace.coordinator_skip` if decision noise is high — prefer enriching existing `wb.signal_trace_decision` meta.

Add `effectTriggerReason` string param passed from effect (e.g. `committed_window`, `market_ready`, `variant_change`) for diagnosing unexpected re-runs.

### 12. Transport boundary

`api.fetchSignalTrace` stays in `client.ts`. Only WorkbenchContext (or a tiny `loadSignalTraceForKey` helper next to coordinator) calls it after `decision === "fetch"`.

### 13. Definition of done (acceptance)

After **one backtest click** with `VITE_EMA_PIPELINE_DEBUG=true` and `__pipelineDebugFlush()`:

| Metric | Expected |
|--------|----------|
| `api.fetchSignalTrace` | ≤ **1** per distinct `traceRequestKey` |
| `wb.signal_trace.fetch_start` | ≤ **1** per distinct key |
| `wb.trace_display.merge_chunk` | ≤ **1** per distinct key |
| `wb.trace_display.cache_miss` | must **not** repeat hundreds of times for the same key |
| `wb.signal_trace_decision` | may be > 1; after first merge for key `K`, later entries for `K` show `skipReason` `already_merged` or `cache_hit` |
| BFF access log | one `GET .../signal-trace?...` per distinct query — not 362 identical URLs |
| Pan K1 → K2 → K1 | no refetch for `K1`; `skipReason` `already_merged` or `cache_hit` |
| Key vs URL | debug `traceRequestKey` fields match actual BFF query params |

“Faster” alone is not acceptance. Bounded network and merge counters + skip reasons prove the loop is fixed.

See `tasks.md` §5 for manual verification checklist.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Stale partial display when truncated and no refetch | Documented non-goal; user sees partial events until pan/sub-chunk work |
| Coordinator singleton vs per-provider instance | Instantiate once per `WorkbenchProvider` via `useRef(createCoordinator())` to avoid cross-tab leakage in tests reset in `reset()` |
| Session restore bypasses coordinator | Hard requirement: `markMerged(K, session_restore)` on session path (see §5) |
| Failed fetch retry storm | `failed_same_key` skip until key change or `reset()` |
| HTF overlay regression | Task: manual verify HTF context EMA on variant with `strategy.contexts` |
| Tests rely on old policy-only skips | Move dedupe cases to `signalTraceRequestCoordinator.test.ts`; shrink `signalTraceLoadPolicy.test.ts` to session/idle only |
| Accidental dual dedupe during migration | Delete policy branches in same PR as coordinator wire-up; grep for `skip_display_cache_hit` / `load_start` in policy |

## Migration Plan

1. Implement coordinator + unit tests (no Workbench wiring).
2. Wire WorkbenchContext effect; remove `displayCacheVersion` from deps.
3. Extend pipeline debug meta; manual backtest + `__pipelineDebugFlush`.
4. Archive change → merge delta specs.

Rollback: revert frontend slice; no API/schema changes.

## Open Questions

- Whether `bootstrap_ready` debug should fire once per key vs per effect run — reduce noise in follow-up if still spammy (not blocking).

**Resolved:** `coordinator.reset()` only on run/variant/context/full session reset — **not** on pan or `traceRequestKey` change (§2a).
