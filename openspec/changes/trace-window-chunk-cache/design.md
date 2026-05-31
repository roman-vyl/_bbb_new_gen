## Context

**Candles (done — `workbench-chart-sliding-window`):**

```text
cachedBundle.candles (full report range)
        ↓ chartDataWindowManager
render window slice → ChartPanel.setData
pan shift → re-slice from cache (no API)
```

**Trace today:**

```text
render window [T0, T1]
        ↓ chartWindowKey change
fetchSignalTrace(fromMs, toOpenTimeMs) — one window
        ↓
signalTrace state (single bundle)
        ↓
displayComponentEventsForRenderWindow / auxOverlayFromHtfTrace
```

Problems:

- `decideSignalTraceLoad` treats `loadedTraceWindowKey === chartWindowKey` as "done" — pan to `[T0', T1']` always refetches even if `[T0, T1]` was already loaded.
- `lastSlicedHtfOverlaysRef` / `lastSlicedComponentEventsRef` are band-aids for stale single-window model.
- BFF `MAX_SIGNAL_TRACE_BARS = 5000` may truncate when render window is 50k — chunk fetch size must be explicit (design decision below).

BFF already caches per exact window server-side — frontend needs an **accumulating display cache** for chart markers/overlays only (v1).

## Goals / Non-Goals

**Goals:**

- Component events and HTF context EMA follow **display cache → render-window slice → display**, like candles.
- **Display chunk cache** keyed by `run_id + variant + context_overlay_ref` (session-scoped, in-memory).
- Pan within cached time ranges → **instant** events/HTF slice, **no fetch**.
- Pan into uncached range → fetch **one chunk** for missing/current window, extract display fields, merge.
- Pan back to previously visited range → slice from display cache, no refetch.
- Preserve HTF overlay regression contract (`workbench-chart-htf-context-overlays`).

**Non-Goals:**

- Single request for full report-range trace (646k bars)
- **v1 full trace cache** — no merge of `long`/`short` side internals, `times` arrays for lanes, or diagnostics fields
- Persistent/offline trace cache
- Browser computation of HTF EMA or component events
- Changing `SignalTraceBundle` API schema
- Pre-fetching entire run trace in background without user navigation

## Decisions

### 1. Module: `signalTraceDisplayCache.ts` (v1 display cache)

Pure TS (no React). Session **display cache** per **trace identity**:

```typescript
type TraceDisplayCacheKey = `${runId}:${variant}:${contextOverlayRef}`;

/** v1 stored payload per chunk — display fields only */
type TraceDisplayChunk = {
  fromSec: number;
  toSec: number; // inclusive last bar time covered
  component_events: ComponentEvent[];
  htf_context: HtfContextTrace; // fast/anchor/slow arrays + meta needed for overlay build
};

type SignalTraceDisplayCache = {
  reset(key: TraceDisplayCacheKey): void;
  mergeDisplayChunk(chunk: TraceDisplayChunk): void;
  coversRange(fromSec: number, toSec: number): boolean;
  missingRange(fromSec: number, toSec: number): { fromSec: number; toSec: number } | null;
  sliceEventsForWindow(fromSec: number, toSec: number): ComponentEvent[];
  sliceHtfContextForWindow(fromSec: number, toSec: number): HtfContextTraceSlice;
};
```

**v1 stores ONLY:**

- `component_events`
- `htf_context` data required to build HTF EMA overlays (`times` alignment via htf series + bar times from chunk bounds)
- chunk **coverage intervals** (for `coversRange` / `missingRange`)

**v1 does NOT merge or retain:**

- `long` / `short` side trace internals
- Full `times` + side booleans for signal lanes
- `context_consumption_trace` or diagnostics-only fields

On fetch: BFF returns full `SignalTraceBundle`; Workbench **extracts display fields** into `TraceDisplayChunk` and merges into display cache. Latest per-window `signalTrace` state MAY remain for lanes/diagnostics (unchanged v1 behavior).

**Coverage intervals MUST be derived from actual returned trace bounds — never from requested `[fromSec, toSec]`.**

When building a `TraceDisplayChunk` from a fetch response, compute chunk bounds from **data present in the response**:

```typescript
// Pseudocode — use response meta bounds when BFF exposes verified actual span
chunk.fromSec = meta.actual_from_sec ?? min(
  response.times,
  response.component_events?.map(e => e.time),
  htfBarTimes(response.htf_context),
);
chunk.toSec = meta.actual_to_sec ?? max(/* same sources */);
```

If the response is truncated vs the requested window, the stored chunk covers **only** `[chunk.fromSec, chunk.toSec]`. `coversRange(renderWindow)` MUST NOT return true for ranges outside that span.

**Display field merge:**

- `component_events`: dedupe by `(time, role, event_type, component_id, instance_id, side, span_id)` — include `label` when present if collisions persist across identical tuples without label
- `htf_context`: merge series by bar time key (same approach as overlay point alignment today)

**Alternative considered:** Full trace chunk merge (times + long/short). **Rejected for v1** — heavier memory, lanes/diagnostics not required for seamless chart markers/HTF pan.

**Alternative considered:** Store only latest chunk. **Rejected** — pan back loses data.

**Alternative considered:** Full-run fetch once. **Rejected** — user requirement + BFF cost.

### 2. Load policy evolution

Replace `loadedTraceWindowKey` exact match with cache-aware `decideSignalTraceLoad`:

```typescript
// Pseudocode
if (cache.coversRange(fromSec, toSec)) {
  return { action: "skip_cache_hit" };  // display from cache slice only
}
const missing = cache.missingRange(fromSec, toSec);
return { action: "load_start", fetchFromMs, fetchToMs }; // fetch missing/current window
```

