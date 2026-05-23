## Context

**Current state**

- Reports tab: single `ReportsPanel.tsx` bound to `useWorkbench()` (`report`, `selectedVariant`, `selectedTradeId`, `selectTrade`).
- Summary metric cards use `selectedVariant.metrics.total` / `open_trades`.
- Trade list: client-side filter via `exitReasonFilters.ts` (prefix chips: `stop_loss:*`, etc.); row click calls `selectTrade(trade.trade_id)`.
- `TradeDetail` shows a small fixed field set; no diagnostics blocks.
- Types in `frontend/src/api/types.ts` already define optional v4 fields on `TradeRecord` and `VariantMetrics` (`profile_breakdown`, `exit_reason_breakdown`, `fee_diagnostics`).
- Default dev fixture `frontend/src/fixtures/report.json` is schema **v3**; v4 data exists from real runs / test builders only.

**Constraints**

- Read-only visualization; aggregates come from `variant.metrics`, not recomputed in the browser (except filtered **views** of `trade_records`).
- `WorkbenchContext` trade focus uses `findTradeById(selectedVariant.trade_records, selectedTradeId)` on the **full** variant list—filtered table must not change selection identity.
- Match existing panel/table/chip CSS patterns (`reports-panel`, `metric-card`, `filter-row`, `trade-table`).

## Goals / Non-Goals

**Goals:**

- For schema v4 reports, show Fee / Profile / Exit Reason diagnostics for the **selected variant**.
- Enrich trade exploration (columns + detail) without making the default table unreadable.
- Client-side filters across v4 dimensions; preserve chart focus when selecting a row from a filtered list.
- v3 reports behave as today; diagnostics blocks show a clear empty state.

**Non-Goals:**

- Backend, research, BFF, or JSON schema changes.
- New routes, tabs, or a reusable “analytics dashboard” package.
- Re-aggregating `profile_breakdown` from filtered trades (out of scope for v1; tables always show full-variant metrics from JSON).
- Chart marker or overlay changes.

## Decisions

### 1. Extend `ReportsPanel` in place (no new tab)

Keep one Reports tab; insert a **Diagnostics** section between existing summary cards and the trade filter row.

**Rationale:** Matches `implementation_plan.md` Reports slice; smallest integration surface.

**Alternative rejected:** New “Diagnostics” top-level tab—more navigation churn for v1.

### 2. Module layout under `features/reports/`

| Module | Responsibility |
|--------|----------------|
| `reportSchema.ts` | `isDiagnosticsV4(version)`, `hasVariantDiagnostics(metrics)` |
| `formatDiagnostics.ts` | Shared formatters (money, %, win rate, PF, hold) — reuse `formatNum` patterns from panel |
| `FeeDiagnosticsSummary.tsx` | Renders `metrics.fee_diagnostics` |
| `ProfileBreakdownTable.tsx` | Rows: fixed order `aligned`, `countertrend`, `neutral`; compact `exit_reason_mix` |
| `ExitReasonBreakdownTable.tsx` | Rows: sorted keys of `metrics.exit_reason_breakdown` |
| `tradeDiagnosticsFilters.ts` | Pure filter predicates + chip option constants |
| `TradeDiagnosticsColumns.tsx` | Optional column definitions + toggle state |
| `ReportsPanel.tsx` | Orchestrates gating, composes sections, wires filters |

**Rationale:** Keeps `ReportsPanel` thin; testable pure helpers.

### 3. Schema v4 gating

```ts
isDiagnosticsV4(report.report_schema_version) // version === 4
```

- Diagnostics blocks render only when `isDiagnosticsV4` **and** the relevant `metrics.*` object exists.
- If v4 but a section is missing → hide that block (no throw).
- If not v4 → show `empty-hint`: “Diagnostics available for schema v4 reports.”

**Rationale:** v3 payloads never include aggregates; avoids implying zero values.

### 4. Aggregates vs filtered trades

| UI element | Data source |
|------------|-------------|
| Fee / Profile / Exit breakdown tables | `selectedVariant.metrics.*` (full variant) |
| Trade table rows | `trade_records` after client filters |
| Summary cards (Total PnL, Trades, …) | unchanged — `metrics.total` |

**Rationale:** Matches backend contract; prevents expensive/client-incorrect re-aggregation. Document in UI hint: “Breakdowns reflect all closed trades in this variant.”

**Alternative considered:** Recompute breakdown from filtered trades—deferred; would confuse comparison with JSON artifact.

### 5. Fee Diagnostics summary (block A)

Horizontal `metric-card` row (same class as existing summary):

| Label | Field |
|-------|--------|
| Fees rate | `fee_diagnostics.fees_rate` (format as % or rate per existing execution display convention) |
| Total fees | `total_fees_paid` |
| Gross PnL | `gross_pnl` |
| Net PnL | `net_pnl` |
| Fees / gross profit | `fees_as_pct_of_gross_profit` — show `—` when null/omitted |

### 6. Profile Breakdown table (block B)

