## 1. Window manager module

- [x] 1.1 Add `chartDataWindowManager.ts` — index-only state (`fullLength`, `windowStartIndex`, `windowEndIndex`, sizes); **no candle array reference**
- [x] 1.2 Implement `reset`/`setFullLength`, `buildWindowAroundIndex`, `shouldRebuildForTrade`, `maybeShiftWindowForVisibleRange`; pure slice helpers take `candles`/`overlays`/`events` as arguments
- [x] 1.3 Implement `restoreVisibleRangeAfterWindowShift` in `chartViewport.ts` — time anchor primary; nearest-bar, global-edge clamp, `fitContent` fallbacks
- [x] 1.4 Add `chartDataWindowManager.test.ts` (shift/no-op/clamp) + `chartViewport.test.ts` cases for restore fallbacks at array edges

## 2. WorkbenchContext integration

- [x] 2.1 Replace one-shot `buildChartViewWindow` usage with manager instance keyed on `cachedBundle` / run / variant reset
- [x] 2.2 On trade select: skip re-slice when entry is in-window and outside safe zone; otherwise `buildWindowAroundIndex` and update `chartCandles` / overlays
- [x] 2.3 Ensure `chartWindowKey`, `chartDisplayComponentEvents`, and aux overlay slicing all derive from current render window bounds
- [x] 2.4 Implement `shiftRenderWindowForVisibleRange` in Context — sole owner of index mutation + re-slice (`chartCandles`, overlays, events, `chartWindowKey`); expose `onRenderWindowShiftRequest` to ChartPanel
- [x] 2.5 Ensure WorkbenchContext is the single owner of renderWindow state; ChartPanel may request shift but must not independently slice candles/overlays/events
- [x] 2.6 Bump `TRADE_FOCUS_VIEWPORT_BARS` to ~400; set `pendingViewportRestore` when window shifts

## 3. ChartPanel (detection + viewport restore only)

- [x] 3.1 Subscribe to `subscribeVisibleLogicalRangeChange` with `isApplyingViewport` guard and debounce; on boundary → call `onRenderWindowShiftRequest(range, anchorTimeSec)` — **no slicing in panel**
- [x] 3.2 After Context-driven `setData`: apply `pendingViewportRestore` via `restoreVisibleRangeAfterWindowShift`
- [x] 3.3 Adjust `chartDataKey` / `viewportApplyKey` so in-zone trade recenter does not force full rebuild; window shift updates key correctly
- [x] 3.4 Unsubscribe pan handler in chart cleanup effect
- [x] 3.5 Guard against feedback loop after `setData` / `restoreVisibleRange`: range-change events caused by programmatic restore must not immediately trigger another shift (`isApplyingViewport` or equivalent); add unit/acceptance test that one boundary crossing yields at most one shift

## 4. chartViewWindow cleanup

- [x] 4.1 Deprecate or thin `CHART_RENDER_BAR_LIMIT = 5000` — delegate to manager constants; keep `findBarIndexAtOrBefore` / slice helpers used by manager
- [x] 4.2 Update `chartViewWindow.test.ts` and `chartDataKey.test.ts` for new window sizes and trade-skip behavior

## 5. Manual verification

- [ ] 5.1 Workbench: load run with full report range cached (`Full report range cached` banner); select trade — viewport centers ~400 bars around entry
- [ ] 5.2 Pan left and right past safe zone — candles continue, no hard stop at old 5000 edge; no visible jump on window shift
- [ ] 5.3 Select adjacent trade inside safe zone — viewport moves, no flicker from unnecessary `setData`; select distant trade — window rebuilds
- [ ] 5.4 Component event markers and trade markers track panned window (events appear/disappear with window bounds)
- [ ] 5.5 **Verify HTF context EMA overlays** (`workbench-chart-htf-context-overlays`): variant with `strategy.contexts.htf_1` — three dashed HTF lines visible; pan shifts window — lines stay or stale banner then update; no permanent disappearance

## 6. Unit tests (CI)

- [x] 6.1 Run `npm test` in `frontend/` for new and updated chart window tests
