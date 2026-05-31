# workbench-trace-window-chunk-cache Specification

## Purpose

Workbench Chart accumulates **display-only** signal trace chunks (`component_events`, `htf_context`) in a session cache keyed by run, variant, and context overlay ref, plus a **session bundle cache** for full `SignalTraceBundle` per render window (lanes/diagnostics). Pan within cached time ranges updates events and HTF EMA overlays from display cache without refetch; lanes restore from session bundle cache on pan-back when available.

**Related specs:** `workbench-chart-sliding-window`, `workbench-chart-component-event-markers`, `workbench-chart-htf-context-overlays`, `pipeline-debug-instrumentation`.

## Requirements

### Requirement: Signal trace BFF resolves to_open_time_ms with exclusive end (market API parity)

When Workbench requests signal trace with query param `to_open_time_ms` (last render-window candle open time in milliseconds), the research_api BFF MUST resolve the OHLCV load window end the same way as market bundle endpoints: **`exclusive_end = to_open_time_ms + timeframe_ms(report.timeframe)`** for half-open `TimeWindow [from_ms, exclusive_end)`.

The returned `SignalTraceBundle.times` MUST include the bar whose open time equals the requested `to_open_time_ms` when that bar exists in stored candles and the window is not tail-truncated by `MAX_SIGNAL_TRACE_BARS`.

Explicit `to` query param (exclusive end in milliseconds) MUST continue to be accepted unchanged.

#### Scenario: Full 50k render window trace spans exact bar count and endpoints

- **GIVEN** render window candles span `[T_first, T_last]` with exactly 50 000 bars at timeframe `5m`
- **AND** stored candles exist for every bar in that inclusive open-time range
- **WHEN** Workbench requests signal trace with `from=T_first_ms` and `to_open_time_ms=T_last_ms`
- **THEN** `len(bundle.times) == 50_000`
- **AND** `bundle.times[0] == T_first` (seconds)
- **AND** `bundle.times[-1] == T_last` (seconds)
- **AND** display cache chunk `toSec` equals `T_last`
- **AND** `coversRange(T_first, T_last)` is true after merge

#### Scenario: to_open_time_ms matches market bundle semantics

- **GIVEN** the same `from` and `to_open_time_ms` as a chart market bundle request for the render window
- **WHEN** both endpoints load candles from the Data Engine store
- **THEN** signal trace OHLCV load includes the same last candle open time as the market bundle slice for that window

### Requirement: Workbench maintains a session signal trace display cache (v1)

The Workbench frontend SHALL maintain an in-memory **`SignalTraceDisplayCache`** keyed by `run_id + variant + context_overlay_ref` that accumulates **display-only** trace chunks by time range — not a full trace cache and not a single replaceable window response.

**v1 cache stores ONLY:**

- `component_events`
- `htf_context` data needed to build HTF context EMA overlays
- chunk coverage intervals (`fromSec`, `toSec`)

**v1 cache MUST NOT merge or retain:**

- `long` / `short` side trace internals
- signal timeline lane data
- trade diagnostics trace fields

The cache MUST NOT require fetching the entire report time range in one request.

#### Scenario: Cache key scopes to run variant and context ref

- **GIVEN** run `R1`, variant `instance_1`, context overlay ref `htf_1`
- **WHEN** display trace chunks are stored
- **THEN** cache identity is distinct from run `R2`, variant `instance_2`, or ref `""`
- **AND** changing overlay ref resets the cache for the new identity

#### Scenario: Multiple display chunks merge into accumulated cache

- **GIVEN** a display chunk loaded for `[T0, T1]` with events and HTF context
- **WHEN** a second display chunk loads for an adjacent/overlapping range
- **THEN** the cache merges events and HTF context into one accumulated display source
- **AND** subsequent slices can read events and HTF data spanning the merged coverage

#### Scenario: Side trace and lanes stay outside display cache in v1

