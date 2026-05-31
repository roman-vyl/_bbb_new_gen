## Why

Today the Workbench Chart loads a fixed ~5000-bar slice around a selected trade entry (`buildChartViewWindow` / `CHART_RENDER_BAR_LIMIT`) and passes it to Lightweight Charts via `setData`. Panning left or right hits the edge of that slice with no way to continue — the user is stuck inside a “dead frame” even though the full report candle bundle is already cached in memory (`cachedBundle.candles`). This blocks realistic trade review when adjacent trades or context are months apart on 5m data.

## What Changes

- Introduce a **`chartDataWindowManager`** module that owns the sliding render window over the full in-memory candle array — no new API fetches on pan.
- Increase default **render window size** from 5 000 to **50 000** bars (configurable fallback: 20 000 / 100 000) with **safe zones** (~10 000 bars each side) so window shifts happen before the user reaches the hard edge.
- On **trade selection**: if entry index is already inside the current window and not near a safe-zone edge, only adjust visible range; otherwise rebuild window around entry and `setData`.
- On **manual pan** (`subscribeVisibleLogicalRangeChange`): when visible logical range approaches window edge, shift window from cache, `setData` with new slice, and **restore visible logical range** so the screen does not jump.
- Slice **all chart overlays consistently** to the current render window: candles, anchor EMA, aux/HTF EMA, trade markers, and component events — not to the old per-trade fixed slice.
- Preserve existing market-cache and signal-trace loading contracts; window shifts are pure frontend slicing over data already loaded.

## Capabilities

### New Capabilities

- `workbench-chart-sliding-window`: Sliding render-window manager over cached full candle bundle; pan-driven window shifts; trade-focus viewport without unnecessary `setData`; visible-range preservation after window rebuild.

### Modified Capabilities

- `workbench-chart-component-event-markers`: Component events and trade markers MUST be filtered to the **current render window** time range, not a stale trade-centric slice.
- `workbench-chart-htf-context-overlays`: HTF overlay slice and `chartWindowKey` for trace alignment MUST track the **current render window** bounds so stale/frozen overlay behavior remains correct when the window shifts on pan.

## Impact

**Layer:** `frontend/` only — no BFF, research, or data_engine changes.

**Modules likely touched:**

- New: `frontend/src/features/chart/chartDataWindowManager.ts` (+ unit tests)
- Refactor: `frontend/src/features/chart/chartViewWindow.ts` — delegate slicing to window manager or replace static one-shot slice
- Integrate: `frontend/src/features/chart/ChartPanel.tsx` — subscribe to visible range, trigger window shifts, preserve viewport
- Integrate: `frontend/src/shared/context/WorkbenchContext.tsx` — expose render-window state; align `chartWindowKey`, marker/event slicing
- Adjust: `frontend/src/features/chart/chartViewport.ts`, `chartDataKey.ts` — trade-focus bars (~300–500 visible), window-shift keys
- Tests: extend `chartViewWindow.test.ts`, new manager tests; manual Workbench verification per `.cursor/rules/workbench-chart-screenshots.mdc`

**Reference docs:** `docs/frontend/implementation_plan.md` (Phase 5 chart), `docs/frontend/frontend_master_plan_alternative_chart_composer_reports.md`

**Non-goals:**

- Infinite pan inside a single `setData` call (Lightweight Charts limitation — we use buffered window shifts instead)
- Loading candles beyond the already-cached report range
- Virtualized / WebGL chart rendering or performance work beyond choosing render-window size constants
- Changing signal-trace API shape or backend trace generation
