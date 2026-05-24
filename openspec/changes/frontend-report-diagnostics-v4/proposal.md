## Why

Research already emits `report_schema_version: 4` with aggregated diagnostics (`profile_breakdown`, `exit_reason_breakdown`, `fee_diagnostics`) and enriched `trade_records`, and the Workbench TypeScript types accept v3 and v4. Without a Reports UI layer, those fields stay invisible—users still guess which entry profile, exit path, and fee drag drive variant results. A minimal frontend v1 surfaces existing JSON only; no backend or trading changes.

## What Changes

- **Reports / Diagnostics area** (selected variant): Fee Diagnostics summary cards; Profile Breakdown table (`aligned` / `countertrend` / `neutral`); Exit Reason Breakdown table (full `exit_reason` keys).
- **Trade table enrichment**: Optional “Diagnostics columns” mode plus expanded `TradeDetail` for v4 per-trade fields; default table stays readable (current columns preserved).
- **Client-side filters**: `entry_profile`, `entry_context_state`, `exit_kind`, `exit_group`, `exit_reason` (extends existing prefix chips), winning/losing—applied to loaded `trade_records` only.
- **Schema gating**: v4 renders diagnostics from `variant.metrics`; v3 shows existing Reports UI with empty-state message for diagnostics blocks (no crash, no forced fixture changes).
- **Tests**: Vitest coverage for v3/v4 rendering, breakdown tables, filters, trade focus compatibility; `npm test` + `npm run build` in `frontend/`.

**Non-goals (explicit)**

- No research, Data Engine, BFF contract, or v4 JSON shape changes.
- No new API endpoints or server-side filtering.
- No dashboard framework, cross-run analytics, or recomputing aggregates already in `variant.metrics`.
- No Chart focus / trade selection behavior changes beyond remaining compatible with extra table columns and filtered rows.
- No mandatory update to `frontend/src/fixtures/report.json` (v3).

## Capabilities

### New Capabilities

- `workbench-report-diagnostics`: Research Workbench Reports tab—visualize schema v4 variant diagnostics and enriched trade rows; v3 backward-compatible empty states.

### Modified Capabilities

- _(none — research spec `ema-pullback-report-diagnostics` is unchanged; this change is frontend-only presentation)_

## Impact

| Layer | Scope |
|-------|--------|
| **frontend** | `features/reports/` (`ReportsPanel`, new presentation/filter modules), `api/types.ts` (already optional v4 fields—verify only), test fixtures under `features/reports/__fixtures__` or inline test data, CSS in `index.css` for compact tables |
| **research_api / research / data_engine** | _none_ |

**Reference docs**: [`docs/frontend/implementation_plan.md`](../../../docs/frontend/implementation_plan.md) (Reports slice, exit_reason filters), [`docs/frontend/frontend_master_plan_alternative_chart_composer_reports.md`](../../../docs/frontend/frontend_master_plan_alternative_chart_composer_reports.md), archived change [`openspec/changes/archive/2026-05-23-ema-pullback-report-diagnostics-v1`](../../archive/2026-05-23-ema-pullback-report-diagnostics-v1) (v4 JSON contract), [`openspec/specs/ema-pullback-report-diagnostics/spec.md`](../../specs/ema-pullback-report-diagnostics/spec.md) (data source semantics).
