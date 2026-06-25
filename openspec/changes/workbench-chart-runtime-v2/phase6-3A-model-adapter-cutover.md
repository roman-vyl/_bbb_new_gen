# Phase 6.3A — Final Chart Model + Adapter Cutover

**Status:** Not started — **blocked on 6.3-debug telemetry gate**

**Phase debug tag:** `phase: 6.3A`, `domain: model` → `runtime_v2_production`

## Prerequisite

- [ ] `phase6-3-debug-telemetry.md` browser gate passed
- [ ] Field map below reviewed and frozen — **no implementation until this section is approved**

## 1. Owner transfer

| Item | Value |
|---|---|
| Old owner | `WorkbenchContext` — `buildChartViewModel()` memo (~L2095), `chartValue.chartViewModel` |
| New owner | `chartModelRuntime.ts` → `ChartRuntimeOutput.chartViewModel` → `runtimeOutputAdapter.ts` / `deriveLegacyWorkbenchChartFieldsFromRuntime` (model slice only) |
| Remains old | market/load/cache, render-window (`chartView` slice), viewport, trace/events, aux overlays |

## 2. Exact field map (frozen for implementation)

Legend:

- **Source owner** — who computes the value during 6.3A
- **Runtime input** — field passed into v2 model bridge (not full `ChartRuntimeInput` lifecycle)
- **Adapter output** — `WorkbenchChartState` field exposed to `ChartPanel`
- **ChartPanel** — how renderer consumes it

### 2.1 Old fields → runtime model input (read-only passthrough from old pipeline)

These are produced by old owners; v2 `chartModelRuntime` MUST NOT re-fetch or re-slice them in 6.3A.

| Old provider field / memo | Source owner (6.3A) | Runtime model input field | Notes |
|---|---|---|---|
| `chartView.candles` | old `render_window` | `chartWindowParts.candles` | From `chartWindowSlice` / `chartView` memo |
| `chartView.emaOverlays` | old `render_window` | `chartWindowParts.emaOverlays` | Anchor stack EMA |
| `chartView.auxEmaOverlays` | old `render_window` | `chartWindowParts.auxEmaOverlays` | BFF aux series in window |
| `chartDisplayAuxEmaOverlays` | old `aux_overlay` | `displayAuxEmaOverlays` | HTF/display aux for render window |
| `chartDisplayComponentEvents` | old `trace` | `chartWindowParts.componentEvents` | Sliced component events |
| `htfAuxEmaOverlayStale` | old `aux_overlay` | `auxOverlay.htfAuxEmaOverlayStale` | Stale flag input to `buildChartViewModel` |
| `componentEventsStale` | old `trace` | derived from `traceDisplay.traceDisplayState` | Fed into model build |
| `traceDisplayState.status` | old `trace` | `traceDisplay.traceDisplayState.status` | `traceDisplayStatus` on model |
| `traceDisplayState.missingRange` | old `trace` | `traceDisplay.traceDisplayState.missingRange` | `traceDisplayMissingRange` on model |
| `chartView.mode` | old `render_window` | `viewMode` | |
| `chartView.centerTimeSec` | old `render_window` | `centerTimeSec` | |
| `chartView.firstTimeSec` | old `render_window` | `firstTimeSec` | |
| `chartView.lastTimeSec` | old `render_window` | `lastTimeSec` | |
| `chartView.count` | old `render_window` | `count` | |

Bridge function (name TBD in code): `buildChartModelRuntimeInputFromOldPipeline(...)` — **passthrough only**, no network, no cache writes.

### 2.2 Runtime output → adapter → ChartPanel (6.3A scope)

