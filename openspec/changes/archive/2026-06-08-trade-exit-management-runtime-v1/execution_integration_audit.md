# Execution Integration Audit

## Current Execution Paths

### Static vectorbt path

Entry point: `research/strategies/ema_pullback/execution/backtest.py::run_strategy_spec`.

Flow:

- Build feature plan and enriched OHLCV with `build_feature_plan_from_strategy_spec` and `add_feature_columns_from_plan`.
- Build context bundle with `build_context_bundle_for_spec`.
- Build entries/setups/triggers/blockers with `build_signals_from_spec`.
- Build declarative `exit_policy` outputs with `build_exit_outputs_from_spec`.
- If `has_exit_management_rules(spec)` is false, run `vectorbt.Portfolio.from_signals`.
- Convert vectorbt trades to normalized records with `extract_trade_records`.
- Build metrics with `build_trade_side_metrics`.

### Existing managed exit_management / legacy BE path

Entry point: `run_strategy_spec`, gated by `has_exit_management_rules(spec)`.

Flow:

- The same feature/context/signals/exit-policy outputs are built first.
- If legacy BE management rules exist, `_run_managed_strategy_spec` calls `run_managed_bar_loop`.
- `run_managed_bar_loop` performs a bar-by-bar legacy break-even simulation and returns legacy closed trade dicts plus per-bar BE traces.
- `build_managed_trade_records` normalizes those managed closes into the same `trade_records` shape.

This path is legacy BE compatibility only. It is not the product path for the new phase-based diagnostic runtime.

### Report / trade record builder path

Static path:

- `extract_trade_records(pf, close, high, low, open_s, ...)`
- Source rows: `pf.trades.records_readable`
- Output: normalized `trade_records` list used by metrics and reports.

Legacy managed path:

- `build_managed_trade_records(closed, index, close, high, low, open_, ...)`
- Source rows: dicts from `run_managed_bar_loop`
- Output: normalized `trade_records` list used by metrics and reports.

## Current Data Availability

Static vectorbt records in `extract_trade_records`:

- `entry_idx`: `row.get("entry_idx")`
- `exit_idx`: `row.get("exit_idx")`
- `side`: `direction`, derived from vectorbt `direction` code
- `entry_price`: `row.get("entry_price")`
- `exit_price`: `row.get("exit_price")`
- `exit_reason`: classified with `classify_exit_attribution` or `open` / `unknown`
- `locked profile`: `entry_profile` / `active_exit_profile`, derived from `profile_long` or `profile_short` at `entry_idx`
- `OHLCV/index`: `close.index`, `open_s`, `high`, `low`, `close`

Legacy managed records in `build_managed_trade_records`:

- `entry_idx`: `pos.entry_idx`
- `exit_idx`: `item["exit_idx"]`
- `side`: `pos.direction`
- `entry_price`: `pos.entry_price`
- `exit_price`: `item["exit_price"]`
- `exit_reason`: `item["exit_attribution"].exit_reason` or `open` / `unknown`
- `locked profile`: `pos.locked_profile`
- `OHLCV/index`: function args `index`, `open_`, `high`, `low`, `close`

## Future Diagnostic-only Integration Point

The diagnostic-only runtime pass should be added after actual `trade_records` have been built, with access to the same OHLCV/index series used by report diagnostics.

The pass must:

- Read only actual closed trade windows: `entry_idx..exit_idx` inclusive.
- Use existing trade record fields for entry/exit/side/price/profile/exit reason.
- Use existing OHLCV/index series for per-bar state updates.
- Avoid recomputing entries, exits, setup, trigger, blockers, indicators, or context.
- Avoid creating pseudo-trades or shadow trades.
- Avoid feeding runtime state back into vectorbt masks, exits, stops, or managed execution decisions.

For static vectorbt, the natural hook is immediately after `extract_trade_records`.
For legacy managed BE compatibility, the natural hook is immediately after `build_managed_trade_records`, but legacy BE itself must remain outside the new runtime architecture.
