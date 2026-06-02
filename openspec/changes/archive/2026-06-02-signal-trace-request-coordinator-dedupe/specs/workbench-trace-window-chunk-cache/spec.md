## ADDED Requirements

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

## MODIFIED Requirements

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
