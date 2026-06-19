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

### Requirement: Display cache coverage does not authorize network refetch

`SignalTraceDisplayCache.coversRange` and `missingRange` govern **display slice and stale UI only**. They MUST NOT be used as the sole condition to start another `fetchSignalTrace` when `SignalTraceRequestCoordinator` has already `markMerged` the same `traceRequestKey`.

When display cache does not cover the full committed window because of BFF truncation, Workbench MAY show partial/stale display state without issuing a duplicate identical network GET for the same `traceRequestKey` in v1.

#### Scenario: Truncated merge does not cause identical URL storm

- **GIVEN** BFF returned a truncated span for committed window request
- **AND** `coversRange(fullWindow)` is false after merge
- **AND** `markMerged(K)` was recorded for that fetch's `traceRequestKey`
- **WHEN** the signal-trace orchestration effect runs again with unchanged fetch parameters
- **THEN** no second identical `fetchSignalTrace` request is authorized
- **AND** display may remain partial until a future multi-chunk fetch feature (out of scope)

### Requirement: Network fetch scheduling defers to SignalTraceRequestCoordinator

After policy gates (bootstrap ready, pan idle, session restore path selection), Workbench MUST call `SignalTraceRequestCoordinator.evaluate` before `api.fetchSignalTrace`.

`decideSignalTraceLoad` and `planTraceDisplayLoad` MUST NOT implement durable dedupe actions `skip_display_cache_hit`, `skip_already_loading`, `skip_identical_in_flight`, or `load_start` as network authorization.

#### Scenario: Uncovered window still respects coordinator ledger

- **GIVEN** display cache does not cover the committed window
- **AND** coordinator has `already_merged` for current `traceRequestKey`
- **WHEN** orchestration evaluates fetch need
- **THEN** no network fetch starts
- **AND** display apply may slice available cached data

### Requirement: Render window slice reads from trace cache before fetch

When the **committed** chart render window changes to `[firstTime, lastTime]`, Workbench MUST:

1. Check whether the trace display cache covers `[firstTime, lastTime]` for display slice purposes
2. If covered, slice `component_events` and `htf_context` from cache immediately without network request
3. If uncovered for display, consult **`SignalTraceRequestCoordinator`** for whether a network fetch for the current `traceRequestKey` is authorized; only on coordinator `fetch` action schedule `fetchSignalTrace` and merge result into cache

Pan-driven transient states before window commit MUST NOT trigger fetch decisions for display cache.

Display updates from cache MUST remain independent from viewport commands; cache hits or merges MUST NOT issue viewport focus/restore.

#### Scenario: Covered committed window updates display without fetch

- **GIVEN** display cache covers committed window `[T0, T1]`
- **WHEN** committed window changes to `[T0', T1']` fully inside coverage
- **THEN** markers and HTF overlays are sliced from cache immediately
- **AND** no `fetchSignalTrace` request starts for that transition

#### Scenario: Uncovered committed window schedules fetch only via coordinator

- **GIVEN** display cache does not fully cover committed window `[T0', T1']`
- **AND** coordinator `evaluate` returns `fetch` for the current `traceRequestKey`
- **WHEN** the new window is committed and policy pan gates allow
- **THEN** Workbench requests signal trace over the network once per coordinator authorization
- **AND** display keeps cache-derived partial/stale state until merge completes

#### Scenario: Pan back to previously visited range uses cache

- **GIVEN** user previously loaded trace for window `[Ta, Tb]` and later for `[Tc, Td]`
- **AND** both ranges are present in the merged display cache or coordinator `mergedKeys` contains the fetch key for `[Ta, Tb]`
- **WHEN** user pans back so the committed render window equals `[Ta, Tb]` again
- **THEN** events and HTF overlays render from cache slice without refetch for the same `traceRequestKey`

### Requirement: Pan-active trace fetches SHALL be coalesced by latest committed intent

While pan is active and render-window shift intents are still pending, Workbench MUST coalesce trace fetch planning to prevent request storms from transient boundary oscillations.

At most one uncovered committed window intent MAY be queued for post-idle evaluation per active pan cycle; superseded intents MUST be replaced by the latest one.

For v1 controller runtime, uncovered pending windows during active pan MUST use strict idle-only fetch policy:

- no network prefetch starts during active pan for uncovered pending windows;
- only cache-hit display updates for current committed window are allowed during active pan.

#### Scenario: Rapid boundary oscillation does not spawn many requests

- **GIVEN** user rapidly drags near both safe-zone boundaries during one active pan cycle
- **WHEN** multiple pending shift intents are produced before idle commit
- **THEN** Workbench retains only the latest committed-window fetch intent
- **AND** does not enqueue one network fetch per transient intent

#### Scenario: Active pan uncovered range does not prefetch

- **GIVEN** pending shift points to an uncovered range while pan is still active
- **WHEN** controller evaluates trace scheduling
- **THEN** no network fetch starts for that pending uncovered range
- **AND** fetch starts only after committed shift (pointerup or idle fallback commit)

#### Scenario: Trace merge updates display only

