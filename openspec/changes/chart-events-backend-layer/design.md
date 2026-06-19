## Context

### Current state (audit)

**Phase 1 verified:** 2026-06-19 against repo snapshot (post `optimize-workbench-chart-loading` PR1–PR5). No code changes in this phase.

After [`optimize-workbench-chart-loading`](../../archive/2026-06-19-optimize-workbench-chart-loading/) (PR1–PR5), Workbench Chart has a mature **frontend** display pipeline but still uses the wrong **backend product** for markers and HTF overlays.

**Dense endpoint (today):**

| Item | Detail |
|------|--------|
| Route | `GET /api/research/runs/{run_id}/signal-trace` |
| Router | [`research_api/routers/research_runs.py`](../../../research_api/routers/research_runs.py) L75–112 |
| Handler params | `variant`, `from` (ms), `to` **xor** `to_open_time_ms`, optional `context_overlay_ref` |
| Service | [`fetch_signal_trace_bundle`](../../../research_api/services/signal_trace_service.py) L167–242 |
| Family gate | `ema_pullback` only (`UnsupportedSignalTraceFamilyError` → 422) |
| Cap | `MAX_SIGNAL_TRACE_BARS = 50_000` (L47) |
| BFF cache | `_TRACE_CACHE` — FIFO max 32 (L240–241); key via `_cached_full_trace_key` (L152–160) |
| Cache key shape | `{run_id}:{variant}:{start_ms}:{end_ms}:{context_overlay_ref\|""}` — **parsed** window bounds from `parse_time_range_ms`, not raw query params |
| Cached value | Post-`slice_signal_trace` `SignalTraceBundle` (despite L163 comment saying "before slice") |
| Window end | `resolve_exclusive_to_ms` → `MarketParamError` if both `to` and `to_open_time_ms` (subclass of `ValueError` → HTTP 422) |
| Compute | `load_run_report` → warmup OHLCV load → `build_feature_plan` → `add_feature_columns_from_plan` → `build_signal_trace_from_spec` → `slice_signal_trace` → `_to_contract` |

**Response (`SignalTraceBundle`):** [`research_api/contracts/signal_trace.py`](../../../research_api/contracts/signal_trace.py)

- `times`, `meta`, `component_events`
- `htf_context`: `state`, `fast`, `anchor`, `slow`, `meta`
- `context_consumption_trace[]`
- `long` / `short`: each [`SideSignalTrace`](../../../research_api/contracts/signal_trace.py) with **9** bool lanes (`direction_ok` … `portfolio_entry`) + `internals` dict

**Frontend API client (today):**

- [`fetchSignalTrace`](../../../frontend/src/api/client.ts) L94–116 — always sends `to_open_time_ms` (never legacy `to`)
- URL: `/api/research/runs/{runId}/signal-trace`

**Frontend display path (today):**

```text
chartHeavyIoEnabled gate (WorkbenchContext ~1775)
  → evaluateSignalTraceBootstrap / planTraceDisplayLoad
  → planMissingTraceDisplayChunkFetch (max 50_000 bars — traceDisplayChunkScheduling.ts)
  → SignalTraceRequestCoordinator.evaluate (traceRequestKey dedupe)
  → fetchSignalTrace (/signal-trace) — WorkbenchContext ~2073
  → mergeDisplayChunkFromResponse → SignalTraceDisplayCache
  → setSignalTrace(bundle) + session cache — same response feeds lanes today
  → finalizeTraceDisplayUpdate → deriveTraceDisplayStateForCandles / ChartPanel
```

**Frontend display cache ([`signalTraceDisplayCache.ts`](../../../frontend/src/features/chart/signalTraceDisplayCache.ts)):**

| Item | Value |
|------|--------|
| Key | `runId:variant:contextOverlayRef` (`buildTraceDisplayCacheKey`) |
| Stored per chunk | `component_events`, `times`, `htf_context` (full incl. `state` in memory, unused for chart draw) |
| Max chunks | `MAX_CHUNKS_PER_KEY = 10` |
| Coverage | From actual response bounds (`computeChunkBoundsFromResponse`), not requested window |
| Extract | `extractDisplayChunkFromResponse` L107–120 — drops lanes/consumption before merge |

