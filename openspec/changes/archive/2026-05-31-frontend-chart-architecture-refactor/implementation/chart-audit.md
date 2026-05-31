# Chart runtime audit (post-cutover, 2026-05)

Read-only audit of viewport / setData / trace-fetch ownership. No UX changes.

## Viewport focus and restore

| Check | Result | Evidence |
|-------|--------|----------|
| No direct `focusTrade` / `restoreAfterWindowSwap` outside controller path | **PASS** | Only `viewportController.ts` emits policy; `executeViewportCommand.ts` applies; `ChartPanel` executes `chartViewportCommand` from shell |
| Workbench does not call LWC viewport APIs | **PASS** | `emitChartViewportCommand` only; no `setVisibleRange` / `fitContent` in `WorkbenchContext` |
| Trade focus gated on pan | **PASS** | `viewportController.dispatch(trade_selected)` → `noViewportChange` when `userPanning` |

## Window-swap restore

| Check | Result | Evidence |
|-------|--------|----------|
| `restoreAfterWindowSwap` never uses `fitContent` | **PASS** | `restoreVisibleRangeByTimeAnchor` in `chartViewport.ts`; tests in `chartViewport.test.ts` |
| `swapTransactionId` assigned at commit | **PASS** | `WorkbenchContext` `onWindowSwapCommitted` → `{ ...viewportCmd, swapTransactionId }` |
| Stale restore cancelled on new pointerdown | **PASS** | `isWindowSwapTransactionCancelled` in `ChartPanel` before execute |

## setData vs active pan

| Check | Result | Evidence |
|-------|--------|----------|
| No setData from active drag boundary | **PASS** | Pan → `pending_shift` only (`renderWindowController`); `setData` in layout effect keyed on `chartSeriesDataKey` / swap atomic key, not visible-range drag |
| Window swap uses atomic series key | **PASS** | `atomicShiftSeriesKeyRef` + `settleWindowSwapCommit` in `ChartPanel` |

## Trace fetch

| Check | Result | Evidence |
|-------|--------|----------|
| Fetch only from committed window | **PASS** | `chartWindowKey` from committed slice; `planTraceDisplayLoad` + `decideSignalTraceLoad`; pan-block in `traceDisplayOrchestrator` |
| `previousChartWindowKeyRef` on committed plans only | **PASS** | `WorkbenchContext` trace bootstrap |

## ChartPanel refs (plumbing only)

Documented in `ownership-map.md` § ChartPanel:

- `isApplyingViewportRef` — suppress range feedback during programmatic restore
- `suppressPanShiftUntilRef` — short guard after viewport apply
- `auxEmaSeriesRef` / `chartRef` / marker refs — LWC instance wiring
- `atomicShiftSeriesKeyRef` — coalesce setData on window swap

These refs MUST NOT schedule trace fetch, commit window shifts, or emit viewport policy.