- **GIVEN** a signal trace fetch returns `long`, `short`, and `times` for signal lanes
- **WHEN** the response is processed for v1 display cache
- **THEN** only `component_events` and `htf_context` are merged into the display cache
- **AND** signal timeline lanes and trade diagnostics continue to use the latest per-window trace response (not the display cache)

### Requirement: Render window slice reads from trace cache before fetch

When the chart render window changes to `[firstTime, lastTime]`, Workbench MUST:

1. Check whether the trace cache **covers** `[firstTime, lastTime]`
2. If covered → slice `component_events` and `htf_context` from **display cache** for chart display **without** a network request
3. If not covered → fetch signal trace for the **missing or current window range**, extract display fields into cache, merge, then slice for display

Pan-driven render-window shifts MUST follow the same pipeline.

#### Scenario: Pan within cached range is instant

- **GIVEN** trace cache already covers `[T0, T1]`
- **WHEN** user pans the render window to `[T0', T1']` where `T0' >= T0` and `T1' <= T1`
- **THEN** component events and HTF context EMA display update from cache slice immediately
- **AND** no new `fetchSignalTrace` request is started solely due to the pan

#### Scenario: Pan into uncached range triggers chunk fetch

- **GIVEN** trace cache covers `[T0, T1]`
- **WHEN** user pans the render window to `[T0', T1']` not fully contained in cached coverage
- **THEN** Workbench requests signal trace for the missing/current window range
- **AND** merges the response into cache when ready
- **AND** display updates from the merged cache slice

#### Scenario: Pan back to previously visited range uses cache

- **GIVEN** user previously loaded trace for window `[Ta, Tb]` and later for `[Tc, Td]`
- **AND** both ranges are present in the merged cache
- **WHEN** user pans back so the render window equals `[Ta, Tb]` again
- **THEN** events and HTF overlays render from cache slice without refetch

### Requirement: Trace cache invalidates on run variant or context ref change

The trace chunk cache MUST reset when `selectedRunId`, `selectedVariantKey`, or `effectiveContextOverlayRef` changes.

Render-window pan alone MUST NOT clear the cache.

#### Scenario: Variant switch clears trace cache

- **WHEN** user selects a different variant in the same run
- **THEN** the prior variant's trace cache is discarded
- **AND** the first render window for the new variant may fetch a new chunk

### Requirement: Display pipeline uses cache source then render-window slice

Component events and HTF context EMA overlays MUST be derived by:

```text
SignalTraceDisplayCache (merged display chunks)
        ↓ slice to render window time bounds
        ↓ align with chartView.candles
Chart component events + HTF EMA overlays
```

Display MUST NOT treat the latest single `fetchSignalTrace` response as the sole long-lived source for **component events and HTF overlays** when display cache has broader coverage.

#### Scenario: HTF overlays from cache slice match trace htf_context

- **GIVEN** cache contains `htf_context` for times overlapping the render window
- **WHEN** HTF aux overlays render
- **THEN** overlay point values match cached `htf_context.{fast,anchor,slow}` at each aligned time
- **AND** points outside the render window are not shown

#### Scenario: Component events from cache slice respect render window

- **GIVEN** cache contains `component_events` spanning a wider range than the render window
- **WHEN** markers render
- **THEN** only events with `time` within render window `[first, last]` are passed to the chart marker plugin

### Requirement: Uncovered render window shows loading or partial stale state

When the render window is not fully covered by cache and a fetch is in progress, Workbench MAY show existing stale/loading indicators (`htfAuxEmaOverlayStale`, `componentEventsStale`) for uncovered data.

When cache partially covers the window, Workbench MAY display events/HTF for the covered sub-range while loading the remainder.

#### Scenario: Stale banner during chunk load

- **GIVEN** render window `[T0', T1']` is not fully covered by cache
- **AND** signal trace fetch is in progress
- **WHEN** the chart renders
- **THEN** stale indicators MAY appear for HTF/events until coverage is complete
- **AND** previously cached sub-range data MAY remain visible if it overlaps the render window

