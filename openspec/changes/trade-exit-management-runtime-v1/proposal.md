## Why

Current `trade_management.exit_policy` describes which static and signal exits exist, but it does not provide a first-class runtime model for an open trade's phase, favorable/adverse movement, active protective stop, or exit-layer attribution. This makes it hard to research runner/protection behavior safely: PF changes can hide whether a trade reached `proven`, `protected`, or `runner`, and old configs need to keep their existing single trade path unchanged.

This change introduces a stateful runtime layer inside the existing research trade-management flow, not a parallel simulator. It follows the research-layer direction in `docs/research/strategy_constructor_master_plan.md` and extends the already archived exit-management direction in `openspec/specs/exit-management-combiner/spec.md`.

## What Changes

- Add `trade_management.exit_management` as a research-runtime controller beside `trade_management.exit_policy`.
- Keep `exit_policy` responsible for declarative exit components such as ATR SL/TP and static/signal exits.
- Add a `TradeRuntimeState` concept for one real open trade, including phase, bars in trade, side-aware MFE/MAE, best/worst price, active stop diagnostics, and locked exit profile.
- Add configurable phase rules for v1 condition types: `mfe_atr`, `mfe_pct`, and `bars_in_trade`.
- Add runtime event tracing for phase transitions, active-stop updates, exit rule triggers, and final executed exits.
- Add diagnostic-only mode where `exit_management` computes runtime state and report diagnostics without changing exits, stops, trade count, PnL, or PF.
- Extend closed-trade and variant-level research reports with trade-management diagnostics for phases reached, MFE/giveback/capture, exit-layer attribution, and active-stop source.
- Preserve old behavior when `exit_management` is absent; no silent migration of old strategy shapes.

Non-goals for the first backend change:

- No new parallel trade path, pseudo-trades, or second simulation.
- No frontend/chart rendering for phase markers, active-stop lines, or exit-layer labels.
- No behavior-changing break-even, EMA trailing, RSI overheat transition, or context-loss runtime exit in the first implementation slice.
- No changes to `data_engine` candle ingestion/storage.
- No Workbench Composer authoring changes unless a later slice explicitly targets frontend/API validation.

## Capabilities

### New Capabilities

- `trade-exit-management-runtime`: Stateful runtime controller under `trade_management.exit_management`, including diagnostic-only phase tracking, runtime trace, backward compatibility, and report diagnostics.

### Modified Capabilities

- `ema-pullback-report-diagnostics`: Closed-trade and variant metrics gain optional trade-management diagnostic fields for schema-compatible research reports.
- `exit-management-combiner`: Existing managed-runtime requirements are refined so the new controller remains inside the current research execution flow and never becomes a separate trade path.

## Impact

Affected layer: `research`.

Likely affected areas:

- Strategy spec parsing/validation for optional `trade_management.exit_management`.
- `ema_pullback` backtest/runtime execution where trades are opened, updated, and closed.
- Exit attribution and diagnostics builders that currently serialize closed trade records and variant metrics.
- Batch/result summary extraction where new optional report sections must not break old reports.
- Tests/fixtures for old-config parity and diagnostic-only reports.

Integration boundaries:

- `research` owns runtime state, event trace, exit attribution, and report JSON fields.
- `research_api` and `frontend` may consume the new fields later, but this change does not require UI or BFF behavior changes.
- `data_engine` remains out of scope.

Roadmap note:

This change's first implementation slice is backend diagnostic-only. The full master plan requires later read-only API/BFF and frontend report/chart integration. Frontend authoring and Composer support are intentionally later than read-only consumption.
