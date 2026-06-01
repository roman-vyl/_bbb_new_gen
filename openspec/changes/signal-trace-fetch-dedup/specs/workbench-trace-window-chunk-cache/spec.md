## ADDED Requirements

### Requirement: Signal trace network dedupe has a single owner (coordinator)

Network fetch authorization for signal trace SHALL be decided only by **`SignalTraceRequestCoordinator`**. No other module (`decideSignalTraceLoad`, `SignalTraceDisplayCache`, `traceDisplayOrchestrator`, `WorkbenchContext` local guards) SHALL implement parallel in-flight, cache-hit, or already-merged dedupe.

`signalTraceLoadPolicy` SHALL restrict itself to bootstrap, session restore, idle, and pan scheduling gates.

`SignalTraceDisplayCache.coversRange === false` SHALL NOT by itself authorize a repeat `fetchSignalTrace` for the same `traceRequestKey` after that key was already merged (e.g. truncated BFF response).

#### Scenario: Display cache miss after truncated merge does not refetch

- **GIVEN** display cache does not cover the full committed window after one merged response for `traceRequestKey` `K1`
- **WHEN** orchestration evaluates again with the same `K1`
- **THEN** coordinator returns skip with `already_merged` (or equivalent)
- **AND** `decideSignalTraceLoad` does not return a fetch-authorizing action based on `coversRange` alone

### Requirement: Signal trace network fetch is deduplicated by traceRequestKey

Workbench SHALL compute a deterministic **`traceRequestKey`** for each committed signal-trace network request:

`traceRequestKey` MUST be derived from the **exact normalized parameters** passed to `fetchSignalTrace` (BFF query: `from`, `to_open_time_ms`, `variant`, optional `context_overlay_ref`, run id in path).

Workbench MUST NOT build the key from a different time interpretation than the HTTP request (no separate inclusive/exclusive end, rounding, or candle-time conversion between key and fetch).

Canonical string form: `run_id + ":" + variant + ":" + from_ms + ":" + to_open_time_ms + ":" + context_overlay_ref`, where `from_ms` and `to_open_time_ms` are the same numbers sent as `from` and `to_open_time_ms` on the wire.

For a given `traceRequestKey`, Workbench MUST NOT start a new `fetchSignalTrace` network request when any of the following holds:

1. A fetch for the same `traceRequestKey` is **in flight**.
2. The signal trace **display cache** fully covers the committed render window time range (`coversRange`).
3. A response for the same `traceRequestKey` was **already merged** in this session and the key has not changed (even if `coversRange` is still false due to BFF truncation).

When the committed window changes such that `from_ms` or `to_open_time_ms` changes, or run/variant/context overlay ref changes, Workbench MUST treat that as a new `traceRequestKey` and MAY fetch again.

Stale in-flight responses MUST be ignored when `traceRequestKey` or load generation no longer matches the active committed window.

#### Scenario: traceRequestKey matches BFF URL query params

- **GIVEN** Workbench authorizes a signal-trace fetch for committed window `K1`
- **WHEN** debug logs `traceRequestKey` and the BFF receives `GET .../signal-trace?...`
- **THEN** the key's `from_ms`, `to_open_time_ms`, `variant`, and `context_overlay_ref` equal the corresponding query parameter values on the wire

#### Scenario: One backtest click causes at most one network fetch per traceRequestKey

- **GIVEN** debug enabled and market/report ready after a single backtest completes
- **AND** committed render window produces `traceRequestKey` `K1`
- **WHEN** Workbench finishes the signal-trace orchestration cycle for `K1`
- **THEN** `api.fetchSignalTrace` count for query parameters matching `K1` is at most **1**
- **AND** repeated React renders afterward do not increment `api.fetchSignalTrace` for `K1`

#### Scenario: In-flight blocks duplicate identical requests

- **GIVEN** `fetchSignalTrace` for `traceRequestKey` `K1` is in progress
- **WHEN** the signal-trace orchestration effect runs again with the same `K1` before the response completes
- **THEN** no second network request starts for `K1`
- **AND** debug records `skipReason` of `in_flight` from coordinator (not from `decideSignalTraceLoad`)

#### Scenario: Already merged blocks repeat fetch when display cache still uncovered

- **GIVEN** a truncated BFF response was merged for `K1` such that `coversRange` for the full committed window is false
- **WHEN** the orchestration effect runs again with the same `K1` after merge completed
- **THEN** no additional `fetchSignalTrace` runs for `K1`
- **AND** debug records `skipReason` of `already_merged`

#### Scenario: Committed window shift starts new fetch

- **GIVEN** trace was merged for `K1` covering window `[Ta, Tb]`
- **WHEN** user pans and commits a new render window `[Tc, Td]` producing `K2` where `K2 ≠ K1`
- **AND** display cache does not cover `[Tc, Td]`
- **THEN** Workbench MAY start exactly one new fetch for `K2`

#### Scenario: Stale response ignored after supersede

