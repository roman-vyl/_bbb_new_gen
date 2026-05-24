## Why

EMA pullback research runs already emit `trade_records` and side metrics, but comparing variants still requires manual guesswork about which entry profile, exit profile, exit rule, and fee drag drove results. A v1 diagnostics upgrade makes those dimensions machine-readable in the persisted JSON report without changing strategy semantics, exits, or parameters.

## What Changes

- **Trade record enrichment** (closed trades): `entry_profile`, `entry_context_state`, `active_exit_profile` (locked for trade lifetime), `exit_group` / `exit_profile` / component ids (winning exit rule; nullable when always-on or unattributable), `gross_pnl`, `fees_paid`, `gross_return_pct`, `hold_bars` (`exit_idx - entry_idx + 1`), `hold_minutes` (`hold_bars * base_timeframe_minutes`); `pnl` / `return_pct` remain net.
- **Variant metrics aggregates**: `profile_breakdown`, `exit_reason_breakdown`, `fee_diagnostics` under `variant.metrics`.
- **Schema**: bump `report_schema_version` to **4**; keep v3 readable in research_api and frontend loaders; new fields optional in frontend TypeScript types.
- **Tests**: targeted pytest for new fields, breakdown sums, fee identity, and regression of existing artifact / signal-trace / exit tests.
- **Docs**: update `docs/research/09_json_run_report.md` field lists (reference only; not duplicated here).

**Non-goals (explicit)**

- No changes to trading logic, exit compilation, signal generation, or strategy components.
- No Data Engine changes.
- No Workbench UI beyond optional TypeScript types and schema whitelist (v3 + v4).
- No parameter tuning or new exit rules.

## Capabilities

### New Capabilities

- `ema-pullback-report-diagnostics`: Persisted ema_pullback run report schema v4 — enriched `trade_records`, variant-level diagnostic aggregates, backward-compatible v3 loading.

### Modified Capabilities

- _(none — exit signal/catalog specs unchanged; this is report contract only)_

## Impact

| Layer | Scope |
|-------|--------|
| **research** | `execution/results.py` (`extract_trade_records`, aggregates), `execution/exit_attribution.py` (structured exit metadata reuse), `execution/backtest.py` (pass profile/context series into extraction; extend `build_trade_side_metrics`), `execution/result_models.py` if typed helpers added |
| **research_api** | `contracts/runs.py`, `services/results_reader.py` — whitelist schema v4 |
| **frontend** | `api/types.ts` optional fields; `SUPPORTED_REPORT_SCHEMA_VERSIONS` includes 4 |
| **tests** | `test_ema_pullback_results_artifact.py`, run metrics / exit attribution / signal trace suites |
| **docs** | `docs/research/09_json_run_report.md` |

**Reference docs**: [`docs/research/09_json_run_report.md`](../../../docs/research/09_json_run_report.md), [`docs/research/16_exit_reason_attribution.md`](../../../docs/research/16_exit_reason_attribution.md), [`docs/research/strategy_constructor_master_plan.md`](../../../docs/research/strategy_constructor_master_plan.md) (research track only).
