# Phase 6.3A — Final Chart Model + Adapter Cutover

**Status:** Not started (OpenSpec template — fill during implementation)

**Phase debug tag:** `phase: 6.3A`, `domain: model`

## 1. Owner transfer

| Item | Value |
|---|---|
| Old owner | `WorkbenchContext` — `buildChartViewModel()`, `chartValue` memo, legacy derived chart fields |
| New owner | `chartModelRuntime.ts` + `runtimeOutputAdapter.ts` |
| Remains old | market/load/cache, render-window, viewport, trace/events, aux overlays |

## 2. Old fields consumed (input to runtime v2 / adapter)

_To be filled with exact `WorkbenchChartState` / provider memo field names and types at cutover time._

| Field | Source owner | Notes |
|---|---|---|
| `chartViewModel` (candidate slices) | old provider memos | Adapter receives pre-sliced data from old pipeline |
| `chartCandles`, `chartEmaOverlays`, … | old provider | Compatibility derivation inputs |
| `marketCandlesCount`, `candlesSource`, … | old market owner | Status/metadata passthrough |
| TBD | | |

## 3. Adapter fields produced (output to ChartPanel)

_To be filled with exact `runtimeOutputAdapter` mapping._

| Output field | Derived from | Notes |
|---|---|---|
| `chartViewModel` | `ChartRuntimeOutput.chartViewModel` | Authoritative for renderer |
| Legacy compatibility fields | adapter-only derivation from runtime output + provider glue | No independent recompute |
| TBD | | |

## 4. Explicitly forbidden

- Runtime v2 market/EMA fetch, cache writes, render-window, viewport, trace ownership
- Adapter fallback to old computed values when v2 path is active for model domain
- `chartRuntimeV2ProductionEnabled` true for all domains

## 5. Tests

- Adapter field derivation contract tests (extend Phase 6.1 guards)
- Model output non-empty when old pipeline market data is ready (harness or integration)
- Static guard: only `domain: model` has `owner: runtime_v2_production`

## 6. Browser evidence

- [ ] Cold Chart open — candles visible
- [ ] `chart.setData.candles` — `barCount > 0`
- [ ] Anchor EMA overlays visible
- [ ] No repeated empty `chart.setData`
- [ ] Debug snapshot — old owner for market/render/viewport/trace/aux; v2 for model only

## 7. STOP FOR REVIEW

Do not start 6.3B until this report is complete and reviewed.