- **GIVEN** fetch for `K1` is in flight
- **WHEN** committed window changes to `K2` before the `K1` response returns
- **THEN** merging and state updates from the `K1` response MUST NOT apply
- **AND** debug MAY record `superseded` for the dropped response

### Requirement: Coordinator reset does not clear merged keys on pan

`SignalTraceRequestCoordinator.reset()` SHALL be invoked only when run identity, variant identity, context overlay ref identity, or a full trace/session cache reset occurs.

`reset()` MUST NOT be invoked solely because the committed render window or `traceRequestKey` changed due to pan or render-window commit.

#### Scenario: Pan back to previously merged key does not refetch

- **GIVEN** trace was merged for `K1`, then user committed `K2` and merged `K2`, then user commits window `K1` again without changing run, variant, or context overlay ref
- **WHEN** coordinator evaluates for `K1`
- **THEN** `K1` is still present in `mergedKeys` (coordinator was not reset on pan)
- **AND** skip reason is `already_merged` or `cache_hit`
- **AND** no new `fetchSignalTrace` for `K1`

### Requirement: Coordinator maintains merged and in-flight ledgers

`SignalTraceRequestCoordinator` SHALL track:

- `mergedKeys`: set of `traceRequestKey` values successfully merged or restored this session (not a single `lastMergedKey` ref)
- `inFlightKeys`: map of `traceRequestKey` to request generation while fetch is active
- `failedKeys`: optional bounded map of keys that failed fetch; same key MUST NOT auto-retry on the next effect pass

#### Scenario: Failed fetch does not tight-loop retry

- **GIVEN** `fetchSignalTrace` for `K1` failed (timeout or 5xx) and coordinator recorded failure for `K1`
- **WHEN** the signal-trace effect runs again with the same `K1` without run reload or identity reset
- **THEN** coordinator returns skip with `failed_same_key` (or equivalent)
- **AND** no immediate second network request starts for `K1`

### Requirement: Session restore marks traceRequestKey as merged

When Workbench restores signal trace from session bundle for committed window producing `traceRequestKey` `K`, it MUST call `coordinator.markMerged(K, session_restore)` before completing the restore path.

#### Scenario: Session restore does not trigger network fetch for same key

- **GIVEN** session bundle exists for `K1`
- **WHEN** Workbench applies session restore for the committed window matching `K1`
- **THEN** coordinator records `K1` as merged
- **AND** a subsequent evaluate for `K1` skips with `cache_hit` or `already_merged` without `api.fetchSignalTrace`

### Requirement: Signal-trace effect uses stable primitive dependencies only

The Workbench signal-trace orchestration `useEffect` dependency array MUST include only stable primitives that define committed trace identity: run id, variant key, committed `from`/`to` open times (ms), context overlay ref, market load status, and render-window revision when committed bounds change.

It MUST NOT list `report`, `selectedVariant`, chart view model, display cache version, merge/apply output objects, or display-cache cover flags as dependencies.

Coverage for fetch decisions MUST be read synchronously from `SignalTraceDisplayCache` inside the effect body.

#### Scenario: Merge does not re-trigger fetch evaluation via effect deps

- **GIVEN** a successful merge for `K1` bumped display cache internal state
- **WHEN** no committed trace primitive changed
- **THEN** the signal-trace effect does not re-run solely because of merge/apply output or `displayCacheVersion`
- **AND** if it does run, coordinator returns `already_merged` for `K1`

## MODIFIED Requirements

### Requirement: Render window slice reads from trace cache before fetch

When the **committed** chart render window changes to `[firstTime, lastTime]`, Workbench MUST:

1. Check whether the trace display cache covers `[firstTime, lastTime]`
2. If covered, slice `component_events` and `htf_context` from cache immediately without network request
3. If uncovered, schedule fetch for the missing/current committed window range and merge result into cache **only when no fetch for the same `traceRequestKey` is in flight and the key is not already merged**

Pan-driven transient states before window commit MUST NOT trigger fetch decisions for display cache.

After scheduling a fetch, Workbench MUST record the active `traceRequestKey` as in-flight until the response completes, fails, or is superseded.

#### Scenario: Covered committed window updates display without fetch

- **GIVEN** display cache covers `[firstTime, lastTime]` for current run/variant/context ref
- **WHEN** the committed render window is set to that range
- **THEN** component events and HTF overlays update from cache slice
- **AND** no `fetchSignalTrace` request starts for that transition

#### Scenario: Uncovered committed window schedules fetch

- **GIVEN** display cache does not cover the committed window
- **AND** no successful merge exists yet for the current `traceRequestKey`
- **WHEN** the committed render window is set
- **THEN** Workbench schedules at most one trace fetch for that `traceRequestKey`
- **AND** subsequent effect passes for the same key do not schedule additional fetches until the key changes

#### Scenario: Pan inside covered range does not refetch

- **GIVEN** display cache covers the new committed window after pan
- **WHEN** user pans and commits a window fully inside cached coverage
- **THEN** events and HTF overlays render from cache slice without refetch
