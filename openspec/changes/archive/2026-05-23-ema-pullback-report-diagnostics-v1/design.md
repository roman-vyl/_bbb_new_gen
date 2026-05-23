## Context

EMA pullback runs persist JSON under `research/results/` with `report_schema_version: 3`. Each variant already has `trade_records` (normalized vectorbt rows + `exit_reason` from `classify_exit_reason`) and side metrics from `build_trade_side_metrics`. Exit attribution (`ExitAttributionContext`) and exit outputs (`profile_long`, `profile_short`, `context_state`) exist at backtest time but are not fully serialized into reports. Portfolio simulation already implements entry-lock profile semantics in `signal_func_nb` (`locked[col] = long_profile_arr[i]` on entry).

Workbench and BFF whitelist schema v3 only (`research_api/contracts/runs.py`, `frontend/src/api/types.ts`).

## Goals / Non-Goals

**Goals:**

- Enrich closed `trade_records` so each trade is attributable to entry profile, HTF context, active exit profile, and winning exit rule metadata.
- Add variant-level `profile_breakdown`, `exit_reason_breakdown`, and `fee_diagnostics` for quick comparison without re-aggregating in notebooks.
- Bump to schema v4; keep v3 load path working.
- Reuse attribution / exit-policy metadata; avoid duplicate PnL math where vectorbt already exposes fees.

**Non-Goals:**

- Changing `ExitPolicyCompiler`, component registry, signal/exit series, or numba portfolio logic (except passing read-only context into record extraction).
- Data Engine, new strategy components, UI dashboards for breakdowns (types only).
- Bumping semantics of `exit_reason` string format (keep existing `stop_loss:`, `take_profit:`, `signal:` prefixes).

## Decisions

### 1. Entry profile source: entry-lock series, not `_resolve_profile` at exit

**Choice:** At `entry_idx`, read `profile_long` / `profile_short` from `PortfolioExitOutputs` (same per-bar profile codes fed into `long_profile_codes` / `short_profile_codes` in `backtest.py`). Map code → `aligned` | `countertrend` | `neutral` via existing `_profile_code` inverse.

**Rationale:** Matches portfolio entry-lock at open. `classify_exit_reason` already uses `_resolve_profile(direction, context_state_at_entry)` for stop selection; that can diverge from locked profile if context series and lock semantics differ — diagnostics must reflect **lock**, not a second guess.

**Alternative rejected:** Reuse `_resolve_profile` only — simpler but not guaranteed identical to locked profile used in simulation.

### 2. `active_exit_profile` vs `exit_profile` (distinct semantics)

**Choice:**

- `active_exit_profile` = **locked trade profile for the position lifetime** — same value from entry lock until flat (profile dimension used in `long_exit_matrix[:, prof]` while open; consistent with numba `locked[col]`).
- `exit_profile` = **profile bucket of the winning exit rule** — `aligned` | `countertrend` | `neutral` when `exit_group == "profile"`; `null` when `exit_group == "always_on"` or attribution is unknown/unattributable.

**Rationale:** Entry lock and winning-rule profile can diverge (e.g. countertrend lock, aligned exit rule fires). Consumers must not conflate the two fields.

**Alternative rejected:** Single `profile` field at exit — loses lock vs winning-rule distinction.

### 3. Exit metadata: extend attribution helper, don't only parse strings

**Choice:** Add `classify_exit_attribution(...) -> dict` (or return a small dataclass) alongside `classify_exit_reason`, sharing the same walk order in `exit_attribution.py`. Populate `exit_group`, `exit_profile`, `exit_component_id`, `exit_instance_id`, `exit_kind` from `ExitAttributionContext` rule tables + spec instance→component map passed in or built once from `EmaPullbackStrategySpec`. For `unknown` or unattributable exits, set `exit_group`, `exit_profile`, `exit_component_id`, `exit_instance_id`, and `exit_kind` to `null` (not sentinel strings).

**Rationale:** Avoid fragile string parsing; `exit_reason` stays the stable string key for breakdowns.

