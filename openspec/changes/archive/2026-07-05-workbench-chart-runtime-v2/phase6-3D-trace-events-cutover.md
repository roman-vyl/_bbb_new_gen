# Phase 6.3D — Trace/Events Display Owner Cutover

**Status:** Not started (OpenSpec template — fill during implementation)

**Phase debug tag:** `phase: 6.3D`, `domain: trace`

## 1. Owner transfer

| Item | Value |
|---|---|
| Old owner | `WorkbenchContext` — trace effect, display cache refs, component events state |
| New owner | `traceDisplayRuntime.ts`, `chartEventsRuntime.ts`, trace display output path |
| Already v2 | model/adapter, render-window, viewport |
| Remains old | market/load/cache, aux overlays, pan/coverage expansion |

## 2. Transfer scope

- Trace/events display lifecycle after market + render window ready
- Component events and markers output to chart model
- Chart-events enabled and dense fallback paths
- No-op on repeated apply for same window/cache/status key

## 3. Forbidden

- Repeated `apply_current_window` on unchanged input
- Dense trace fetch before Chart activation gate
- Chart-events fallback loop
- Rollback of visible chart data on trace failure
- Market owner transfer

## 4. Tests

- Chart-events enabled/disabled path tests
- Trace failure does not empty candles (integration/harness)
- Display apply idempotency for stable keys

## 5. Browser evidence

- [ ] Component markers/events visible
- [ ] Chart-events enabled path
- [ ] Chart-events disabled / dense fallback path
- [ ] Trace failure — candles remain
- [ ] No repeated trace apply churn
- [ ] Debug — `runtime_v2_production` for trace

## 6. STOP FOR REVIEW

Do not start 6.3E until approved.
