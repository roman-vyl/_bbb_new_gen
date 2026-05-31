## Context

**Current pipeline** (frontend only):

```text
cachedBundle.candles (full report range, in memory)
        ↓
buildChartViewWindow() — one-shot sliceAroundTime(entry, limit=5000)
        ↓
WorkbenchContext → chartCandles, sliced EMA/aux, chartWindowKey
        ↓
ChartPanel series.setData(chartCandles) + applyChartViewport(center-on-trade)
        ↓
user pans → hits hard edge at bar 0 / bar 4999
```

Key files today:

- `frontend/src/features/chart/chartViewWindow.ts` — `CHART_RENDER_BAR_LIMIT = 5000`, `sliceAroundTime`, `buildChartViewWindow`
- `frontend/src/features/chart/chartViewport.ts` — `TRADE_FOCUS_VIEWPORT_BARS = 120`, `applyChartViewport`
- `frontend/src/shared/context/WorkbenchContext.tsx` — derives `chartView` from cached bundle + selected trade; builds `chartWindowKey` from `chartView.candles[0/last]`
- `frontend/src/features/chart/ChartPanel.tsx` — `setData` on `chartCandles` change; no `subscribeVisibleLogicalRangeChange`

Full candle bundle is already loaded once per run/variant (`marketDataCache`). Signal trace is keyed by `(run, variant, window first/last, context_overlay_ref)`. The bottleneck is the static 5000-bar render slice, not data availability.

**Constraints:**

- Lightweight Charts does not support unbounded pan inside one `setData` — we shift a buffered window instead (“moving the five”).
- No new BFF/API calls on pan; slices come from `cachedBundle.candles`.
- HTF context overlays and component events depend on `chartWindowKey` — window shifts must update keys and re-slice overlays/markers consistently.
- Layer boundary: frontend only.

## Goals / Non-Goals

**Goals:**

- Pan across the full cached report range with imperceptible window shifts (buffer + safe zones).
- On trade select: avoid redundant `setData` when entry is already in the current window safe zone; otherwise rebuild window centered on entry.
- Single **pure** module owns window **indices and shift algorithm**; WorkbenchContext applies slices to candles/overlays/events.
- **One source of truth:** WorkbenchContext owns render-window state; ChartPanel only detects pan boundaries and reports them.
- Default render window **50 000** bars, safe zone **10 000** each side; visible trade focus **~400** bars (up from 120).
- Preserve visible logical range after window shift so the chart does not jump.

**Non-Goals:**

- Fetching candles beyond cached report range.
- Virtualized rendering, Web Workers, or decimation beyond choosing window size.
- Changing signal-trace API or backend trace generation.
- Infinite scroll with one permanent `setData` (not supported by the chart library).

## Decisions

### 1. New module: `chartDataWindowManager.ts`

Pure TypeScript state machine (no React, **no candle array reference**). Holds only indices, sizes, and algorithms:

| Field | Meaning |
|-------|---------|
| `fullLength` | `cachedBundle.candles.length` (number only — updated on run/variant reset) |
| `windowStartIndex` | Inclusive index into full array |
| `windowEndIndex` | Exclusive index |
| `renderWindowSize` | Target bars in window (default 50 000) |
| `safeZoneSize` | Bars from each edge before shift (default 10 000) |

**Why no `fullCandles` reference:** avoids stale-array bugs when React lifecycle swaps `cachedBundle` after run/variant change. Slice helpers receive the current array as an argument from WorkbenchContext (always the live `cachedBundle.candles`).

**Public API:**

```typescript
createChartDataWindowManager(config): ChartDataWindowManager

// Lifecycle (indices only)
reset(fullLength: number): void
setFullLength(fullLength: number): void

// Initial / trade focus — mutates window indices, returns new bounds or null if unchanged
buildWindowAroundIndex(entryIndex: number): WindowBounds | null
shouldRebuildForTrade(entryIndex: number): boolean

// Pan-driven — mutates window indices when shift needed, else null
maybeShiftWindowForVisibleRange(visible: LogicalRange): WindowBounds | null

// Pure slice helpers — take data as arguments, use manager.getWindowIndices()
sliceCandles(candles: readonly ChartBar[]): ChartBar[]
sliceEmaOverlays(overlays: readonly ChartEmaOverlay[], candles: readonly ChartBar[]): ChartEmaOverlay[]
sliceAuxOverlays(overlays: readonly ChartAuxEmaOverlay[], candles: readonly ChartBar[]): ChartAuxEmaOverlay[]
sliceComponentEvents(events: readonly ComponentEvent[], candles: readonly ChartBar[]): ComponentEvent[]
```

`WindowBounds` = `{ windowStartIndex, windowEndIndex }` only. No sliced data inside the manager.

**Viewport restore** lives in `chartViewport.ts` (chart-specific), not in the manager.

