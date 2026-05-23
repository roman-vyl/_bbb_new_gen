### Requirement: v1 evaluates exits on base index with base-bar confirmation

In v1, `ema.timeframe`, `fast_ema.timeframe`, and `slow_ema.timeframe` define the **indicator calculation timeframe**. The exit signal MUST be evaluated on the strategy **base OHLCV index**. `confirm_bars` MUST count **consecutive base bars** after indicator values are aligned from their calculation timeframe to base bars.

HTF-candle confirmation (e.g. three 1h closes while base is 5m) is **not** part of v1.

#### Scenario: 1h EMA with three base-bar confirmation

- **GIVEN** strategy base timeframe `5m`, `ema.timeframe=1h`, `ema.period=200`, `confirm_bars=3`, and three consecutive 5m bars where base `close` is below the aligned EMA200(1h) series
- **WHEN** `ema_close_loss_exit` evaluates with `side="long"` on the third bar
- **THEN** that bar is `True` in the exit series

#### Scenario: HTF-candle count is not used in v1

- **GIVEN** the same config but only one 1h period has closed while three 5m bars passed
- **WHEN** the component evaluates using v1 rules
- **THEN** confirmation is based on 5m base bars only, not the count of completed 1h candles

### Requirement: EMA close loss exit with confirmation

The `ema_close_loss_exit` component SHALL be a signal exit requiring `rule.ema` with `source="close"` and `rule.confirm_bars >= 1` (default **1** when omitted in builders).

For **long**, on base bar *t* it MUST be `True` when `close < aligned EMA` for `confirm_bars` consecutive base bars ending at *t*. For **short**, when `close > aligned EMA` for the same consecutive base-bar rule.

#### Scenario: Two base-bar confirmation triggers long exit

- **GIVEN** `confirm_bars=2` and two consecutive base bars with `close` below aligned EMA
- **WHEN** `ema_close_loss_exit` evaluates with `side="long"` on the second bar
- **THEN** that bar is `True`

#### Scenario: Single base-bar dip does not exit

- **GIVEN** `confirm_bars=2` and only one base bar satisfies `close < aligned EMA`
- **WHEN** evaluated on that bar with `side="long"`
- **THEN** the bar is `False`

### Requirement: EMA cross loss exit on one timeframe

The `ema_cross_loss_exit` component SHALL require `fast_ema` and `slow_ema` with `fast_ema.source == slow_ema.source == "close"`, `fast_ema.timeframe == slow_ema.timeframe`, and `fast_ema.period < slow_ema.period`. Multi-timeframe cross is out of v1.

When `confirm_bars=1`, on the **base index**: long MUST exit on the bar where fast crosses below slow (`fast < slow` now and `fast >= slow` on the prior base bar); short MUST exit on fast crossing above slow.

When `confirm_bars > 1`, it MUST require fast on the adverse side of slow for `confirm_bars` consecutive **base bars** (long: `fast < slow`; short: `fast > slow`) **and** a cross event within the rolling window of the last `confirm_bars` base bars (long: fast crosses below slow; short: fast crosses above slow).

#### Scenario: Classic bearish cross on base index

- **GIVEN** `confirm_bars=1`, same timeframe, prior base bar `fast >= slow`, current base bar `fast < slow`
- **WHEN** `ema_cross_loss_exit` runs with `side="long"`
- **THEN** the current base bar is `True`

#### Scenario: Mismatched cross timeframes rejected

- **GIVEN** `fast_ema.timeframe=5m` and `slow_ema.timeframe=1h`
- **WHEN** `ExitRuleSpec` is validated for `ema_cross_loss_exit`
- **THEN** validation fails with a clear error

#### Scenario: Confirmed cross with adverse hold

- **GIVEN** `confirm_bars=3`, a cross within the last three base bars, and three consecutive base bars with `fast < slow` (long)
- **WHEN** evaluated on the third bar with `side="long"`
- **THEN** that bar is `True`

#### Scenario: Adverse hold without cross in window does not exit

- **GIVEN** `confirm_bars=3` and three consecutive base bars with `fast < slow` but no cross in the last three base bars
- **WHEN** evaluated on the third bar with `side="long"`
- **THEN** that bar is `False`

