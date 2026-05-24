## Context

`ema-pullback-report-diagnostics` currently enriches closed trade records with entry profile, entry HTF context, exit attribution, fees, and hold duration. That explains where a trade came from and why it closed, but it does not answer whether the entry had favorable excursion, whether adverse excursion was acceptable, or whether a signal exit captured or gave back the available move.

The requested diagnostics are post-trade analytics. They may use the candle range from entry through exit to compute MFE, MAE, capture, and giveback, but they MUST NOT feed those future-looking values into entry context or strategy behavior. Entry context remains the locked entry-bar context already recorded on each closed trade.

## Goals / Non-Goals

**Goals:**

- Add direction-aware MFE / MAE fields to closed trade records.
- Add direction-aware captured, capture ratio, giveback, and timing fields to closed trade records.
- Add quality flags that distinguish good entries with good capture from good entries with exit giveback, low-MFE stop losses, and bad-context stop losses.
- Add variant-level aggregates by quality flag and by exit component, including average MFE, average capture ratio, average giveback, and flag counts.
- Emit new generated reports as `report_schema_version = 5`, with `trade_quality_config` metadata documenting the thresholds used for that report.
- Surface the optional fields in Workbench trade table columns, filters, and selected-trade chart diagnostics.
- Keep formulas centralized in `research/strategies/ema_pullback/execution/trade_analyzer.py`, with `results.py` only orchestrating record enrichment and aggregate calls.

**Non-Goals:**

- No optimizer, parameter search, or ranking engine.
- No change to signal generation, exit compilation, vectorbt simulation, stop semantics, or component registry.
- No data-engine changes.
- No frontend computation of MFE, MAE, capture, giveback, or quality flags.
- No detailed HTF resistance-stack taxonomy in v1; `stop_loss_after_bad_context` only uses coarse entry context labels.

## Decisions

1. **Create a dedicated post-trade analyzer module.**

   Add `research/strategies/ema_pullback/execution/trade_analyzer.py` with small pure helpers for:

   - per-trade excursion and capture metrics,
   - quality flag classification,
   - quality flag aggregate breakdowns,
   - exit component aggregate breakdowns.

   `results.py` will pass each closed trade's row, direction, entry/exit prices, entry/exit indices, OHLC series, optional ATR series, exit attribution metadata, and entry context into the helper. This keeps `results.py` focused on vectorbt normalization and JSON assembly.

   Alternative considered: implement all formulas inline in `extract_trade_records`. This is rejected because `results.py` already owns serialization, attribution attachment, and existing aggregate builders.

2. **Compute MFE / MAE over the inclusive entry-to-exit candle span.**

   For long trades:

   - `mfe_price = max(high over entry_idx..exit_idx inclusive) - entry_price`
   - `mae_price = min(low over entry_idx..exit_idx inclusive) - entry_price`
   - `captured_price = exit_price - entry_price`

   For short trades:

   - `mfe_price = entry_price - min(low over entry_idx..exit_idx inclusive)`
   - `mae_price = entry_price - max(high over entry_idx..exit_idx inclusive)`
   - `captured_price = entry_price - exit_price`

   `mfe_price` is non-negative when valid. `mae_price` is non-positive when valid. `giveback_price = mfe_price - captured_price` and is clamped to `0` when floating point noise would make it slightly negative. `capture_ratio = captured_price / mfe_price` when `mfe_price > 0`, else `null`.

   `bars_to_mfe` and `bars_to_mae` are zero-based relative to `entry_idx`: the entry bar is `0`. `bars_from_mfe_to_exit = exit_idx - mfe_idx`. If multiple bars have the same MFE or MAE value, v1 uses the first occurrence to keep reports and tests deterministic.

   These are bar-level diagnostics. The entry and exit bars are included. For intrabar stop/take exits, the exit bar's high/low may include movement after the fill because v1 does not reconstruct intrabar order from ticks. This limitation is documented in specs and covered by tests.

   Alternative considered: use close-to-close movement. This is rejected because MFE/MAE must represent what the market actually offered intrabar using high/low.

3. **Normalize percent and ATR fields consistently.**

   Percent fields are price-distance divided by `entry_price`, preserving sign for adverse and captured values. ATR fields are price-distance divided by entry ATR when an ATR value is available and positive; otherwise ATR-normalized fields are `null`.

   V1 MUST NOT auto-discover ATR columns by fuzzy name matching. `results.py` MAY pass an explicit `diagnostic_atr_series` into trade quality helpers. If no explicit ATR series is available, all `*_atr` fields MUST be `null`. Price and percent fields remain required for v5 closed trades.

   Alternative considered: calculate ATR in the frontend or API, or auto-discover ATR columns by partial names. Both are rejected: frontend/API calculation violates layer boundaries, and fuzzy discovery risks silently mixing incompatible ATR definitions.