**Lanes/diagnostics (today):** Same network response as display — `setSignalTrace(bundle)` L2121 sets full bundle; [`signalTraceLoadPolicy.ts`](../../../frontend/src/shared/context/signalTraceLoadPolicy.ts) gates lanes by `loadedSignalTraceWindowKey === chartWindowKey`. Session restore via `signalTraceBundleSessionCache`.

**Chart marker fields used:** `time`, `role`, `event_type`, `side`, `label` (+ formatters); not `metadata`/`component_id` for draw ([`chartComponentEvents.ts`](../../../frontend/src/features/chart/chartComponentEvents.ts)).

**Payload audit — chart display vs diagnostics:**

| Field | Chart display | Lanes / inspector / debug |
|-------|---------------|---------------------------|
| `component_events` | Yes (markers) | — |
| `times` | Yes (HTF alignment) | Yes (bar index) |
| `htf_context.{fast,anchor,slow,meta}` | Yes (dashed EMA lines) | Inspector prices |
| `htf_context.state` | **No** | Bar inspector regime |
| `meta` | Yes (formatters) | — |
| `long` / `short` | No | Signal timeline lanes |
| `context_consumption_trace` | No | Trade diagnostics |
| `internals` | No | Bar inspector, exit mgmt |

**Problem:** Every display chunk fetch transfers and serializes dense diagnostic payload (~18 bool arrays × 2 sides + internals) when the chart needs sparse events + HTF EMA points.

Roadmap: [`docs/research/24_workbench_chart_loading_roadmap.md`](../../../docs/research/24_workbench_chart_loading_roadmap.md) §PR6.

### Constraints

- Layer boundaries per [`openspec/config.yaml`](../../config.yaml): BFF in `research_api/`, no strategy logic in `data_engine/`.
- `/signal-trace` contract and consumers MUST remain valid.
- No trading/strategy semantic changes.
- Frontend PR1–PR5 orchestration preserved; Phase 5 swaps display fetch source only.
- HTF regression required per [`workbench-chart-htf-context-overlays`](../../specs/workbench-chart-htf-context-overlays/spec.md).

---

## Goals / Non-Goals

**Goals:**

- Introduce `GET /api/research/runs/{run_id}/chart-events` — sparse display product.
- Backend **cache-on-demand** (v1): compute once per window key, serve lightweight JSON on repeat.
- Separate data products: **chart display** (sparse) vs **diagnostics** (dense `/signal-trace`).
- Preserve frontend display cache, chunk scheduling, coordinator, partial/stale UX.
- Review-gated six-phase rollout with STOP after each slice.

**Non-Goals:**

- Run-generation materialization of chart-event chunks (future phase).
- Disk artifacts beside run JSON in v1.
- Frontend orchestration refactor beyond fetch swap + types + observable fallback.
- Mixing dense and sparse fields in one response.
- Backend cooperative cancellation on client abort (deferred).
- Skipping lane bool computation in research v1 (optional Phase 3b if CPU still too slow).

---

## Decisions

### Decision 1: Two API products, not a mode flag on signal-trace

**Choice:** New route `/chart-events` with its own Pydantic contract.

**Alternative:** `?sparse=1` on `/signal-trace`. Rejected — blurs contracts, complicates caching, encourages accidental dense fetches for display.

### Decision 2: v1 cache-on-demand, not run artifacts

**Choice:** First request computes via existing trace pipeline, projects to `ChartEventsBundle`, stores in `_CHART_EVENTS_CACHE`. Repeat requests read cache.

**Alternative:** Materialize chunks at backtest run generation. Rejected for v1 — storage layout, invalidation, multi-variant/context-ref explosion deferred until sparse format is stable.

### Decision 3: Cache key includes schema version

```
{schema_version}:{run_id}:{variant}:{from_ms}:{exclusive_end_ms}:{context_overlay_ref}
```

- Constant: `CHART_EVENTS_BUNDLE_SCHEMA_VERSION = 1`
- Bump when bundle shape, projection rules, or `MAX_CHART_EVENTS_BARS` change
- Response exposes `coverage.schema_version` for debug
- Separate namespace from `_TRACE_CACHE`
- Old-version entries are never reused after bump (cache miss → recompute)

### Decision 4: Window params — mutual exclusion for `to` vs `to_open_time_ms`

Reuse [`resolve_exclusive_to_ms`](../../../research_api/services/market_reader.py) (parity with signal-trace and market APIs):