### Requirement: Display cache coverage reflects actual fetched span (no silent BFF truncation)

When Workbench requests signal trace for render window `[firstTime, lastTime]`, the display cache MUST record chunk coverage only for the **time span actually present** in the BFF response — not the requested window if the response was truncated.

**Coverage intervals MUST be based on actual returned trace bounds, not requested bounds.**

When merging a fetch response into the display cache, Workbench MUST set each chunk's `fromSec` / `toSec` from the **minimum and maximum time present** in returned display data — e.g. `response.times`, `component_events[].time` — or from verified response metadata when BFF exposes actual span bounds. Requested fetch parameters MUST NOT be used as chunk coverage. The `times` array is the canonical bar grid; `htf_context` series are index-aligned with `times`.

If BFF returns fewer bars than the requested window (e.g. due to `MAX_SIGNAL_TRACE_BARS`), Workbench MUST NOT treat the full render window as cache-covered.

Workbench MUST detect truncation by comparing requested window bounds to returned trace time bounds (or explicit truncation metadata when available).

#### Scenario: Chunk bounds derived from response data not request params

- **GIVEN** Workbench requests trace for render window `[T_req_start, T_req_end]`
- **AND** BFF returns display fields spanning only `[T_ret_start, T_ret_end]` where `T_ret_end < T_req_end`
- **WHEN** the response is merged into display cache
- **THEN** the stored chunk has `fromSec = T_ret_start` and `toSec = T_ret_end` computed from returned data
- **AND** chunk bounds are NOT set to `[T_req_start, T_req_end]`

#### Scenario: Truncated BFF response does not falsely cover full render window

- **GIVEN** render window spans 50 000 bars
- **AND** BFF returns trace data covering only the first 5 000 bars of that window
- **WHEN** the response is merged into display cache
- **THEN** `coversRange` is true only for the returned sub-span
- **AND** `coversRange` is false for the full 50 000-bar window
- **AND** Workbench MAY show stale/partial indicator for the uncovered portion

#### Scenario: Full-span response allows true cache coverage

- **GIVEN** BFF returns trace display fields spanning the full requested `[firstTime, lastTime]`
- **WHEN** merged into display cache
- **THEN** `coversRange(firstTime, lastTime)` is true
- **AND** pan within that span does not refetch for chart events/HTF

### Requirement: Component events dedupe uses full display identity

When merging `component_events` across display cache chunks, Workbench MUST dedupe events by the tuple `(time, role, event_type, component_id, instance_id, side, span_id)`.

Workbench MAY include `label` in the dedupe key when events share the same tuple without `label` and would otherwise collapse incorrectly.

#### Scenario: Distinct components at same time remain separate

- **GIVEN** two `component_events` with the same `time`, `role`, `event_type`, and `instance_id`
- **AND** they differ by `component_id` or `side`
- **WHEN** display chunks are merged
- **THEN** both events remain in the cache
- **AND** neither is dropped as a duplicate

### Requirement: Workbench maintains a session signal trace bundle cache for lanes (v1)

The Workbench frontend SHALL maintain an in-memory **`SignalTraceBundleSessionCache`** keyed by `chartWindowKey` (`run_id:variant:firstTime:lastTime:context_overlay_ref`), scoped to the same identity as `SignalTraceDisplayCache` (`run_id + variant + context_overlay_ref`).

On successful `fetchSignalTrace` for a window, Workbench MUST store the full `SignalTraceBundle` in the session cache.

When the render window changes to a `chartWindowKey` that already exists in the session cache, Workbench MUST restore `signalTrace`, `loadedSignalTraceWindowKey`, and lanes/diagnostics ready state from cache **without** a network request.

The session cache MUST enforce **`MAX_SESSION_TRACE_BUNDLES_PER_KEY = 10`** (LRU eviction of oldest entries when exceeded), matching display cache chunk cap.