**Window placement algorithm** (`buildWindowAroundIndex`):

1. `windowSize = min(renderWindowSize, fullCandlesCount)`
2. Center entry index in window (same math as current `sliceAroundTime`)
3. Clamp to `[0, fullCandlesCount]`

**Shift algorithm** (`maybeShiftWindowForVisibleRange`):

- Let `visibleFrom`, `visibleTo` be logical indices **within current window** (0-based relative to window start).
- If `visibleTo > (windowEndIndex - windowStartIndex) - safeZoneSize` → shift right: new start so viewport sits ~centered in safe zone.
- If `visibleFrom < safeZoneSize` → shift left symmetrically.
- Clamp window to full array bounds; no-op if already at global start/end and still in dead zone.
- Debounce: ignore shifts while a programmatic viewport apply is in flight (`isApplyingViewport` ref in ChartPanel).

**Alternative considered:** Keep `buildChartViewWindow` and add pan handler only in ChartPanel. **Rejected** — window state, trade-select logic, and overlay slicing would split across three files; harder to test and keep markers aligned.

### 2. Constants (exported from manager or `chartViewWindow.ts`)

| Constant | Value | Notes |
|----------|-------|-------|
| `CHART_RENDER_WINDOW_SIZE` | `50_000` | Replaces `CHART_RENDER_BAR_LIMIT = 5000` |
| `CHART_RENDER_SAFE_ZONE` | `10_000` | Left/right buffer before shift |
| `TRADE_FOCUS_VIEWPORT_BARS` | `400` | Visible bars around entry (was 120) |

Env override optional later (`import.meta.env`); not in v1 scope — use constants only.

**Alternative considered:** 20 000 default for perf. **Rejected for now** — user explicitly prefers 50 k for 5m UX (~173 days); we can tune down if profiling shows jank.

### 3. Ownership: WorkbenchContext is the single source of truth

**WorkbenchContext owns:**

- `chartDataWindowManager` instance (indices only)
- Derived `chartCandles`, sliced EMA/aux, `chartDisplayComponentEvents`
- `chartWindowKey` → signal trace loading
- Handler `shiftRenderWindowForVisibleRange(visibleLogicalRange)` — the only place that mutates window indices and re-slices data

**ChartPanel does NOT slice candles, EMA, or events.** It only:

1. Renders what Context provides via `setData` (existing effect)
2. Subscribes to `subscribeVisibleLogicalRangeChange`
3. On boundary approach → calls Context callback with the visible logical range

```typescript
// WorkbenchContext exposes:
onRenderWindowShiftRequest: (visible: LogicalRange, anchorTimeSec: number) => void

// ChartPanel subscription (detection only):
chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
  if (!range || isApplyingViewport) return;
  if (!isNearWindowBoundary(range)) return; // optional pre-check in panel
  const anchorTimeSec = resolveAnchorTimeFromVisibleRange(range, chartCandles);
  onRenderWindowShiftRequest(range, anchorTimeSec);
});
```

**Context handler flow** (`shiftRenderWindowForVisibleRange`):

1. `bounds = manager.maybeShiftWindowForVisibleRange(visible)` → if `null`, return (no-op)
2. `chartCandles = manager.sliceCandles(cachedBundle.candles)`
3. Re-slice overlays, component events (same window bounds)
4. Update `chartWindowKey` (may trigger trace reload)
5. Set `pendingViewportRestore = { anchorTimeSec, previousVisible }` for ChartPanel to apply after next `setData`

This prevents split-brain: ChartPanel never calls `setData` with self-sliced data; Context and manager indices always agree.

Replace direct `buildChartViewWindow` output:

1. On `cachedBundle` / variant / run change → `manager.reset(cachedBundle.candles.length)` → initial tail window → slice into state.
2. On `selectedTradeEntryTimeMs` change → `entryIndex = findBarIndexAtOrBefore(...)`:
   - If `!manager.shouldRebuildForTrade(entryIndex)` → skip re-slice; ChartPanel only recenters viewport.
   - Else → `manager.buildWindowAroundIndex(entryIndex)` → re-slice all layers in Context.
3. `chartWindowKey` uses **current render window** `[firstTime, lastTime]` — updates on pan shifts.

**Alternative considered:** ChartPanel owns manager and calls `setData` directly on shift. **Rejected** — duplicates window state vs Context `chartWindowKey`/trace/overlays; high split-brain risk.

### 4. Integration: ChartPanel (detection + viewport restore only)

1. Subscribe to visible range change; debounce + `isApplyingViewport` guard.
2. Near boundary → `onRenderWindowShiftRequest(range, anchorTimeSec)` — **no slicing in panel**.
3. After Context updates `chartCandles` and effect runs `setData`, apply pending viewport restore:
   ```typescript
   restoreVisibleRangeAfterWindowShift(chart, {
     anchorTimeSec,
     newCandles: chartCandles,
     previousVisible: capturedRange,
   });
   ```
