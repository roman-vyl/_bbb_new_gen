## Why

Reports already surfaces schema v4 trade diagnostics (profiles, exit attribution, fees, hold duration), but the Chart tab still shows only candles, anchor-stack EMA overlays, and entry/exit **time** markers. Marker placement (`aboveBar` / `belowBar`) is not a price truth—users cannot visually verify `entry_price`, `exit_price`, which exit component closed the trade, or which exit rules were active for the locked `active_exit_profile`. Chart-side selected-trade diagnostics closes that gap without touching backtest or data layers.

## What Changes

- **Selected trade price overlays**: When `selectedTradeId` is set, draw horizontal price lines at `entry_price` and `exit_price` (closed trades) with direction-aware labels (`Entry #id`, `Exit #id` / `exit_kind`); clear on deselect.
- **Trade diagnostics panel on Chart**: Side panel or anchored overlay listing full v4 trade fields (ids, times, prices, PnL split, exit attribution, profiles, hold duration) mirroring Reports `TradeDetail` semantics.
- **Active exit components list**: Resolve `always_on` and profile-scoped exits from `selectedVariant.strategy_spec.trade_management.exit_policy` for `trade.active_exit_profile`; highlight the component that closed the trade via `exit_instance_id`; show parameter summaries (ATR distance, EMA periods, `confirm_bars`).
- **Exit EMA availability (info only in v1)**: Rows/hints per EMA exit rule (covered by anchor stack vs unavailable); no new EMA series rendering, client-side EMA, or BFF/API changes in v1.
- **ATR levels (explicit non-draw in v1)**: Show ATR config in the components panel only; document follow-up for exact stop/take level payload from backtest.
- **Marker correctness policy**: SL/TP/signal marker text may remain at bar time; exact entry/exit levels MUST be represented by price lines, not marker position.

**Non-goals (explicit)**

- No optimizer, Composer changes, or strategy editing flows.
- No research, Data Engine, BFF contract, or `report_schema_version` changes.
- No backtest recomputation or client-side exit simulation.
- No approximate ATR stop/take bands drawn without exact level values in payload.
- No new API endpoints; use loaded run JSON + existing chart market bundle only.

## Capabilities

### New Capabilities

- `workbench-chart-trade-diagnostics`: Research Workbench Chart—selected-trade price overlays, diagnostics panel, active exit components from `strategy_spec`, exit EMA availability hints (no new series in v1), marker/price-line correctness rules.

### Modified Capabilities

- _(none — `ema-pullback-report-diagnostics` research contract unchanged; Chart consumes existing v4 `trade_records` and `strategy_spec` only)_

## Impact

| Layer | Scope |
|-------|--------|
| **frontend** | `features/chart/` (`ChartPanel`, new overlay/diagnostics modules), shared helpers for exit-policy resolution, CSS, Vitest unit tests, Playwright e2e extension for selected-trade diagnostics |
| **research_api / research / data_engine** | _none_ |

**Reference docs**: [`docs/frontend/implementation_plan.md`](../../../docs/frontend/implementation_plan.md) (Chart slice, trade focus), [`docs/frontend/frontend_master_plan_alternative_chart_composer_reports.md`](../../../docs/frontend/frontend_master_plan_alternative_chart_composer_reports.md), [`openspec/specs/ema-pullback-report-diagnostics/spec.md`](../../specs/ema-pullback-report-diagnostics/spec.md) (field semantics), archived [`openspec/changes/frontend-report-diagnostics-v4`](../../changes/frontend-report-diagnostics-v4) (Reports parity for trade detail fields).
