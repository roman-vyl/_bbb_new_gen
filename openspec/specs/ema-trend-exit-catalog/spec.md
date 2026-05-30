# ema-trend-exit-catalog Specification

## Purpose

Component catalog entries for `ema_close_loss_exit` and `ema_cross_loss_exit`: list slots, nested EMA param bindings, `confirm_bars` defaults, and Composer field paths consistent with `distance` / `rsi` patterns.

## Requirements

### Requirement: Catalog exposes trend EMA exits for any exit slot

The catalog SHALL list `ema_close_loss_exit` and `ema_cross_loss_exit` with `role="exits"` and `list_slot=True` for all exit list slots, without profile restrictions.

#### Scenario: Catalog lists close loss exit

- **WHEN** the catalog is fetched
- **THEN** `ema_close_loss_exit` is present with EMA and `confirm_bars` parameters

### Requirement: confirm_bars catalog default is one

The catalog `params_schema` for **both** components MUST default `confirm_bars` to **1**, matching `ExitRuleSpec` and instance_loader defaults.

#### Scenario: Close loss confirm_bars default

- **GIVEN** the catalog entry for `ema_close_loss_exit`
- **WHEN** a client reads the default for `confirm_bars`
- **THEN** the default is `1`

#### Scenario: Cross loss confirm_bars default

- **GIVEN** the catalog entry for `ema_cross_loss_exit`
- **WHEN** a client reads the default for `confirm_bars`
- **THEN** the default is `1`

### Requirement: Nested instance shape with Composer field paths

Persisted exit rules MUST use nested objects:

```yaml
ema:
  timeframe: 1h
  source: close
  period: 200
```

and for cross:

```yaml
fast_ema:
  timeframe: 5m
  source: close
  period: 100
slow_ema:
  timeframe: 5m
  source: close
  period: 200
```

Catalog `params_schema` MUST NOT define standalone root-level parameters that persist as flat `ema.timeframe` on the rule object. Field paths MAY use dot notation (`ema.timeframe`, `fast_ema.period`) **only** as Composer bindings that read and write the nested `ema` / `fast_ema` / `slow_ema` objects, consistent with the existing `distance.*` and `rsi.*` pattern.

#### Scenario: Composer writes nested ema object

- **GIVEN** a user edits `ema.period` in Composer for `ema_close_loss_exit`
- **WHEN** the draft instance is saved
- **THEN** the rule payload contains a nested `ema` object, not a root-level `ema.period` key

### Requirement: Cross catalog enforces single timeframe in schema UX

Catalog entries for `ema_cross_loss_exit` MUST expose `fast_ema` and `slow_ema` with the same timeframe field binding model; validation in research remains authoritative for `fast_ema.timeframe == slow_ema.timeframe`.

#### Scenario: Both legs use same timeframe field group

- **GIVEN** the catalog entry for `ema_cross_loss_exit`
- **WHEN** a client inspects parameter groups
- **THEN** `fast_ema.timeframe` and `slow_ema.timeframe` are present and documented as must match

### Requirement: Labels describe trend semantics

Labels MUST describe EMA close / cross trend-exit behavior and MUST NOT imply aligned-only usage.

#### Scenario: Human-readable label

- **WHEN** `ema_close_loss_exit` is shown in UI
- **THEN** the label references EMA close confirmation on base bars, not profile names
