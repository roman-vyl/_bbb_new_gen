## ADDED Requirements

### Requirement: Signal trace BFF resolves to_open_time_ms with exclusive end (market API parity)

When Workbench requests signal trace with query param `to_open_time_ms` (last render-window candle open time in milliseconds), the research_api BFF MUST resolve the OHLCV load window end the same way as market bundle endpoints: **`exclusive_end = to_open_time_ms + timeframe_ms(report.timeframe)`** for half-open `TimeWindow [from_ms, exclusive_end)`.

The returned `SignalTraceBundle.times` MUST include the bar whose open time equals the requested `to_open_time_ms` when that bar exists in stored candles and the window is not tail-truncated by `MAX_SIGNAL_TRACE_BARS`.

Explicit `to` query param (exclusive end in milliseconds) MUST continue to be accepted unchanged.

#### Scenario: Full 50k render window trace includes last candle open time

- **GIVEN** render window candles span `[T_first, T_last]` with 50 000 bars at timeframe `5m`
- **WHEN** Workbench requests signal trace with `from=T_first_ms` and `to_open_time_ms=T_last_ms`
- **THEN** the response `times` array includes `T_last` (in seconds)
- **AND** display cache chunk `toSec` equals `T_last`
- **AND** `coversRange(T_first, T_last)` is true after merge

#### Scenario: to_open_time_ms matches market bundle semantics

- **GIVEN** the same `from` and `to_open_time_ms` as a chart market bundle request for the render window
- **WHEN** both endpoints load candles from the Data Engine store
- **THEN** signal trace OHLCV load includes the same last candle open time as the market bundle slice for that window

### Requirement: Workbench maintains a session signal trace bundle cache for lanes (v1)

The Workbench frontend SHALL maintain an in-memory **`SignalTraceBundleSessionCache`** keyed by `chartWindowKey` (`run_id:variant:firstTime:lastTime:context_overlay_ref`), scoped to the same identity as `SignalTraceDisplayCache` (`run_id + variant + context_overlay_ref`).

On successful `fetchSignalTrace` for a window, Workbench MUST store the full `SignalTraceBundle` in the session cache.

When the render window changes to a `chartWindowKey` that already exists in the session cache, Workbench MUST restore `signalTrace`, `loadedSignalTraceWindowKey`, and lanes/diagnostics ready state from cache **without** a network request.

The session cache MUST reset when `selectedRunId`, `selectedVariantKey`, or `effectiveContextOverlayRef` changes (same invalidation as display cache).

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

## MODIFIED Requirements

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