4. **Use explicit v1 thresholds for quality flags.**

   The analyzer will define centrally named thresholds so reports are reproducible:

   - high MFE: `mfe_atr >= 2.0` when ATR is available, else `mfe_pct >= 0.02`
   - high capture: `capture_ratio >= 0.60`
   - low capture: `capture_ratio < 0.30`
   - low MFE: `mfe_atr < 1.0` when ATR is available, else `mfe_pct < 0.005`
   - giveback failure: high MFE plus low capture or `giveback_atr >= 1.5` when ATR is available

   Flags are a list, not an exclusive class. A trade may have both `high_mfe_low_capture` and `signal_exit_giveback_failure`.

   New v5 reports include top-level metadata:

   ```json
   {
     "trade_quality_config": {
       "schema": "trade-exit-quality-diagnostics-v1",
       "high_mfe_atr": 2.0,
       "high_mfe_pct_fallback": 0.02,
       "high_capture_ratio": 0.60,
       "low_capture_ratio": 0.30,
       "low_mfe_atr": 1.0,
       "low_mfe_pct_fallback": 0.005,
       "giveback_failure_atr": 1.5,
       "atr_source": null
     }
   }
   ```

   `atr_source` is `null` when no explicit `diagnostic_atr_series` is passed; otherwise it identifies the explicit series source used by the run.

   Alternative considered: store a single classification. This is rejected because a trade can be simultaneously a high-MFE trade, a signal-exit case, and a bad-context stop case.

5. **Classify stop and signal cases from existing exit attribution fields.**

   Signal-exit flags use `exit_kind == "signal"` and the realized/capture metrics:

   - `signal_exit_winner`: signal exit, captured profit, and high capture.
   - `signal_exit_giveback_failure`: signal exit with high MFE and poor capture or large giveback.

   Stop-loss flags use existing `exit_reason` / `exit_component_id` / `exit_kind` fields to identify stop-loss exits without changing exit attribution semantics:

   - `stop_loss_after_low_mfe`: stop-loss exit and low MFE.
   - `stop_loss_after_bad_context`: stop-loss exit and entry context is adverse for direction (`long` under `down` or `neutral`, `short` under `up` or `neutral`).

   Alternative considered: infer stop types from PnL only. This is rejected because a negative trade can close for reasons other than a stop, and exit attribution is already available.

6. **Aggregate averages preserve null semantics.**

   Aggregate averages ignore `null` values and return `null` when no non-null values exist for that metric. Missing ATR-normalized values MUST NOT be coerced to `0`, so ATR-less reports produce `null` for aggregate ATR averages rather than misleading zeroes.

7. **Emit schema v5 and keep v3/v4 readers compatible.**

   New generated reports MUST use `report_schema_version = 5`. Readers MUST keep accepting v3/v4. All new v5 fields remain optional in `research_api` and TypeScript contracts so existing v3/v4 artifacts and fixtures continue to load.

   Alternative considered: keep emitting schema v4 with optional fields. This is rejected because the new report contains a coherent exit-quality diagnostics contract and threshold metadata that should be distinguishable from existing v4 artifacts.

## Risks / Trade-offs

- **Vectorbt index semantics may differ for same-bar exits** -> Use existing `entry_idx` and `exit_idx`, include both endpoints, and add focused unit tests for one-bar, long, and short trades.
- **Exit-bar high/low may include post-fill movement for intrabar stop/take exits** -> Document MFE/MAE as bar-level diagnostics, include entry/exit bars by contract, and add tests that lock this v1 limitation.
- **ATR availability may vary across configs** -> Keep ATR-normalized fields nullable and test price/percent fields independently from ATR fields.
- **Quality thresholds are heuristic in v1** -> Centralize thresholds and document them in tests/specs so later tuning is a deliberate change.
- **Frontend filters can become cluttered** -> Add targeted quality filters first, backed by `quality_flags`, rather than many independent numeric range controls.

## Migration Plan

1. Add analyzer helpers and unit tests in the research execution package.
2. Wire helper output into closed trade record extraction and variant metrics.
3. Bump new generated reports to schema v5 and extend `research_api` / frontend optional contracts while preserving v3/v4 readers.
4. Add Workbench display/filter changes and focused tests.
5. Verify old v3/v4 fixtures still parse; update or add a new enriched fixture for diagnostics UI tests.

Rollback is straightforward because the change is additive: remove the helper call, omit the optional metrics fields, and keep existing report loading behavior.

## Open Questions

- None for v1 proposal scope.