- **GIVEN** a coalesced fetch response is merged into display cache
- **WHEN** current window display data is recomputed
- **THEN** marker and HTF overlays update for current committed window
- **AND** viewport command remains unchanged (`noViewportChange`)

### Requirement: Trace cache invalidates on run variant or context ref change

The trace chunk cache MUST reset when `selectedRunId`, `selectedVariantKey`, or `effectiveContextOverlayRef` changes.

`SignalTraceRequestCoordinator.reset()` MUST run on the same identity changes that invalidate fetch parameters.

Render-window pan alone MUST NOT clear the display cache or coordinator merged ledger.

`selectedStrategyInstanceId` change alone MUST NOT reset the display cache or coordinator when fetch parameters are unchanged.

#### Scenario: Variant switch clears trace cache

- **WHEN** user selects a different variant in the same run
- **THEN** the prior variant's trace cache is discarded
- **AND** coordinator ledgers are cleared
- **AND** the first render window for the new variant may fetch a new chunk

#### Scenario: Instance switch does not clear trace cache

- **GIVEN** fetch parameters unchanged
- **WHEN** user selects a different strategy instance in the report UI
- **THEN** display cache and coordinator merged keys for the current `traceRequestKey` remain
- **AND** no automatic network refetch occurs for that key

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

### Requirement: Trace display exposes partial coverage state

Workbench SHALL represent trace display state as more than loaded/loading. The display state MUST distinguish current, partial, stale, loading missing range, and empty states, and MUST expose covered ranges and missing range for the committed render window.

#### Scenario: Partial coverage is visible to display logic

- **GIVEN** the committed render window spans `[T0, T3]`
- **AND** trace display cache covers `[T0, T1]` and `[T2, T3]`
- **WHEN** display state is derived for the render window
- **THEN** status is `partial` or `loading_missing`
- **AND** covered ranges include `[T0, T1]` and `[T2, T3]`
- **AND** missing range includes `[T1, T2]`

### Requirement: Cache miss does not clear all component events

When a committed render window is not fully covered by trace display cache, Workbench MUST NOT clear all component event markers solely because the exact window is uncovered.

Workbench MUST display cached events for covered portions when available and mark uncovered portions stale or loading until missing data arrives.

#### Scenario: Window shift preserves covered events

- **GIVEN** component events are displayed for a render window
- **WHEN** pan commits a shift to a window that is only partially covered by trace display cache
- **THEN** Workbench keeps displayable events from covered ranges
- **AND** Workbench does not call the display pipeline with an unconditional empty event list solely due to the cache miss

### Requirement: Missing-range scheduling uses normalized trace display chunks

When trace display cache does not cover the committed render window, Workbench SHALL compute the missing range and plan one or more normalized trace display chunks. The planning/debug chunk identity (`traceDisplayChunkKey`) MUST include run, variant, context overlay ref, and normalized range bounds. Display cache storage and coverage remain interval-based.

The network request identity (`traceRequestKey`) MUST remain the identity of the real `/signal-trace` request. If normalized bounds are actually sent to `/signal-trace`, then `traceRequestKey` MAY include those normalized bounds. If normalized chunks are only a frontend planning concept, `traceDisplayChunkKey` MUST NOT replace `traceRequestKey`.

While dense `/signal-trace` remains the source, normalized chunks MUST be coarse enough to avoid many small recomputations. Active-pan prefetch MUST NOT be introduced in the first missing-range scheduling slice.

#### Scenario: Uncovered window schedules normalized chunk

- **GIVEN** a committed render window is not fully covered by trace display cache
- **WHEN** trace scheduling evaluates the window
- **THEN** Workbench computes missing coverage
- **AND** Workbench maps the missing coverage to normalized chunk bounds
- **AND** Workbench records those bounds in `traceDisplayChunkKey`
- **AND** `traceRequestKey` continues to match the actual network request parameters

#### Scenario: Frontend-only normalized chunk does not replace network key

- **GIVEN** Workbench plans a normalized display chunk for cache coverage
- **AND** Workbench chooses to send a different exact range to `/signal-trace`
- **WHEN** the network request is scheduled
- **THEN** `traceDisplayChunkKey` uses the normalized display chunk bounds
- **AND** `traceRequestKey` uses the exact range sent over the network

#### Scenario: Active pan does not prefetch missing trace

- **GIVEN** the user is actively panning near a safe-zone boundary
- **AND** a pending shift points to an uncovered trace range
- **WHEN** trace scheduling evaluates active-pan state
- **THEN** Workbench does not start active-pan prefetch
- **AND** trace loading waits for committed window evaluation or post-commit idle prefetch

### Requirement: Post-commit idle prefetch is allowed after stable ledgers

After request identity, supersede, abort/stale-response handling, and in-flight range ledgers are implemented, Workbench SHALL support optional post-commit idle prefetch of a neighboring normalized trace chunk after a committed window shift becomes idle.

#### Scenario: Neighbor prefetch waits until commit idle

- **GIVEN** a render-window shift has committed
- **AND** the current window trace scheduling has settled
- **WHEN** post-commit idle prefetch is enabled
- **THEN** Workbench may request one neighboring normalized trace chunk
- **AND** the prefetch is tracked by the same in-flight and supersede ledgers as foreground trace requests