- Neither provided → 400
- Both provided → **422** `"provide either to or to_open_time_ms, not both"`
- Cache key uses resolved **`exclusive_end_ms`**, not raw query params

### Decision 5: `ChartEventsHtfContext` excludes `state`

Display contract uses `ChartEventsHtfContext` (`fast`, `anchor`, `slow`, `meta` only).

**Wording:** Regime/state series is diagnostics-only; chart-events does not supply per-bar HTF regime for bar inspector. Bar inspector reads `htf_context.state` from dense `/signal-trace` only.

HTF dashed-line verification applies to **EMA point values**, not `state`.

### Decision 6: v1 compute reuses full trace build, projects response

**Choice:** `build_signal_trace_from_spec` + `slice_signal_trace` → `_project_display_bundle()` strips lanes/consumption/internals before serialize.

**Rationale:** Zero strategy semantic risk; primary v1 win is payload size and JSON parse time.

**Optional Phase 3b:** `build_chart_display_from_spec` skipping lane assembly if CPU remains bottleneck.

### Decision 7: Frontend feature flag + observable fallback

- `VITE_CHART_EVENTS_API=1` enables display fetch to `/chart-events`
- Flag off → legacy `fetchSignalTrace` for display; emit `wb.chart_events_fallback` reason `flag_disabled` once per session
- On chart-events error (404/5xx/network) with flag on → explicit fallback to signal-trace projection; MUST emit debug events (see Clarifications §5 below)
- Fallback MUST NOT be silent catch-all hiding broken deploys

### Decision 8: Dual fetch model for display vs lanes (phased: 5A then 5B)

**Phase 5A (display swap only):**

- **Display:** `fetchChartEvents` → `mergeDisplayChunkFromChartEvents` → display cache
- **Lanes/diagnostics:** keep **existing** `fetchSignalTrace` + `setSignalTrace` lifecycle unchanged — do not refactor lazy lanes, session restore, or `loadedSignalTraceWindowKey` wiring in 5A
- When flag enabled, Workbench MAY issue **both** chart-events (display) and signal-trace (lanes) for the same chunk window — interim double-fetch is acceptable to isolate display regressions from lanes/inspector regressions

**Phase 5B (5A approved — planning 2026-06-19):**

- **Display:** unchanged — `loadDisplayTraceChunk` → display cache commit (5A)
- **Lanes/diagnostics:** lazy dense `/signal-trace` — skip when in-memory or session cache satisfies current window; no second effect, no second coordinator
- **Seam:** `workbenchTraceNetworkLoad.ts` — add policy helper + optional `applyLanesFromSessionBundle`; orchestration stays in single `loadTrace()` inside existing signal-trace effect

Session bundle cache for lanes continues to use full `SignalTraceBundle` keyed by `committedWindowKey` (`chartWindowKey`).

### Decision 9: Phase 5B lazy dense lanes — exact fetch/skip conditions (planning)

**Scope guardrails (non-negotiable):**

| Keep | Do not |
|------|--------|
| Single signal-trace `useEffect` + one `loadTrace()` orchestration | Second effect for lanes |
| `loadDisplayTraceChunk` / display scheduling unchanged | Change chunk planner, pan defer, coordinator instance count |
| One `SignalTraceRequestCoordinator` | Second coordinator |
| `buildTraceRequestKey` for dense in-flight/merged when flag on | Merge display/dense coordinator keys when flag on |

**Consumers that require dense `SignalTraceBundle` (lanes path):**

| Consumer | Dense fields |
|----------|----------------|
| Signal timeline lanes | `long` / `short` bool arrays, `times` |
| Bar inspector | `htf_context.state`, `internals`, bar-index alignment via `times` |
| `ChartTradeDiagnostics` | `context_consumption_trace`, trade causal helpers |
| Session restore target | Full bundle stored under `committedWindowKey` |

Chart markers + HTF EMA lines remain on **display cache only** when chart-events enabled; dense bundle MUST NOT be required for display apply when display cache covers the render window.

**Identity (unchanged from 5A):**

```text
committedWindowKey = chartWindowKey
                   = `${runId}:${variant}:${firstCandleSec}:${lastCandleSec}:${contextOverlayRef}`

displayRequestKey  = buildDisplayTraceRequestKey(chunkParams)   // chart-events prefix when flag on
lanesRequestKey    = buildTraceRequestKey(chunkParams)          // always dense-shaped
```