**`SignalTraceBundleSessionCache` MUST reset** (discard all cached bundles) when any of the following change:

- `selectedRunId`
- `selectedVariantKey`
- `effectiveContextOverlayRef`
- `reloadToken` (run report reload / Workbench refresh identity)
- `marketCacheKey` or `intendedMarketCacheKey` used by WorkbenchContext for chart candle bundle identity

Reset on run/variant/context alone is **not sufficient** — reload with the same run id MUST NOT reuse a prior session bundle.

#### Scenario: Pan back restores lanes from session cache

- **GIVEN** user previously fetched signal trace for render window `[Ta, Tb]` (stored in session cache)
- **AND** user panned to window `[Tc, Td]` (different `chartWindowKey`)
- **WHEN** user pans back so the render window equals `[Ta, Tb]` again
- **THEN** component events and HTF render from display cache slice without refetch for chart layers
- **AND** lanes and diagnostics use the restored bundle for `[Ta, Tb]` without `api.fetchSignalTrace`
- **AND** lanes do not display `[Tc, Td]` trace data as ready

#### Scenario: First visit to window still fetches

- **GIVEN** session cache does not contain `chartWindowKey` for render window `[T0, T1]`
- **WHEN** the render window becomes `[T0, T1]`
- **THEN** Workbench requests signal trace over the network
- **AND** stores the response in both display cache and session cache when ready

#### Scenario: Run reload clears session cache

- **GIVEN** session cache holds bundles for the current run and variant
- **WHEN** Workbench `reloadToken` increments (report/market reload) or `marketCacheKey` changes for the chart bundle
- **THEN** session cache is reset and no prior `chartWindowKey` bundle is restored
- **AND** the next render window for that key triggers a network fetch

#### Scenario: Session cache LRU evicts oldest at cap

- **GIVEN** session cache already holds 10 distinct `chartWindowKey` entries for the active cache identity
- **WHEN** an 11th window bundle is stored
- **THEN** the oldest entry is evicted
- **AND** pan-back to the evicted window requires a network fetch

### Requirement: Lanes and diagnostics use per-window signal trace (v1 dual model)

Signal timeline lanes and trade diagnostics MUST use the latest `signalTrace` bundle for the **current** render window (`loadedSignalTraceWindowKey` matches `chartWindowKey`). Display cache hits for chart events/HTF MUST NOT skip per-window trace availability when the loaded bundle is for a different window.

When display cache covers the render window but `signalTrace` is for another window, Workbench MUST obtain the bundle for the current window — from **session cache** when present, otherwise via network fetch — while chart layers read from display cache.

Lanes/diagnostics MUST NOT show `ready` or error state from a prior window after pan to a cached range.

#### Scenario: Pan back restores lanes from session cache while chart uses display cache

- **GIVEN** display cache covers render window `[Ta, Tb]`
- **AND** session cache holds the full bundle for `chartWindowKey` of `[Ta, Tb]`
- **AND** `signalTrace` was last loaded for window `[Tc, Td]`
- **WHEN** user pans back to `[Ta, Tb]`
- **THEN** component events and HTF render from display cache without network refetch for chart layers
- **AND** Workbench restores lanes/diagnostics bundle for `[Ta, Tb]` from session cache without network refetch
- **AND** lanes do not display `[Tc, Td]` trace data as ready

#### Scenario: Pan back with session miss fetches lanes bundle

- **GIVEN** display cache covers render window `[Ta, Tb]`
- **AND** session cache does not hold the bundle for `[Ta, Tb]` (evicted or never fetched)
- **WHEN** user pans back to `[Ta, Tb]`
- **THEN** component events and HTF render from display cache without refetch for chart layers
- **AND** Workbench requests signal trace for `[Ta, Tb]` for lanes/diagnostics
- **AND** lanes do not display stale trace from another window as ready
