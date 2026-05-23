## Context

Signal exits в `exit_policy` (profile-agnostic). Feature layer уже считает EMA на заданном timeframe и align’ит на base OHLCV index стратегии.

## Goals / Non-Goals

**Goals:** два EMA trend exit components; явная v1 семантика base bars + single-TF cross; строгая validation.

**Non-goals:** HTF-candle confirmation; multi-TF cross; profile-specific component ids.

## Decisions

### 1. Timeframe vs `confirm_bars` (v1)

In v1, `ema.timeframe` / `fast_ema.timeframe` / `slow_ema.timeframe` define **indicator calculation timeframe**.

The exit signal is evaluated on the **strategy base index** (base OHLCV bars).

`confirm_bars` counts **consecutive base bars** after HTF indicator values are aligned to base bars.

**HTF-candle confirmation is not part of v1** (no “three 1h closes” while on 5m base).

Example:

```yaml
base_timeframe: 5m
ema:
  timeframe: 1h
  period: 200
confirm_bars: 3
```

→ three consecutive **5m** bars where `close < EMA200(1h)` on the aligned series.

Implementation: use base `close` vs aligned EMA column; rolling `confirm_bars` on base index.

### 2. `ema_cross_loss_exit` — single timeframe (v1)

Hard rules:

```text
fast_ema.timeframe == slow_ema.timeframe
fast_ema.source == slow_ema.source == "close"
fast_ema.period < slow_ema.period
```

Multi-timeframe cross (e.g. EMA100(5m) vs EMA200(1h)) is **out of v1**.

### 3. `confirm_bars` default = 1 (single source of truth)

```text
ExitRuleSpec.confirm_bars: int = 1
catalog default for confirm_bars: 1 (both components)
instance_loader default when omitted: 1
```

Trading docs/README may **recommend** `confirm_bars: 2` or `3` for `ema_close_loss_exit`; that is guidance only, not a different code default.

### 4. Cross `confirm_bars` semantics (closed)

| `confirm_bars` | Behavior |
|----------------|----------|
| `1` | Classic cross event on current base bar (`shift(1)` vs prior bar) |
| `>1` | Bearish/bullish **cross** within last N base bars **and** adverse side held N consecutive base bars |

Long adverse: `fast < slow`. Short adverse: `fast > slow`.

**Close loss:** N consecutive base bars satisfying `close` vs aligned EMA (same base-bar counting).

### 5. `ExitRuleSpec` validation matrices

**`ema_close_loss_exit`**

Requires: `exit_kind == signal`, `ema != None`, `ema.source == close`, `confirm_bars >= 1`

Forbids: `fast_ema`, `slow_ema`, `rsi`, `long_exit_above`, `short_exit_below`, `distance`, `usd_distance`

**`ema_cross_loss_exit`**

Requires: `exit_kind == signal`, `fast_ema`, `slow_ema`, `fast_ema.source == slow_ema.source == close`, `fast_ema.timeframe == slow_ema.timeframe`, `fast_ema.period < slow_ema.period`, `confirm_bars >= 1`

Forbids: `ema`, `rsi`, `long_exit_above`, `short_exit_below`, `distance`, `usd_distance`

### 6. Instance shape — nested objects

Exit rules in instance/YAML MUST use nested objects (same family pattern as `rsi` / `distance`):

```yaml
- instance_id: ema_close_1
  component_id: ema_close_loss_exit
  ema:
    timeframe: 1h
    source: close
    period: 200
  confirm_bars: 3

- instance_id: ema_cross_1
  component_id: ema_cross_loss_exit
  fast_ema:
    timeframe: 5m
    source: close
    period: 100
  slow_ema:
    timeframe: 5m
    source: close
    period: 200
  confirm_bars: 1
```

`instance_loader` MUST reject unknown top-level keys and flat-only variants that bypass nesting.

**Catalog / Composer:** persisted config uses nested `ema` / `fast_ema` / `slow_ema`. Catalog `params_schema` field paths MAY use dot notation (`ema.timeframe`) only as UI bindings that read/write the nested object — same approach as `distance.*` → `distance: {}`, not as root-level flat `ema.timeframe` on the rule payload.

### 7. Profile-agnostic placement

Unchanged: no validator ties component to `aligned` / `countertrend` / `neutral`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Confusion base vs HTF bars | Document v1 rule in README + spec scenario |
| Accidental multi-TF cross | Validation on equal timeframe |

## Files (expected touch)

```text
research/strategies/ema_pullback/spec.py
research/strategies/ema_pullback/features/plan.py
research/strategies/ema_pullback/components/exits.py
research/strategies/ema_pullback/instance_loader.py
research_api/services/component_catalog.py
tests/test_ema_pullback_exit_ema_signals.py
```
