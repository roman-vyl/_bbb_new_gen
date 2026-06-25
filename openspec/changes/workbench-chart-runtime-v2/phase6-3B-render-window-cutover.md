# Phase 6.3B — Render-Window Owner Cutover

**Status:** Not started (OpenSpec template — fill during implementation)

**Phase debug tag:** `phase: 6.3B`, `domain: render_window`

## 1. Owner transfer

| Item | Value |
|---|---|
| Old owner | `WorkbenchContext` — `chartRuntimeRef.renderWindow`, render-window init/shift effects |
| New owner | `renderWindowRuntime.ts`, `chartWindowRuntime.ts` |
| Already v2 | final model/adapter (6.3A) |
| Remains old | market/load/cache, viewport, trace/events, aux overlays |

## 2. Transfer scope

- Input: full/focus market bundle from old market owner (candles, EMA, foundation key)
- Output: render-window bounds, shift seq, sliced candles/overlays for model path
- Market fetch: forbidden — old owner only

## 3. Forbidden

- Runtime v2 market fetch or cache writes
- Viewport command ownership
- Trace ownership
- Pan/coverage expansion ownership

## 4. Tests

- Render-window parity vs old pipeline for tail and trade-centered init
- Foundation key unchanged → no render re-init (reference stability)
- Static guard: only `domain: render_window` newly v2 among display domains

## 5. Browser evidence

- [ ] Cold Chart open — non-empty render window slice
- [ ] Variant/report switch — chart not reset to empty
- [ ] Unchanged foundation key — no repeated render re-init
- [ ] Debug — `runtime_v2_production` for render_window only (plus model from 6.3A)

## 6. STOP FOR REVIEW

Do not start 6.3C until approved.
