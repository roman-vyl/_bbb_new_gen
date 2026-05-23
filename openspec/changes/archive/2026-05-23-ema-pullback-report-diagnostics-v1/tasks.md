## 1. Exit attribution metadata (research)

- [x] 1.1 Add structured exit attribution helper in `exit_attribution.py` (returns `exit_group`, `exit_profile`, `exit_component_id`, `exit_instance_id`, `exit_kind` alongside `exit_reason`)
- [x] 1.2 Wire instance_id → component_id map from spec exit policy rules (always_on + profiles) into attribution context or extraction call site
- [x] 1.3 Unit test: signal/stop exit paths populate metadata; `unknown` yields `exit_group`, `exit_profile`, and all component fields `null`

## 2. Trade record enrichment (research)

- [x] 2.1 Extend `extract_trade_records` signature to accept `profile_long`, `profile_short`, `context_state`, timeframe, and spec/rule map
- [x] 2.2 For closed trades: set `entry_profile`, `entry_context_state`, `active_exit_profile` (locked lifetime profile) from entry-lock series and HTF context at `entry_idx`; set `exit_profile` separately from winning exit rule attribution
- [x] 2.3 Add fee split fields from vectorbt records (`gross_pnl`, `fees_paid`, `gross_return_pct`; keep `pnl` / `return_pct` net)
- [x] 2.4 Add `hold_bars` (`exit_idx - entry_idx + 1`) and `hold_minutes` (`hold_bars * base_timeframe_minutes`) for closed trades
- [x] 2.5 Update `backtest.run_strategy_spec` to pass exit output series into `extract_trade_records` (no numba/portfolio logic changes)

## 3. Variant diagnostic aggregates (research)

- [x] 3.1 Implement `build_profile_breakdown`, `build_exit_reason_breakdown`, `build_fee_diagnostics` (pure functions on closed records)
- [x] 3.2 Extend `build_trade_side_metrics` (or variant assembly) to attach the three sections under `metrics`
- [x] 3.3 Pass execution `fees` rate into `fee_diagnostics.fees_rate`

## 4. Schema v4 and contracts

- [x] 4.1 Set `report_schema_version` to `4` in `build_research_run_payload`
- [x] 4.2 Whitelist v4 in `research_api/contracts/runs.py` and `results_reader` tests
- [x] 4.3 Add optional v4 fields to `frontend/src/api/types.ts`; extend `SUPPORTED_REPORT_SCHEMA_VERSIONS` to `[3, 4]`
- [x] 4.4 Update `frontend/src/fixtures/report.json` only if needed for local dev (optional fields OK on v3 fixture)

## 5. Tests

- [x] 5.1 Update `test_ema_pullback_results_artifact.py`: expect v4, assert new trade fields on closed trades (with optional_vectorbt fixture)
- [x] 5.2 Test `profile_breakdown` and `exit_reason_breakdown` trade counts sum to closed total
- [x] 5.3 Test `gross_pnl - fees_paid ≈ pnl`, `fee_diagnostics.fees_rate` matches configured fees, and `hold_bars` / `hold_minutes` match index span formula
- [x] 5.4 Regression: run exit attribution, signal trace, config loader, existing EMA exit tests — no golden changes to trading outputs

## 6. Docs and verification

- [x] 6.1 Update `docs/research/09_json_run_report.md` with v4 trade/metrics fields
- [x] 6.2 Run targeted pytest:
  `pytest tests/test_ema_pullback_results_artifact.py tests/test_ema_pullback_run_metrics.py -q`
  plus exit attribution / signal trace / config loader / EMA exit test modules as listed in design