Session cache: `signalTraceBundleSessionCache.has/get(committedWindowKey)` — LRU max 10 per session identity; cleared on variant/overlay/market identity change.

**Pure policy (new — `decideDenseLanesNetworkLoad` in `workbenchTraceNetworkLoad.ts` or `signalTraceLoadPolicy.ts`):**

Called **after** `loadDisplayTraceChunk` (or after orchestrator skips it). Inputs include **display load outcome**, not scheduling intent.

Inputs: `chartEventsEnabled`, `committedWindowKey`, `loadedSignalTraceWindowKey`, `signalTraceStatus`, `sessionCacheHasWindow`, `displayCacheCoversWindow`, `displayLoadOutcome`, chunk `fromMs` / `toOpenTimeMs`, `lanesRequestKey`.

`displayLoadOutcome` — what actually happened to display **this** `loadTrace()` invocation (derived from orchestrator + `DisplayTraceChunkLoadResult`):

| Outcome | Meaning |
|---------|---------|
| `committed` | `loadDisplayTraceChunk` → `outcome: "committed"` (chart-events merged + display committed) |
| `fallback_needed` | Flag on; chart-events did not commit (`outcome: "continue"` after chart-events fail or skip path) — dense must serve display fallback + lanes |
| `skipped_flag_off` | Flag off; `loadDisplayTraceChunk` → `outcome: "continue"` — display will come from dense |
| `skipped_lanes_only` | `lanesOnlyFetch`; `loadDisplayTraceChunk` not called — display already satisfied |
| `skipped_cache_hit` | Not passed to policy — effect returns before `loadTrace` when display covers **and** lanes ready (scheduling early exit) |

Mapping from orchestrator:

```text
lanesOnlyFetch                          → skipped_lanes_only
!chartEventsEnabled && display called   → skipped_flag_off
chartEventsEnabled && committed         → committed
chartEventsEnabled && continue          → fallback_needed
aborted / stale                         → return before policy (no decision)
```

Outputs:

```typescript
type DenseLanesFetchReason =
  | "flag_off_combined"       // single /signal-trace feeds display + lanes
  | "lanes_pending"           // display satisfied; dense for lanes only
  | "display_fallback_needed" // chart-events failed; dense for fallback + lanes

type DenseLanesNetworkDecision =
  | { action: "skip"; reason: "lanes_ready" | "chart_heavy_io_off" }
  | { action: "restore_session"; windowKey: string }
  | {
      action: "fetch";
      lanesRequestKey: string;
      fromMs: number;
      toOpenTimeMs: number;
      reason: DenseLanesFetchReason;
    };
```

**Policy matrix (after display outcome known):**

| displayLoadOutcome | lanesReady | session restore eligible | Decision |
|--------------------|------------|--------------------------|----------|
| any | yes | — | **skip** `lanes_ready` |
| `skipped_flag_off` | no | — | **fetch** `flag_off_combined` |
| `fallback_needed` | no | — | **fetch** `display_fallback_needed` |
| `committed` | no | yes | **restore_session** |
| `committed` | no | no | **fetch** `lanes_pending` |
| `skipped_lanes_only` | no | yes | **restore_session** |
| `skipped_lanes_only` | no | no | **fetch** `lanes_pending` |
| `fallback_needed` | no | yes | **fetch** `display_fallback_needed` (session bundle stale vs fallback — prefer network) |

Note: when `fallback_needed`, session restore is **not** used — dense response must feed `mergeDisplayFromDenseFallback`.

**`lanesReadyForWindow` (in-memory sufficient — skip dense network):**

```text
signalTraceMatchesChartWindow(committedWindowKey, loadedSignalTraceWindowKey)
AND signalTraceStatus ∈ {"ready", "error"}
```

Lanes UI may show error for current window; no refetch until window/variant/session identity changes or coordinator retry policy allows.

**Session cache sufficient — skip dense network (restore only):**

All of:

1. `chartEventsEnabled === true`
2. `displayCacheCoversWindow === true` (display does not need dense fallback this tick)
3. `sessionCacheHasWindow(committedWindowKey) === true`
4. NOT `lanesReadyForWindow` (otherwise already skipped)
5. Existing bootstrap policy would return `restore_session_cache` — i.e. `decideSignalTraceLoad` path **or** equivalent check inlined before network

