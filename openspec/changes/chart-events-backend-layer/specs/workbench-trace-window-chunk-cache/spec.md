# workbench-trace-window-chunk-cache Specification (delta)

## ADDED Requirements

### Requirement: Chart display network source is chart-events when enabled

When `VITE_CHART_EVENTS_API` is enabled, Workbench display chunk fetches MUST use `GET /api/research/runs/{run_id}/chart-events` for markers and HTF overlay data merged into `SignalTraceDisplayCache`.

Dense `/signal-trace` MUST remain available for lanes, bar inspector, and diagnostics — display cache hits MUST NOT replace per-window dense trace when lanes require it.

#### Scenario: Display fetch uses chart-events endpoint

- **GIVEN** `VITE_CHART_EVENTS_API=1`
- **AND** display cache does not cover the committed render window
- **WHEN** Workbench schedules a display chunk network fetch
- **THEN** the request targets `/chart-events` with the same window query params as today's signal-trace display fetch
- **AND** the response is merged via chart-events display adapter (not full `SignalTraceBundle`)

#### Scenario: Flag disabled keeps signal-trace display path

- **GIVEN** `VITE_CHART_EVENTS_API` is unset or not `1`
- **WHEN** Workbench schedules a display chunk network fetch
- **THEN** the request targets `/signal-trace` as today
- **AND** pipeline debug emits `wb.chart_events_fallback` with reason `flag_disabled` once per session

## MODIFIED Requirements

### Requirement: Lanes and diagnostics use per-window signal trace (v1 dual model)

Signal timeline lanes and trade diagnostics MUST use the latest dense `signalTrace` bundle for the **current** render window (`loadedSignalTraceWindowKey` matches `chartWindowKey`).

Chart display (component events and HTF EMA overlays) MUST use `SignalTraceDisplayCache`, populated from **chart-events** when enabled or from signal-trace projection when not.

Display cache hits for chart events/HTF MUST NOT skip per-window dense trace availability when lanes require the current window and the loaded dense bundle is for a different window.

When display cache covers the render window but `signalTrace` is for another window, Workbench MUST obtain the dense bundle for the current window — from **session cache** when present, otherwise via `/signal-trace` network fetch — while chart layers read from display cache.

Lanes/diagnostics MUST NOT show `ready` or error state from a prior window after pan to a cached range.

#### Scenario: Pan back restores lanes from session cache while chart uses display cache

- **GIVEN** display cache covers render window `[Ta, Tb]`
- **AND** session cache holds the full dense bundle for `chartWindowKey` of `[Ta, Tb]`
- **AND** `signalTrace` was last loaded for window `[Tc, Td]`
- **WHEN** user pans back to `[Ta, Tb]`
- **THEN** component events and HTF render from display cache without chart-events refetch for chart layers
- **AND** Workbench restores lanes/diagnostics dense bundle for `[Ta, Tb]` from session cache without `/signal-trace` refetch
- **AND** lanes do not display `[Tc, Td]` trace data as ready

#### Scenario: Pan back with session miss fetches dense lanes bundle

- **GIVEN** display cache covers render window `[Ta, Tb]`
- **AND** session cache does not hold the dense bundle for `[Ta, Tb]` (evicted or never fetched)
- **WHEN** user pans back to `[Ta, Tb]`
- **THEN** component events and HTF render from display cache without refetch for chart layers
- **AND** Workbench requests `/signal-trace` for `[Ta, Tb]` for lanes/diagnostics only
- **AND** lanes do not display stale trace from another window as ready

### Requirement: Missing-range scheduling uses normalized trace display chunks

When trace display cache does not cover the committed render window, Workbench SHALL compute the missing range and plan one or more normalized trace display chunks. The planning/debug chunk identity (`traceDisplayChunkKey`) MUST include run, variant, context overlay ref, and normalized range bounds. Display cache storage and coverage remain interval-based.

The network request identity (`traceRequestKey` or chart-events equivalent) MUST remain the identity of the real display fetch request. When chart-events is enabled, `traceRequestKey` MUST match `/chart-events` query parameters. When disabled, it MUST match `/signal-trace` parameters as today.

If normalized bounds are actually sent over the network, the request key MUST include those normalized bounds. `traceDisplayChunkKey` MUST NOT replace the network request key.

Normalized chunks MUST be coarse enough to avoid many small recomputations. Active-pan prefetch MUST NOT be introduced in the first missing-range scheduling slice.

#### Scenario: Uncovered window schedules normalized chunk

- **GIVEN** a committed render window is not fully covered by trace display cache
- **WHEN** trace scheduling evaluates the window
- **THEN** Workbench computes missing coverage
- **AND** Workbench maps the missing coverage to normalized chunk bounds
- **AND** Workbench records those bounds in `traceDisplayChunkKey`
- **AND** the network request key matches the actual chart-events or signal-trace request parameters

#### Scenario: Frontend-only normalized chunk does not replace network key

- **GIVEN** Workbench plans a normalized display chunk for cache coverage
- **AND** Workbench sends chunk bounds to `/chart-events` or `/signal-trace`
- **WHEN** the network request is scheduled
- **THEN** `traceDisplayChunkKey` uses the normalized display chunk bounds
- **AND** the network request key uses the exact range sent over the network

#### Scenario: Active pan does not prefetch missing trace

- **GIVEN** the user is actively panning near a safe-zone boundary
- **AND** a pending shift points to an uncovered trace range
- **WHEN** trace scheduling evaluates active-pan state
- **THEN** Workbench does not start active-pan prefetch
- **AND** trace loading waits for committed window evaluation or post-commit idle prefetch
