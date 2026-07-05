# Phase 6.3E — Aux/HTF Overlay Owner Cutover

**Status:** Not started (OpenSpec template — fill during implementation)

**Phase debug tag:** `phase: 6.3E`, `domain: aux_overlay`

## 1. Owner transfer

| Item | Value |
|---|---|
| Old owner | `WorkbenchContext` — aux EMA state/effects, HTF fallback/frozen refs |
| New owner | `auxOverlayRuntime.ts` |
| Already v2 | model/adapter, render-window, viewport, trace/events |
| Remains old | market/load/cache; context overlay **selector** stays provider glue |

## 2. Transfer scope

- Consume `effectiveContextOverlayRef` and available overlay data from inputs
- Emit `displayAuxEmaOverlays`, stale flags, HTF dashed lines from trace path
- BFF aux vs HTF trace remain distinct sources (`workbench-chart-htf-context-overlays`)

## 3. Forbidden

- Context selector UI ownership transfer
- Market fetch/cache ownership transfer
- Clearing price chart when aux overlay stale/missing

## 4. Tests

- HTF context EMA overlay verification on variant with `strategy.contexts`
- Stale aux does not empty `chartViewModel.candles`
- Context overlay switch invalidates trace/HTF without market refetch

## 5. Browser evidence

- [ ] Context overlay switch works
- [ ] HTF overlay visible when selected
- [ ] Stale/missing aux — candles not blanked
- [ ] Debug — `runtime_v2_production` for aux_overlay

## 6. STOP FOR REVIEW

Do not start 6.3F until approved.
