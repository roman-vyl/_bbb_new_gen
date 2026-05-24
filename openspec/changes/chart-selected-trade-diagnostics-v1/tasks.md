## 1. Shared helpers

- [x] 1.1 Add `tradeDiagnosticsFields.ts` (or shared module under `features/reports/` + re-export) with field labels/formatters aligned with Reports `TradeDetail`
- [x] 1.2 Add `exitPolicyForTrade.ts` — parse exit policy, flatten always_on + profile exits, parameter summaries, `isClosing`; resolve `exit_kind` priority: `rule.exit_kind` → `trade.exit_kind` (closing row only) → known `component_id` map → `—`
- [x] 1.3 Add `chartTradePriceLines.ts` — pure price-line option builders from `TradeRecord`; **unit-test builders only** (no canvas)

## 2. Chart price overlays

- [x] 2.1 In `ChartPanel.tsx`, manage `createPriceLine` / cleanup in `useEffect` only when `selectedTrade` resolves (not merely `selectedTradeId` set)
- [x] 2.2 Wire entry/exit lines when prices set; remove on deselect or stale id; **no lines** when trade not found in variant
- [x] 2.3 Do **not** assert price lines via canvas DOM; verify lines manually or Playwright screenshot

## 3. Chart diagnostics panel

- [x] 3.1 Create `ChartTradeDiagnostics.tsx` — trade field grid, v3/v4 placeholders, closing-component badge
- [x] 3.2 Create `ActiveExitComponentsList.tsx` — table from `exitPolicyForTrade`; ATR/EMA parameter columns; EMA **availability info rows** (not toggles)
- [x] 3.3 Integrate panel when `selectedTradeId` set; **stale id** → neutral empty state (mirror `chartTradeFocusWarning`); no crash
- [x] 3.4 Vitest component tests: v4 fixture trade + closing highlight + stale `selectedTradeId` empty state (`data-testid`)

## 4. Exit EMA availability (info only — not a rendering feature in v1)

- [x] 4.1 Add `exitEmaOverlayAvailability.ts` — classify each EMA exit rule: anchor-stack covered vs unavailable in `chartEmaOverlays`
- [x] 4.2 Render static availability rows/hints per EMA rule in the components section — **no toggles**, no new `LineSeries`, no client-side EMA, no BFF/API change
- [x] 4.3 Do **not** implement new EMA series rendering unless series already exists in `chartEmaOverlays` and is already on chart (out of v1 — info only)

## 5. Marker / legend clarity

- [x] 5.1 Update `ChartMarkerLegend` copy: markers show bar timing; selected trade prices use horizontal lines
- [x] 5.2 Add brief comment in `chartMarkers.ts` that marker position is not price truth

## 6. Verification

- [x] 6.1 `npm test` — unit tests for pure builders/parsers; component tests for diagnostics panel DOM
- [x] 6.2 `npm run build` in `frontend/`
- [x] 6.3 Extend `e2e/diagnostics-acceptance.spec.ts`: v4 run → select trade → Chart tab diagnostics panel fields + trade focus hint (**no canvas line assertions**)
- [ ] 6.4 Manual: v4 fixture — visually confirm entry/exit price lines match Reports prices; stale trade id after variant switch → empty state, no lines
- [ ] 6.5 Manual screenshot (optional): Chart with selected trade per `.cursor/rules/workbench-chart-screenshots.mdc`
