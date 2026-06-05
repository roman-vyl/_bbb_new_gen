## Context

### Audit: current `trade_analyzer.py` (baseline at `55e7dce`)

| Responsibility | Function(s) | Notes |
|----------------|-------------|--------|
| Path math (flat v5) | `compute_trade_quality_metrics()` | MFE/MAE/capture/giveback over `entry_idx:exit_idx+1`; entry+exit bars included |
| Quality flags | `classify_quality_flags()` | Uses flat metrics + record context |
| Public builder | `build_trade_quality_diagnostics()` | Calls `compute_trade_quality_metrics` + flags; **single call site target** |
| Variant breakdowns | `build_quality_flag_breakdown()`, `build_exit_component_quality_breakdown()` | From flat fields on closed trades |

**Call sites (report generation)**

| Path | File | Behavior today |
|------|------|----------------|
| Vectorbt trades | `results.extract_trade_records()` | Closed trades with OHLC → `build_trade_quality_diagnostics()` |
| Managed replay | `results.build_managed_trade_records()` | **Does not** call diagnostics builder today |
| Metrics assembly | `backtest.build_trade_side_metrics()` | `build_trade_quality_breakdowns()` only |

**Gaps vs v6 target**

- No nested `path_diagnostics` / `reference_levels`.
- No `path_diagnostics_summary`.
- `giveback_price` uses `max(0, mfe - captured)` only when result ≥ 0 (old clamp); v6 allows giveback > MFE on losers via `max(0, MFE - realized)`.
- Flat `mae_price` is **signed** adverse; v6 nested `mae.price_move` is **non-negative** magnitude — flat `mae_pct` must use positive magnitude for parity with nested.
- No reference-level scan; no `reference_levels_available`.
- `report_schema_version` still **5**.

### Frontend (shipped)

Reports tab modules under `frontend/src/features/reports/` — v4/v5 UI, filters, optional quality columns. Gating via `isDiagnosticsV4()` (versions 4 and 5).

## Goals / Non-Goals

**Goals**

- **One formula source** in `trade_analyzer.py` for MFE, MAE, capture, giveback, bar timings, reference levels, nested + flat output.
- Schema v6 for new runs; v3–v5 artifacts unchanged.
- Same builder for vectorbt and managed closed trades when data available.
- Frontend continues serving v4/v5 diagnostics UI; v6 reports use same gating + flat fields.

**Non-goals**

- Second module duplicating path math (no `trade_path_diagnostics.py` unless extracted as private helpers **inside** the same file).
- Trading logic changes, post-exit bars, shadow trades, runner simulation.
- Reports UI for nested path sections.
- Silent JSON migration.

## Decisions

### 1. Extend `trade_analyzer.py` in place (single source of formulas)

Refactor into logical sections **within the same file**:

```
_compute_trade_path_core()      # pure math → core dataclass/dict
_build_nested_path_diagnostics() # mfe/mae/capture nested shape
_compute_reference_levels()    # SL/TP at entry + window scan
_flat_fields_from_core()       # legacy v5 keys + ATR + quality_flags input
build_trade_quality_diagnostics()  # public: nested + flat + flags
build_path_diagnostics_summary()   # variant metrics aggregate
path_diagnostics_config_payload()    # top-level reproducibility config
```

`compute_trade_quality_metrics()` becomes a thin wrapper returning flat-only (tests/backward compat) or delegates to `_flat_fields_from_core`.

**Rejected:** separate `trade_path_diagnostics.py` with duplicated formulas — violates “one source” requirement unless it only re-exports from `trade_analyzer` (unnecessary file).

### 2. Trade window

Inclusive `entry_idx .. exit_idx`. No bars after exit. Same intrabar caveat as v5 on exit bar OHLC.

### 3. MFE / MAE (normative)

**Long**

```
MFE_price = max(0, max(high[entry..exit]) - entry_price)
MAE_price = max(0, entry_price - min(low[entry..exit]))
```

**Short**

```
MFE_price = max(0, entry_price - min(low[entry..exit]))
MAE_price = max(0, max(high[entry..exit]) - entry_price)
```

Nested `mfe` / `mae`: `price_move` (non-negative), `pct = price_move / entry_price`, `time_ms`, `bars_from_entry`.

Flat legacy: `mfe_price`, `mfe_pct`, `mae_price` as **positive magnitudes** (update tests from signed mae); `bars_to_mfe`, `bars_to_mae`.

### 4. Capture / giveback (normative)

```
realized_favorable_move = (exit - entry) long; (entry - exit) short
capture_ratio = realized / MFE_price  if MFE_price > 0 else null  # may be negative; never clamp
captured_pct = realized / entry_price
giveback_price = max(0, MFE_price - realized)  if MFE_price > 0 else null
giveback_pct = giveback_price / entry_price     if giveback_price is not None else null
bars_from_mfe_to_exit = exit_idx - mfe_bar_idx
```

**Losing long example:** entry 100, high 108, exit 95 → `capture_ratio = -0.625`, `giveback_price = 13`, `giveback_pct = 0.13`.