- Rows: **always exactly three**, fixed order `aligned`, `countertrend`, `neutral` — never hide a profile row.
- When `trades === 0` for a profile: show `0` in the trades column; show `—` for nullable metrics (`win_rate`, `profit_factor`, `avg_return_pct`, `avg_hold_bars`, etc.); monetary sums may show `0` or `—` per formatter (prefer `0` for numeric sums of zero trades).
- Columns: `trades`, `win_rate`, `profit_factor`, `pnl`, `gross_pnl`, `fees_paid`, `avg_return_pct`, `avg_hold_bars`, **Exit mix** (compact).
- **Exit mix**: top 3 `exit_reason` keys by count from `exit_reason_mix`; render as `reason (n)` comma-separated; if more than 3, append `+k more`; empty mix → `—`.

### 7. Exit Reason Breakdown table (block C)

- Rows: `Object.keys(exit_reason_breakdown).sort()` (locale-aware string sort).
- Columns: `trades`, `win_rate`, `profit_factor`, `pnl`, `gross_pnl`, `fees_paid`, `avg_return_pct`, `avg_hold_bars`.
- `profit_factor` is in schema (`DiagnosticBucketMetrics`) — always show column.

### 8. Trade table columns (block 2)

**Default (unchanged):** `#`, `Dir`, `Status`, `Entry`, `Exit`, `PnL`, `exit_reason`.

**Diagnostics mode** (toggle `Show diagnostics columns`):

| Column | Field |
|--------|--------|
| entry_profile | `entry_profile` |
| ctx | `entry_context_state` |
| exit_prof | `active_exit_profile` |
| exit_grp | `exit_group` |
| exit_prof_rule | `exit_profile` |
| kind | `exit_kind` |
| gross | `gross_pnl` |
| fees | `fees_paid` |
| hold | `hold_bars` |

Omit from default row: `exit_component_id`, `exit_instance_id`, `gross_return_pct`, `hold_minutes` — show in **`TradeDetail`** only to limit width.

**Null safety:** formatter returns `—` for null/undefined.

### 9. TradeDetail expansion

When any v4 field present on trade, add DL entries for all closed-trade diagnostics (including `exit_component_id`, `exit_instance_id`, `gross_return_pct`, `hold_minutes`). Group under subheading “Diagnostics”.

### 10. Client-side filters (block 3)

Replace single `exitFilter` state with a small filter bar object (or parallel state vars):

| Filter | Control | Match rule |
|--------|---------|------------|
| `entry_profile` | chips: All, aligned, countertrend, neutral | exact match on `trade.entry_profile` |
| `entry_context_state` | chips: All, up, down, neutral, unknown | exact |
| `exit_kind` | chips: **All** + one chip per **distinct `exit_kind` string present in loaded `trade_records`** (exact match labels, e.g. `signal`, `stop_loss`, `take_profit`) | exact equality on `trade.exit_kind`; **do not** abbreviate or alias (`stop` is wrong — v4 JSON uses `stop_loss`) |
| `exit_group` | chips: All, always_on, profile | exact; `null` matches only “unknown” chip if added, else excluded from profile/always_on |
| `exit_reason` | **keep** existing `EXIT_REASON_FILTER_OPTIONS` | `matchesExitReasonFilter` |
| `outcome` | chips: All, Winners, Losers | `pnl > 0` / `pnl < 0`; open trades (`pnl === null`) excluded unless All |

Apply filters as chained `AND` in one `useMemo` over `selectedVariant.trade_records`.

**Open trades:** diagnostic fields may be null; profile filters exclude rows with missing `entry_profile` when a specific profile is selected.

### 11. Trade selection / Chart focus (unchanged contract)

- Row `onSelect` still calls `selectTrade(trade.trade_id)`.
- `TradeDetail` still resolves via `findTradeById(selectedVariant.trade_records, selectedTradeId)` (full list).
- Do not store “filtered index”; IDs are stable.

**Test implication:** filter to one row, click, assert `selectedTradeId` and chart focus helpers still resolve the same trade.

### 12. Styling

- Add `.diagnostics-section`, `.breakdown-table` (compact font, horizontal scroll via existing `.table-wrap`).
- Reuse `.chip` / `.chip--active` for new filters; wrap filter rows when crowded (`flex-wrap` already on `.filter-row`).

### 13. Test fixtures

- Add `frontend/src/features/reports/__fixtures__/report-v4-minimal.json` (or TS `makeV4Report()` in test file) with one variant, small `profile_breakdown` / `exit_reason_breakdown` / `fee_diagnostics`, and 3–5 `trade_records` covering filter cases.
- Keep `fixtures/report.json` at v3; v3 tests continue importing it.

### 14. Dependencies

No new npm packages.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Wide tables on small viewports | `.table-wrap` scroll; diagnostics columns behind toggle |
| Users expect filtered breakdowns | Hint copy; defer filtered aggregates to v2 |
| v4 run missing optional metric sections | Per-block hide; no throw |
| Filter chips proliferate | `exit_kind` chips derived from distinct values in loaded trades (exact strings); optional “Other” bucket only in a later iteration |
| E2E trade-focus specs assume column count | E2E unchanged (default columns); unit tests cover diagnostics toggle |

## Migration Plan

1. Ship frontend-only; no deploy ordering vs backend (v4 JSON already produced).
2. Users on v3 fixtures/runs: unchanged Reports experience + diagnostics empty state.
3. Rollback: revert frontend PR; no data migration.

## Open Questions

- _(none blocking v1)_ Optional follow-up: exact-match `exit_reason` dropdown when breakdown has many keys; not required for v1 chip filters.
