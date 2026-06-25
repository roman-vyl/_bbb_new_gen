# Phase 6.3C — Viewport Command Owner Cutover

**Status:** Not started (OpenSpec template — fill during implementation)

**Phase debug tag:** `phase: 6.3C`, `domain: viewport`

## 1. Owner transfer

| Item | Value |
|---|---|
| Old owner | `WorkbenchContext` — viewport command state, seq, ack/cancel/settle callbacks |
| New owner | `viewportRuntime.ts` |
| Already v2 | model/adapter, render-window |
| Remains old | market/load/cache, trace/events, aux overlays, pan/coverage expansion |

## 2. Transfer scope

- Cold initial view commands
- Selected trade focus (`focusTrade`)
- Next/prev trade focus navigation
- Duplicate command dedupe
- Command ack/settle protocol with `ChartPanel`

## 3. Forbidden

- Runtime v2 market fetch
- Pan-driven coverage expansion
- Fallback to tail when selected trade has entry time
- Duplicate seq bump for identical command

## 4. Tests

- Viewport command stream single-owner tests
- Trade focus / restore-after-swap parity
- Duplicate `selectTrade` no re-emit

## 5. Browser evidence

- [ ] Reports → Chart focuses selected trade
- [ ] Next/prev trade buttons move viewport
- [ ] Distant trade — no silent tail degradation
- [ ] Duplicate trade click — no identical command re-emit
- [ ] Wheel/pointer clears programmatic focus intent
- [ ] Debug — `runtime_v2_production` for viewport

## 6. STOP FOR REVIEW

Do not start 6.3D until approved.