### 5. Reference levels

Resolve initial SL/TP at entry via `ExitAttributionContext` + `_agg_sl_tp_at_entry` + `_levels_from_ratios` (reuse `exit_attribution` helpers).

`reference_levels_available = true` iff at least one finite SL or TP level.

**Unavailable payload:** all nulls/false, `first_level_hit: "none"`.

**Scan** `entry_idx..exit_idx` bar-by-bar:

- Long: TP if high ≥ TP; SL if low ≤ SL
- Short: symmetric
- Same bar both → `ambiguous_same_bar` (do not guess order)
- Levels known, none touched → `first_level_hit: "none"` (distinct from unavailable)

Touch helpers: reuse `_stop_hit_long` / `_stop_hit_short` from `exit_attribution.py`.

### 6. Open trades

Do **not** write `path_diagnostics` or `reference_levels` keys on open trade records.

### 7. `path_diagnostics_summary`

`build_path_diagnostics_summary(trade_records)` in `trade_analyzer.py`; wired from `build_trade_quality_breakdowns()` in `results.py`.

Required: `total`, `by_side.long`, `by_side.short`, `by_exit_reason`.

Optional when fields exist: `by_entry_profile`, `by_entry_context_state`, `by_active_exit_profile`.

Counts: `reference_levels_available_count`, `reference_levels_unavailable_count`, `no_reference_level_hit_count` (only available + `first_level_hit === none`).

Percentiles: linear interpolation on finite values; empty → `null`.

### 8. Schema v6 payload

```json
"report_schema_version": 6,
"path_diagnostics_config": {
  "schema": "trade_path_diagnostics",
  "version": "1",
  "window": "entry_to_exit_inclusive",
  "open_trades": "omitted",
  "same_bar_level_policy": "ambiguous_same_bar",
  "post_exit_bars": "excluded"
}
```

### 9. Managed replay parity

`build_managed_trade_records()` must call `build_trade_quality_diagnostics()` for **closed** trades when `high`/`low`/`open_` and attribution context can be supplied (extend signature if needed).

### 10. Frontend (unchanged UI scope)

- `isDiagnosticsV4()` → true for versions 4, 5, **6**.
- Optional `TradePathDiagnostics`, `TradeReferenceLevels`, `PathDiagnosticsSummary` in `api/types.ts`.
- No new Reports components for nested path in this change.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Flat `mae_price` sign change | Document; update tests; nested/flat parity tests |
| Managed path missing OHLC | Skip nested fields only when indices/OHLC absent; document |
| Duplicate formulas | Code review + single `_compute_trade_path_core` |
| Frontend build on v6 | Optional types + schema version 6 in `SUPPORTED_REPORT_SCHEMA_VERSIONS` |

## Migration Plan

1. Ship research v6 generation first.
2. Frontend optional types; existing Reports UI reads flat + v4 metrics.
3. Rollback: revert research PR; v5 JSON still valid.

## Compact run summary artifact (follow-up)

### Problem

Full `runs/<RUN_ID>.json` includes `trade_records` and becomes too large for chat/review handoff. Need a second artifact with run metadata + variant metrics/breakdowns only.

### Artifact naming

`research/results/runs/<RUN_ID>.summary.json` — summary **projection** of the full report, not a replacement schema.

### `build_compact_report_payload(full_report)`

- `copy.deepcopy` — does **not** mutate the input dict.
- Strips from each variant: `trade_records`, `trades`, `candles`, `ohlcv`, `component_events`, `signal_trace`, `trace`.
- Strips same heavy keys at top level if present.
- Before strip, adds per-variant: `trade_records_count`, `closed_trades_count`, `open_trades_count`.
- Preserves: `metrics` (incl. `path_diagnostics_summary`), breakdowns, `strategy_spec`, `component_counters`, top-level `path_diagnostics_config`, `batch_metadata`, etc.
- Summary markers merged **last** (override any collision from full payload):

```python
return {
    **stripped,
    "artifact_kind": "run_summary",
    "summary_schema_version": 1,
    "source_report_path": "research/results/runs/<RUN_ID>.json",
}
```

Helpers: `run_report_relpath()`, `run_summary_report_relpath()`.

### `write_research_results`

Writes three files:

| Path | Content |
|------|---------|
| `runs/<RUN_ID>.json` | Full report (unchanged) |
| `runs/<RUN_ID>.summary.json` | Compact projection |
| `latest.json` | Full report (unchanged) |

Returns `(latest_path, run_path, summary_path)` — **3-tuple** (breaking change vs old 2-tuple; all call sites updated).

`runner.py` logs `summary_artifact=...` alongside existing artifact paths.

### Batch / experiments

`ExperimentCandidateResult.summary_report_path` optional — set when `<RUN_ID>.summary.json` exists after candidate run. Old batch JSON without the field remains valid.

### Non-goals

- No change to v6 path math, metrics computation, or Workbench UI.
- No summary-only writer replacing full report.

## Open Questions

- Reports UI for `path_diagnostics_summary` table — deferred follow-up.