Action: `setSignalTrace(sessionBundle)`, update `loadedSignalTraceWindowKey`, status `ready`, **`coordinator.markMerged(lanesRequestKey, "session_restore")`** — **do not** call `loadDenseLanesTrace`, **do not** merge display from session dense when display cache already covers (5A/5B fix to `restore_session` block).

**Dense `/signal-trace` network REQUIRED when:**

1. `chartHeavyIoEnabled === true`, AND
2. Policy returns **`action: "fetch"`** (see matrix above), AND
3. NOT aborted/stale before policy

Fetch **`reason`** distinguishes orchestration merge step:

| `reason` | Display merge from dense? |
|----------|---------------------------|
| `flag_off_combined` | Yes, if not yet merged (`mergeDisplayFromDenseFallback` after fetch) |
| `display_fallback_needed` | Yes (`mergeDisplayFromDenseFallback` after fetch) |
| `lanes_pending` | No (display already committed or cache-covered) |

Equivalent cases (now outcome-driven):

- **Flag off** — `displayLoadOutcome: skipped_flag_off` → **fetch** `flag_off_combined` (one `/signal-trace` for display + lanes)
- **Chart-events failed** — `displayLoadOutcome: fallback_needed` → **fetch** `display_fallback_needed`
- **Chart-events OK, lanes pending** — `committed` or `skipped_lanes_only` → **fetch** `lanes_pending` (unless session restore)
- **Lanes-only path** — `skipped_lanes_only` + lanes pending → **fetch** `lanes_pending` or **restore_session**

**Dense network SKIPPED when:**

| Condition | Decision |
|-----------|----------|
| `!chartHeavyIoEnabled` | **skip** `chart_heavy_io_off` (effect gate, before `loadTrace`) |
| `lanesReadyForWindow` | **skip** `lanes_ready` |
| Flag on + display covers + session hit + lanes stale | **restore_session** (no network) |
| Display covers + lanes ready | Scheduling early return — `loadTrace` not entered |

**NOT skipped (explicit anti-patterns):**

- Display cache covers window but lanes stale from **another** window → MUST restore session or fetch dense (existing spec scenarios)
- Chart-events committed for **chunk** but session holds bundle from **different chunk** on same window key → still fetch dense if `!lanesReadyForWindow` (session bundle is last dense for that window key; if never fetched dense for this window, fetch)

**Orchestration flow (single `loadTrace`, flag on):**

```text
1. [scheduling unchanged] bootstrap → plan → chunkPlan / lanesOnlyFetch / early cache hit
2. displayResult = lanesOnlyFetch ? null : await loadDisplayTraceChunk(ctx)
   displayLoadOutcome = mapDisplayLoadOutcome(lanesOnlyFetch, chartEventsEnabled, displayResult)
   (aborted/stale → return before policy)
3. decision = decideDenseLanesNetworkLoad({ ..., displayLoadOutcome })
4. if decision.action === "skip" → return (no loadDenseLanesTrace)
5. if decision.action === "restore_session" → applyLanesFromSessionBundle(...); return
6. lanesResult = await loadDenseLanesTrace(ctx)
7. if decision.reason ∈ {flag_off_combined, display_fallback_needed} → mergeDisplayFromDenseFallback(...)
8. apply lanes React state / errors (unchanged 5A rules)
```

**Session restore split (5B code change):**

When `chartEventsEnabled && displayCacheCoversWindow`:

- Restore lanes from session only (`applyLanesFromSessionBundle`)
- Skip `mergeDisplayChunkFromResponse` from session bundle (display already from chart-events cache)

When flag off or display not covered: keep today's combined session restore (display merge + lanes).

**Coordinator (same instance):**

- Display commits: `markMerged(displayRequestKey)`
- Dense fetch: `markInFlight` / `markMerged` / `markFailed` on **`lanesRequestKey`** when `chartEventsEnabled`
- When flag off, `displayRequestKey === lanesRequestKey` (unchanged)

**Debug (additive):**

| Step | When |
|------|------|
| `wb.lanes_trace_skip` | `decideDenseLanesNetworkLoad` → skip (reason) |
| `wb.lanes_trace_session_restore` | session restore without dense network |
| Existing `wb.signal_trace.fetch_*` | dense network only |

**Tests (implementation slice):**