On fetch success: extract display fields → `mergeDisplayChunk` → update chart display from cache slice.

Coverage / fetch decisions use **display cache** only (events + HTF). Separate `signalTrace` for lanes/diagnostics may still update on each window fetch in v1.

`signalTraceStatus`:

- `ready` when cache covers current render window (even if background fetch not needed)
- `loading` when fetch in flight for uncovered portion
- `partial` optional: cache has some data but not full window — show stale banner for uncovered facets

Remove dependency on `traceMatchesWindow === (chartWindowKey === loadedTraceWindowKey)`.

### 3. Display pipeline

```text
SignalTraceDisplayCache (merged display chunks)
        ↓ sliceEventsForWindow / sliceHtfContextForWindow
        ↓
displayComponentEventsForRenderWindow / auxOverlayFromHtfTrace
        ↓
render-window candle slice (existing chartRenderWindowDisplay)
        ↓
ChartPanel markers + HTF EMA
```

Deprecate `lastSlicedHtfOverlaysRef` / `lastSlicedComponentEventsRef` as primary data path — display cache holds source; display always re-slices to current `chartView.candles`.

**v1 unchanged:** `SignalTimelineLanes`, `ChartTradeDiagnostics` continue using latest per-window `signalTrace` from fetch (may refetch on window change).

Stale banner (`htfAuxEmaOverlayStale`, `componentEventsStale`) when render window **not fully covered** by cache and fetch pending.

### 4. BFF trace window size — v1 plan (50k + perf gate)

Today `MAX_SIGNAL_TRACE_BARS = 5000` while render window is **50k**. **Silent truncation is the highest-risk bug:** frontend marks display cache as covering 50k while BFF returned ~5k.

**v1 decision (single plan, not A/B fork at start):**

1. Raise `MAX_SIGNAL_TRACE_BARS` to ~50k on the **existing windowed signal-trace endpoint only** (`CHART_RENDER_WINDOW_SIZE` alignment).
2. One trace fetch per render-window shift (simple frontend orchestration).
3. **Acceptance MUST measure** fetch latency and payload on a representative run (ema_pullback 5m, ~50k window).
4. If perf is **not** acceptable → **rollback BFF limit** and add frontend sub-chunk orchestration (multiple fetches per render window, merge into display cache). Do not ship with silent 5k truncation either way.

**Frontend contract (always, including during 50k trial):**

- After each fetch, compare requested render-window span vs **actual** trace time span returned.
- **Record chunk coverage from actual bounds** (`chunk.fromSec` / `chunk.toSec` from response data or verified meta) — never from requested fetch params.
- Display cache records coverage only for the **returned** span — never `coversRange` for the full window if response was truncated.
- Surface truncation: stale/partial UI or dev warning — **no silent “cache covers 50k” when BFF returned 5k**.

Do **not** add a full-run trace endpoint.

### 5. Cache invalidation

Reset cache on:

- `selectedRunId` change
- `selectedVariantKey` change
- `effectiveContextOverlayRef` change

Do **not** reset on render-window pan within same run/variant/ref.

### 6. WorkbenchContext integration

- Hold `signalTraceDisplayCacheRef` alongside existing trace state
- Effect on render window change: display-cache coverage check → fetch or slice-only update for **events/HTF**
- Fold display cache slice into `chartDisplayComponentEvents` / HTF aux path
- Keep `signalTrace` state for lanes/diagnostics in v1 (updated on fetch; not merged into display cache)

### 7. Testing

- Unit: `signalTraceDisplayCache.test.ts` — merge display fields only, covers, missing range, pan-back hit
- Unit: `signalTraceLoadPolicy.test.ts` — display-cache hit skips fetch for chart layers
- Extend: `chartRenderWindowDisplay.test.ts` — events/HTF from display cache slice
- Manual: HTF regression checklist (tasks §5); confirm lanes/diagnostics still work (no regression from dual model)

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Memory growth on long pan sessions | Cap cache chunks (e.g. 10 windows) LRU evict by chunk |
| Merge bugs on HTF arrays | Unit tests; merge htf_context by bar time key |
| Dual model confusion (display cache vs signalTrace) | Clear module boundary; v2 unifies lanes/diagnostics |
| BFF 5000 vs 50k window | Raise to 50k in v1 + perf gate; sub-chunks only if perf fails; **no silent truncation** |
| Frontend thinks cache covers 50k, BFF sent 5k | Chunk bounds from actual response; truncation detection; `coversRange` uses merged intervals only |
| Duplicate component events on merge | Dedupe `(time, role, event_type, component_id, instance_id, side, span_id)` |
| Stale banner confusion | Show "Loading trace for range…" only when uncovered |

## Migration Plan

1. Implement cache module + tests
2. Switch load policy and WorkbenchContext (feature replaces frozen-ref path)
3. Adjust BFF bar limit if needed
4. Remove dead `loadedTraceWindowKey` exact-match logic after verification
5. Rollback: revert frontend; BFF limit change independent

## Resolved clarifications (pre-implementation)

**v1 = display cache only** — stores `component_events`, `htf_context` (for HTF EMA), and coverage intervals. Does **not** merge side traces, signal lanes, or diagnostics reads.

**Coverage bounds:** chunk `fromSec`/`toSec` from **actual returned data** (times, events, HTF) or verified response meta — never from requested fetch window.

**Component events dedupe:** `(time, role, event_type, component_id, instance_id, side, span_id)`; add `label` if needed.

**BFF size (v1):** raise limit to 50k on window endpoint → measure fetch perf → sub-chunks only if rollback needed. Never silent truncation.

## Open Questions

- **Perf budget:** acceptable p95 for ~50k trace fetch? (Set when running task 4.3 / 5.7.)