### Requirement: ema_close_loss_exit field contract

For `component_id="ema_close_loss_exit"`, validation MUST require `exit_kind="signal"`, non-null `ema` with `source="close"`, and `confirm_bars >= 1`. It MUST forbid non-null `fast_ema`, `slow_ema`, `rsi`, `long_exit_above`, `short_exit_below`, `distance`, and `usd_distance`.

#### Scenario: Forbidden fast_ema on close loss

- **GIVEN** `ema_close_loss_exit` with both `ema` and `fast_ema` set
- **WHEN** the spec is validated
- **THEN** validation fails

### Requirement: ema_cross_loss_exit field contract

For `component_id="ema_cross_loss_exit"`, validation MUST require `exit_kind="signal"`, non-null `fast_ema` and `slow_ema` meeting single-timeframe close EMA rules above, and `confirm_bars >= 1`. It MUST forbid non-null `ema`, `rsi`, `long_exit_above`, `short_exit_below`, `distance`, and `usd_distance`.

#### Scenario: Forbidden ema on cross loss

- **GIVEN** `ema_cross_loss_exit` with `ema` set
- **WHEN** the spec is validated
- **THEN** validation fails

### Requirement: confirm_bars default is one

When `confirm_bars` is omitted at construction or load time, the system MUST default to **1** for both components (spec, builders, loader, and catalog defaults MUST agree).

#### Scenario: Omitted confirm_bars defaults to one

- **GIVEN** a valid instance omitting `confirm_bars` on `ema_close_loss_exit`
- **WHEN** loaded into `ExitRuleSpec`
- **THEN** `confirm_bars == 1`

### Requirement: No profile binding

The system MUST NOT require or validate profile placement for these component ids.

#### Scenario: Rule in always_on is valid

- **GIVEN** `ema_close_loss_exit` under `exit_policy.always_on.exits`
- **WHEN** the instance is loaded
- **THEN** loading succeeds

### Requirement: Feature plan includes exit-rule EMA columns

EMA features for `ema`, `fast_ema`, and `slow_ema` on exit rules in any exit_policy group MUST be planned and aligned to base, including periods outside `anchor_stack`.

#### Scenario: Exit EMA100 outside anchor stack

- **GIVEN** anchor stack 200/500/1000 and `fast_ema.period=100` on an exit rule
- **WHEN** the feature plan is built
- **THEN** the plan includes EMA100 at the rule timeframe, aligned to base

### Requirement: Instance payloads use nested EMA objects

Exit rule instance payloads MUST represent `ema`, `fast_ema`, and `slow_ema` as nested objects (not root-level flat `ema.timeframe` keys on the rule). The loader MUST parse nested objects and reject disallowed top-level keys.

#### Scenario: Nested ema block loads

- **GIVEN** `{ component_id: ema_close_loss_exit, instance_id: x, ema: { timeframe: 1h, source: close, period: 200 }, confirm_bars: 3 }`
- **WHEN** parsed by instance_loader
- **THEN** `ExitRuleSpec.ema` matches the nested object

### Requirement: Stop priority unchanged

Distance stops MUST retain priority over signal exits on the same bar (Step 16).

#### Scenario: Stop precedes signal

- **GIVEN** ATR stop and `ema_close_loss_exit` both true on bar *t*
- **WHEN** `exit_reason` is attributed
- **THEN** the reason reflects stop loss

### Requirement: Report spec roundtrip preserves exit EMA fields

`strategy_spec_from_report_dict` MUST deserialize `anchor_stack` EMAs and optional exit-rule `ema` / `fast_ema` / `slow_ema` without helper name collisions, so `strategy_spec_to_dict` → parse restores an equivalent `EmaPullbackStrategySpec`.

#### Scenario: Roundtrip from report dict

- **GIVEN** a strategy spec with exit rules using nested `ema` or `fast_ema` / `slow_ema`
- **WHEN** `strategy_spec_from_report_dict(strategy_spec_to_dict(spec))` is called
- **THEN** anchor stack and exit-rule EMA fields match the original spec