4. `chartDataKey` / `viewportApplyKey` distinguish trade recenter (same window) vs window shift (new first/last).
5. Unsubscribe on chart destroy.

**Viewport restore (`chartViewport.ts`) — time-based primary, explicit fallbacks:**

Primary path:

1. Capture `anchorTimeSec` from old window at visible center (or `visible.from`) **before** Context shifts.
2. After `setData`, find `anchorIndex = findBarIndexAtOrBefore(newCandles, anchorTimeSec)`.
3. Recompute visible logical range centered on `anchorIndex` (or map `previousVisible` width around anchor).

Fallbacks (required — edges of full array produce off-by-one without them):

| Condition | Fallback |
|-----------|----------|
| `anchorTimeSec` not found in new window (gap / edge) | Use nearest bar: `findBarIndexAtOrBefore` clamps to `[0, length-1]` |
| New window flush against global start (`windowStartIndex === 0`) | Clamp visible `from` to `0`; preserve visible width |
| New window flush against global end | Clamp visible `to` to `newCandles.length`; preserve visible width |
| Restored range invalid (empty, NaN, inverted) | `timeScale.fitContent()` as last resort |

Unit-test all three edge cases in `chartViewport.test.ts`.

### 5. Markers and events

All filtering uses **current render window** time bounds (`candles[0].time` … `candles[last].time`):

- `buildTradeMarkersForView(trades, selectedTradeId, chartCandles)` — already time-filters; keep as-is but ensure `chartCandles` is render window.
- `filterComponentEventsToTimeRange` — already used in WorkbenchContext; window shifts update `chartView.candles` so events follow automatically.
- EMA/aux: existing `sliceOverlaysToCandleWindow` / `sliceAuxOverlaysToCandleWindow` on manager output.

**Critical:** Do not slice markers/events against a frozen trade-centric 5000-bar slice after pan.

### 6. Signal trace interaction

Pan-driven window shift changes `chartWindowKey` → existing effect in WorkbenchContext triggers trace reload for new range. HTF stale/freeze behavior unchanged (see modified HTF spec). No backend changes.

Trade select **inside** current window without rebuild → `chartWindowKey` unchanged → no trace reload.

### 7. Testing strategy

- **Unit:** `chartDataWindowManager.test.ts` — shift left/right at boundaries, `shouldRebuildForTrade`, clamp at array edges, restore logical range math.
- **Unit:** Update `chartViewWindow.test.ts` for new constants / delegation.
- **Manual:** Workbench with long run (>50k bars if available), select distant trades, pan both directions, verify markers/HTF lines track window (tasks.md checklist).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 50k `setData` causes frame jank | Measure in dev; fallback constant 20k; shift only near safe zone (infrequent) |
| Visible range restore off-by-one at window edge | Time anchor + clamp fallbacks at global start/end; `fitContent` last resort |
| Stale `fullCandles` reference after run switch | Manager stores `fullLength` only; slices always pass live `cachedBundle.candles` |
| Split-brain Context vs ChartPanel window state | ChartPanel callbacks only; Context sole owner of shift + re-slice |
| Feedback loop: range change → shift → setData → range change | `isApplyingViewport` guard + debounce (~100ms) on pan handler |
| Signal trace reload storm on continuous pan | Shift only when crossing safe zone (~10k bars from edge), not every pixel |
| `chartDataKey` triggers full series rebuild on small pans inside safe zone | Key uses window first/last — unchanged during in-zone pan (desired) |
| Trace reload lag after pan — stale HTF/events | Existing stale banners; frozen slices until `traceMatchesWindow` |

## Migration Plan

1. Ship behind pure refactor (no feature flag) — behavior upgrade is backward-compatible for short runs (<50k bars = full array).
2. Deploy frontend only; no API migration.
3. Rollback: revert frontend commit; old 5000-bar slice behavior returns.

## Resolved clarifications (pre-implementation)

1. **Manager is index-only** — no `fullCandles` reference; `setFullLength(n)` + `sliceCandles(candles, window)` pattern.
2. **Context owns shift; ChartPanel detects** — `onRenderWindowShiftRequest(range)` callback; no slicing/`setData` orchestration in panel.
3. **Viewport restore** — time anchor primary; nearest-bar + edge clamp + `fitContent` fallback.

## Open Questions

- **Performance profiling:** Confirm 50k default on target machines; adjust constants if needed before archive.
- **Tail mode (no trade selected):** Keep current tail slice or also use sliding window when user pans in tail view? **Proposed:** tail uses same manager with window anchored at end until user pans.
- **chartDataKey and selectedTradeId:** Window shift during pan should not reset trade focus viewport — ensure key does not include spurious trade fields that force viewport re-apply on shift-only updates.