- Unit: `decideDenseLanesNetworkLoad` truth table (`displayLoadOutcome` × lanes ready × session × flag)
- Integration: chart-events display hit + session restore → zero `/signal-trace` (extend `chartEventsDisplayLoad.test.tsx`)
- Integration: display covers + session miss → one `/signal-trace`, zero `/chart-events`
- Regression: flag off → single `/signal-trace` (existing workbench tests)

**Out of 5B scope:** inspector-tab-only lazy fetch, second effect, prefetch, backend cancellation, skipping dense when lanes panel collapsed.

---

## Spec authoring clarifications (approved)

### 1. Cache key includes schema version

(See Decision 3.)

### 2. Cache-hit tests: deterministic, not timing

Do **not** assert "second request is faster". Use:

| Approach | Assertion |
|----------|-----------|
| Spy/mock | `build_signal_trace_from_spec` (or `_compute_chart_events`) called **once** across two identical GETs |
| Cache dict | `_CHART_EVENTS_CACHE` contains expected key after first GET; second GET returns equal payload |
| Key helper | `_cached_chart_events_key(...)` includes `schema_version`, overlay ref, `exclusive_end_ms` |

Mirror [`test_signal_trace_cache_key_includes_context_overlay_ref`](../../../tests/test_research_api_signal_trace.py).

### 3. `to` vs `to_open_time_ms` conflict rule

(See Decision 4.)

### 4. `htf_context.state` wording

(See Decision 5.)

### 5. Fallback must be observable

| Surface | Event |
|---------|-------|
| Pipeline debug | `wb.chart_events_fetch_fail` — status, runId, request key, detail |
| Pipeline debug | `wb.chart_events_fallback` — reason: `endpoint_404`, `http_error`, `flag_disabled`, `parse_error` |
| Pipeline debug | `wb.chart_events_merge` — includes `source: "chart-events" \| "signal-trace-fallback"` |
| UI (minimal) | Chart hint or pipeline-debug-gated text when last display fetch used fallback |

**Rules:**

- Fallback opt-in via flag + explicit error handler
- Successful fallback projects display chunk from dense bundle (same marker/HTF values)
- Spec: chart-events 500 + fallback enabled → debug marks emitted AND degraded source visible (not indistinguishable from healthy chart-events)

---

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| v1 still computes full trace on cache miss (CPU unchanged) | Accept for v1; measure; optional Phase 3b skip lane build; future disk materialization |
| `times` + HTF floats still dense (~50k × 4 series) | Major win vs bool lanes + internals; document payload ratio in perf doc |
| Dual fetch complexity (display + lanes) | Lazy lanes fetch; session cache for pan-back |
| Fallback hides broken chart-events | Observable debug + optional UI hint; no silent catch-all |
| HTF regression during fetch swap | HTF verification task every phase; EMA values parity test vs signal-trace |
| Schema version bump invalidates cache | Expected; document in design; test old key ignored |

---

## Migration Plan

1. **Phase 1** — Audit documented (this design §Current State). STOP for review.
2. **Phase 2** — Contracts/types + delta specs. STOP.
3. **Phase 3** — `chart_events_service` + projection + cache. STOP.
4. **Phase 4** — Router endpoint + pytest. Deploy backend only (no frontend change). STOP.
5. **Phase 5A** — Frontend display swap (`fetchChartEvents`, flag, fallback debug). Lanes lifecycle unchanged. **APPROVED.**
6. **Phase 5B planning** — Decision 9 lazy dense lanes policy. **STOP FOR REVIEW (5B.0.4).**
7. **Phase 5B implementation** — Policy + session split + orchestration wire. STOP after 5B.2.
8. **Phase 6** — Acceptance checklist, perf doc, archive.

**Rollback:** Per phase revert; flag off returns display to signal-trace; `/signal-trace` untouched throughout.

**Perf baseline:** Extend [`debug/signal-trace-window-perf.md`](../../../debug/signal-trace-window-perf.md) with chart-events column after Phase 4.

---

## Open Questions

- Phase 3b: Is lane-skipping compute needed after v1 payload win, or only after disk materialization?
- Lanes lazy fetch: trigger on lanes tab activation only, or always fetch dense trace in parallel (higher load)?
- Post-commit idle prefetch for chart-events chunks — re-enable deferred task 4.8 from chart-loading change?
