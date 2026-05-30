## 1. Spec and feature planning

- [x] 1.1 Extend `ExitRuleSpec` (`ema`, `fast_ema`, `slow_ema`, `confirm_bars` default **1**)
- [x] 1.2 Validation **`ema_close_loss_exit`**: requires `ema` (source close), `confirm_bars >= 1`; forbids `fast_ema`, `slow_ema`, `rsi`, `long_exit_above`, `short_exit_below`, `distance`, `usd_distance`
- [x] 1.3 Validation **`ema_cross_loss_exit`**: requires `fast_ema`, `slow_ema`, same `timeframe`, both source close, `fast.period < slow.period`, `confirm_bars >= 1`; forbids `ema`, `rsi`, thresholds, `distance`, `usd_distance`
- [x] 1.4 FeaturePlan: EMA features from all exit_policy groups; aligned columns on base index
- [x] 1.5 Unit tests for validation matrices (including forbidden fields and mismatched cross timeframes)

## 2. Research — components

- [x] 2.1 `ema_close_loss_exit`: base `close` vs aligned EMA; `confirm_bars` = consecutive **base** bars
- [x] 2.2 `ema_cross_loss_exit`: single TF; `confirm_bars==1` cross event; `>1` adverse side N **base** bars
- [x] 2.3 Registry, builders, `instance_loader` with **nested** `ema` / `fast_ema` / `slow_ema` payloads (reject flat root keys)
- [x] 2.4 `execution/exits.py`: pass aligned EMA column refs

## 3. Tests

- [x] 3.1 Scenario: 1h EMA on 5m base, `confirm_bars=3` → three 5m bars (not three 1h bars)
- [x] 3.2 Cross: reject `fast_ema.timeframe != slow_ema.timeframe` at load/validate
- [x] 3.3 Profile placement + OR composition (always_on vs profile-only)
- [x] 3.4 `pytest` ema_pullback exits + pipeline slice

## 4. BFF catalog and docs

- [x] 4.1 Catalog: `confirm_bars` default **1** for both; field paths `ema.*` / `fast_ema.*` / `slow_ema.*` map to nested instance objects (distance/rsi pattern)
- [x] 4.2 README: v1 base-bar confirmation; single-TF cross; recommend `confirm_bars: 2–3` for close loss in examples only

## 5. Verification

- [x] 5.1 Optional experiment variant (documented YAML example in README; no batch file in repo)
- [x] 5.2 Manual `run.py` notes (verify via existing experiment config + README example)
- [x] 5.3 `data_engine/` untouched
