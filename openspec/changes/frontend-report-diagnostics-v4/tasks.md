## 1. Foundations

- [x] 1.1 Add `reportSchema.ts` with `isDiagnosticsV4(reportSchemaVersion)` and `hasVariantDiagnostics(metrics)` helpers
- [x] 1.2 Add `formatDiagnostics.ts` for money, percent, win rate, profit factor, and hold formatters (null-safe)
- [x] 1.3 Add v4 minimal test fixture (`features/reports/__fixtures__/report-v4-minimal.json` or `makeV4Report()` test helper); leave `src/fixtures/report.json` at v3

## 2. Diagnostics presentation

- [x] 2.1 Implement `FeeDiagnosticsSummary.tsx` (fees_rate, total_fees_paid, gross_pnl, net_pnl, fees_as_pct_of_gross_profit)
- [x] 2.2 Implement `ProfileBreakdownTable.tsx` (always 3 rows: aligned/countertrend/neutral; trades=0 → 0 + em dash metrics; top-3 exit_reason_mix compact cell)
- [x] 2.3 Implement `ExitReasonBreakdownTable.tsx` (sorted exit_reason keys, full metric columns including profit_factor)
- [x] 2.4 Wire diagnostics section into `ReportsPanel.tsx` with v4 gating and v3 empty-state copy
- [x] 2.5 Add compact breakdown table styles in `index.css` (scroll, spacing; reuse `.table-wrap`)

## 3. Trade table and detail

- [x] 3.1 Add `tradeDiagnosticsFilters.ts` with AND-composed predicates (entry_profile, entry_context_state, exit_kind exact strings e.g. stop_loss not stop, exit_group, outcome, reuse `matchesExitReasonFilter`)
- [x] 3.2 Replace single exit filter state in `ReportsPanel` with filter bar (chips); keep existing exit_reason prefix options
- [x] 3.3 Add diagnostics column toggle and optional columns component; default columns unchanged
- [x] 3.4 Expand `TradeDetail` with v4 diagnostic fields (component/instance ids, gross_return_pct, hold_minutes)
- [x] 3.5 Add hint that breakdown tables reflect full variant metrics (not filtered subset)

## 4. Tests

- [x] 4.1 `reportSchema.test.ts` — v3/v4 gating helpers
- [x] 4.2 `FeeDiagnosticsSummary.test.tsx` — v4 renders fee fields; null `fees_as_pct_of_gross_profit` shows placeholder
- [x] 4.3 `ProfileBreakdownTable.test.tsx` — renders aligned/countertrend/neutral rows from fixture metrics
- [x] 4.4 `ExitReasonBreakdownTable.test.tsx` — renders rows per exit_reason key
- [x] 4.5 `ReportsPanel.test.tsx` — v3 fixture: no populated diagnostics, no crash; v4 empty-state not shown when metrics present
- [x] 4.6 `tradeDiagnosticsFilters.test.ts` — entry_profile and exit_reason prefix filters; winners/losers
- [x] 4.7 `ReportsPanel.test.tsx` — filtered row click sets `selectTrade` id; detail resolves from full `trade_records` (mock workbench)
- [x] 4.8 `ReportsPanel.test.tsx` — diagnostics columns toggle shows enriched cells; null fields safe

## 5. Verification

- [x] 5.1 Run `cd frontend && npm test` — all new and existing tests pass
- [x] 5.2 Run `cd frontend && npm run build` — production build succeeds
- [ ] 5.3 Manual: load a real v4 run in Workbench — diagnostics blocks and filters behave; load v3 fixture/run — prior Reports behavior intact
- [ ] 5.4 Manual: select trade from filtered table — Chart focus still targets correct trade (smoke; existing e2e trade-focus unchanged)