**Alternative:** Parse `exit_reason` only — rejected for stop/signal edge cases and `unknown`.

### 4. Fees and gross PnL from vectorbt trade records

**Choice:** Read vectorbt `records` fee columns when present (`entry_fees`, `exit_fees` or documented equivalents in installed vectorbt version). Set `fees_paid = entry_fees + exit_fees`, `gross_pnl = pnl + fees_paid`, `gross_return_pct` from gross PnL and entry notional. If fees columns missing (fees=0 runs), `fees_paid = 0`, `gross_pnl = pnl`.

**Rationale:** Single source of truth with simulation; no recomputation from config rate alone.

`fee_diagnostics.fees_rate` = execution `fees` argument passed into `run_strategy_spec` (stored on variant or run metadata if needed), not inferred from trades.

### 5. Hold duration

**Choice:** `hold_bars = exit_idx - entry_idx + 1` (inclusive span from entry bar through exit bar). `hold_minutes = hold_bars * base_timeframe_minutes`, where `base_timeframe_minutes` comes from the run base timeframe (e.g. `pandas_freq_alias(timeframe)`).

### 6. Aggregates module

**Choice:** New functions in `results.py` (or `report_diagnostics.py` sibling): `build_profile_breakdown`, `build_exit_reason_breakdown`, `build_fee_diagnostics`. Called from `build_trade_side_metrics` or immediately after `extract_trade_records` in `backtest.py` before `VariantResult` assembly.

**Rationale:** Keeps backtest.py thin; tests target pure functions on fixture trade lists.

`exit_reason_mix` inside profile buckets: count by full `exit_reason` string among trades with that `entry_profile`.

### 7. Schema v4 bump

**Choice:** Set `report_schema_version: 4` in `build_research_run_payload`. Extend whitelists: `research_api` `SUPPORTED_REPORT_SCHEMA_VERSIONS = frozenset({3, 4})`, frontend `[3, 4]`. Pydantic models: new fields optional with defaults omitted on parse for v3.

**Alternative:** Additive fields without bump — rejected because Workbench explicitly gates on version and docs treat persisted JSON as contract.

### 8. API contract

**Choice:** No new endpoints; existing run JSON passthrough. Optional Pydantic fields on `TradeRecord` / metrics nested models in `research_api/contracts/runs.py` if typed parsing exists; otherwise dict passthrough unchanged.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| vectorbt fee column names differ by version | Guard with hasattr/column check; unit test with fees&gt;0 optional_vectorbt case |
| `unknown` exit_reason trades lack exit_component_id | Allow nulls; still count in `exit_reason_breakdown` |
| Profile breakdown misses trades with null entry_profile | Only bucket trades with known profile; test sum = closed with profile set |
| Larger JSON payloads | Accept for v1; no truncation |
| Duplicating attribution logic | Single code path returns reason + metadata struct |

## Migration Plan

1. Ship research changes generating v4 on new runs only; historical `runs/*.json` stay v3.
2. Update BFF + frontend whitelists to accept 4; optional TS fields.
3. Update `docs/research/09_json_run_report.md` and README schema note.
4. Rollback: revert research writer to v3 (new runs); loaders already accept v3.

No database migration.

## Open Questions

- Confirm vectorbt trade record fee field names in the pinned research extra (verify in implementation, add shim if needed).

## Files (expected touch)

| File | Change |
|------|--------|
| `research/strategies/ema_pullback/execution/exit_attribution.py` | Structured exit metadata helper |
| `research/strategies/ema_pullback/execution/results.py` | Enriched `extract_trade_records`, aggregates, `report_schema_version` 4 |
| `research/strategies/ema_pullback/execution/backtest.py` | Pass `exit_outputs`, timeframe, fees into extraction/metrics |
| `research_api/contracts/runs.py` | Optional models + schema whitelist |
| `frontend/src/api/types.ts` | Optional fields + v4 in supported versions |
| `tests/test_ema_pullback_results_artifact.py` | v4 assertions, breakdown sums |
| Related: exit attribution tests, signal trace, config loader, EMA exit tests | Regression only |
