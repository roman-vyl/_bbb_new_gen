## Why

Для **трендовых** сделок не хватает атомарных signal-exit правил. Нужны два компонента: устойчивое закрытие против опорной EMA и потеря импульса fast↔slow EMA. Placement — в любой слот `exit_policy` без привязки к профилю.

## What Changes

- `ema_close_loss_exit` и `ema_cross_loss_exit` в research + catalog.
- `ExitRuleSpec`: `ema` / `fast_ema` / `slow_ema`, `confirm_bars` (default **1** везде).
- **v1 timing:** `ema.timeframe` (и fast/slow) — timeframe **расчёта** индикатора; сигнал считается на **base index**; `confirm_bars` — **подряд base bars** после align HTF→base. HTF-candle confirmation не входит в v1.
- **v1 cross:** `fast_ema` и `slow_ema` на **одном** timeframe, `source=close`; multi-TF cross — не v1.
- Валидация required/forbidden fields per component_id.
- Instance YAML: **nested** `ema` / `fast_ema` / `slow_ema` (как `distance` / `rsi`), не плоские ключи на корне правила.

**Компонент 1 — `ema_close_loss_exit`**

| Параметр | Смысл |
|----------|--------|
| `ema.timeframe`, `ema.source` (= close), `ema.period` | EMA на своём TF, aligned на base |
| `confirm_bars` | Подряд **base** bars с `close` vs aligned EMA |

- **Long:** `close < EMA` на `confirm_bars` base bars подряд → exit  
- **Short:** `close > EMA` на `confirm_bars` base bars подряд → exit  

Пример: base `5m`, `ema.timeframe: 1h`, `confirm_bars: 3` → три **5m**-бара подряд с условием против EMA200(1h), align’нутой на 5m.

**Компонент 2 — `ema_cross_loss_exit`**

| Параметр | Смысл |
|----------|--------|
| `fast_ema`, `slow_ema` | Один TF, `source=close`, `fast.period < slow.period` |
| `confirm_bars` (default 1) | `1` = cross event; `>1` = adverse side **N base bars** подряд |

- **Long:** fast crosses below slow (при `confirm_bars=1`)  
- **Short:** fast crosses above slow  

README/examples для close loss могут рекомендовать `confirm_bars: 2` или `3`; контрактный default остаётся `1`.

## Capabilities

- `ema-trend-exit-signals`
- `ema-trend-exit-catalog`

## Non-goals

- HTF-candle confirmation (`confirm_bars` как число 1h-свечей).
- Multi-timeframe cross (`EMA100(5m)` vs `EMA200(1h)`).
- Profile binding, `time_stop`, trailing.