| Adapter output field | Runtime source | ChartPanel consumer | 6.3A owner |
|---|---|---|---|
| `chartViewModel` | `ChartRuntimeOutput.chartViewModel` | Primary renderer input (`useWorkbenchChart().chartViewModel`) | **v2** |
| `chartCandles` | `chartViewModel.candles` | Legacy; ChartPanel reads via `chartViewModel.candles` | **v2** (derived) |
| `chartEmaOverlays` | `chartViewModel.emaOverlays` | EMA `setData` | **v2** (derived) |
| `chartAuxEmaOverlays` | `chartViewModel.auxEmaOverlays` | Aux series | **v2** (derived) |
| `chartDisplayAuxEmaOverlays` | `chartViewModel.displayAuxEmaOverlays` | HTF dashed lines | **v2** (derived) |
| `chartDisplayComponentEvents` | `chartViewModel.componentEvents` | Event markers | **v2** (derived) |
| `chartViewMode` | `chartViewModel.viewMode` | View metadata | **v2** (derived) |
| `chartViewCenterTimeSec` | `chartViewModel.centerTimeSec` | View metadata | **v2** (derived) |
| `chartViewFirstTimeSec` | `chartViewModel.firstTimeSec` | View metadata | **v2** (derived) |
| `chartViewLastTimeSec` | `chartViewModel.lastTimeSec` | View metadata | **v2** (derived) |
| `chartViewCount` | `chartViewModel.count` | Hints / diagnostics | **v2** (derived) |
| `htfAuxEmaOverlayStale` | `chartViewModel.htfOverlayStale` | Stale banner | **v2** (derived from model; input still old aux) |
| `componentEventsStale` | `chartViewModel.componentEventsStale` | Stale banner | **v2** (derived; input still old trace) |

Derivation contract: `deriveLegacyWorkbenchChartFieldsFromRuntime()` in `runtimeOutputAdapter.contract.ts` — **model fields only in 6.3A**; other keys in that function remain wired from old provider until their slice.

### 2.3 Fields that remain old provider passthrough in 6.3A (NOT adapter-derived from v2)

| `WorkbenchChartState` field | Source owner (6.3A) | ChartPanel use |
|---|---|---|
| `marketLoadStatus`, `marketError` | old `market` | Loading banners |
| `candlesSource`, `marketCandlesCount`, `fullCandleRange` | old `market` | Hints, range display |
| `displayApplyRevision`, `renderWindowShiftSeq` | old `render_window` | Series refresh timing |
| `signalTrace`, `signalTraceStatus`, `signalTraceError` | old `trace` | Legacy trace (non-lanes) |
| `lanesSignalTrace`, `lanesSignalTraceStatus`, `lanesSignalTraceError` | old `trace` | Lanes panel |
| `dispatchChartInteraction` | old `render_window` + viewport glue | Interaction bridge |
| `chartViewportCommand`, `chartViewportCommandSeq`, ack/settle callbacks | old `viewport` | Viewport execution |
| `contextOverlayRef*`, marker preference toggles | provider glue | UI state |
| `selectedTradeId`, `selectTrade`, `selectedVariant`, `selectedBarTimeSec`, `selectBar` | provider glue | Selection |
| `chartTimeframe`, `reportTimeframe`, `timeframeMismatch`, `chartTradeFocusWarning` | provider glue | Metadata |

### 2.4 Forbidden in 6.3A adapter

- Reading `chartViewModel` from old `buildChartViewModel()` memo when v2 model owner is active
- `?? chartView` / `legacyPipeline` / fallback to old model on empty v2 output
- Deriving `marketLoadStatus`, viewport commands, trace lanes, or render revisions from `ChartRuntimeOutput` until those slices land
- Independent recompute of any field in §2.2 outside `chartModelRuntime` + single derivation path

## 3. Implementation order (enforced)

1. Update `chartRuntimeCutoverConfig` → `phase: 6.3A`, `domainOwners.model: runtime_v2_production`
2. Wire old-pipeline passthrough into `chartModelRuntime` (§2.1)
3. Switch `chartValue.chartViewModel` and §2.2 legacy fields to adapter derivation
4. Verify §2.3 fields still come from old memos unchanged
5. Browser: `domainOwners` shows v2 for `model` only; console marks carry `owner`/`domain`/`phase`

## 4. Tests

- Extend `runtimeOutputAdapter.contract.test.ts`: 6.3A slice — model fields from runtime; §2.3 fields not from `deriveLegacyWorkbenchChartFieldsFromRuntime` for non-transferred domains
- Static guard: `WorkbenchContext` does not call `buildChartViewModel` when model owner is v2
- `domainOwners` snapshot test for 6.3A config

## 5. Browser evidence

- [ ] Cold Chart open — candles visible; `chart.setData.candles` `barCount > 0`
- [ ] Anchor EMA overlays visible
- [ ] No repeated empty `chart.setData`
- [ ] `wb.cutover.domain_owners`: `model` = `runtime_v2_production`; all other domains = `old_production`; `phase: 6.3A`
- [ ] `chart.setData.candles` mark: `owner: runtime_v2_production`, `domain: model`
- [ ] `wb.trace_display.apply_current_window`: `owner: old_production`, `domain: trace`

## 6. STOP FOR REVIEW

Do not start 6.3B until this report is complete, field map unchanged, and browser gate passed.
