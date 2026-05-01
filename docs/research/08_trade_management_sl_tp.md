# Research Stage 8 — Feature-based Trade Management / SL-TP

## Goal

Stage 8 вводит отдельный слой управления открытой сделкой:

```text
stop loss
take profit
time stop later
trailing stop later
partial exits later
```

Цель этапа — не придумать идеальный выход и не построить полноценный execution/risk engine, а создать **универсальную архитектуру stop loss / take profit** для research-backtest.

Главная идея:

```text
FeaturesDev готовит признаки, anchors и relations.
Trade Management использует их для расчёта уровней SL/TP.
run.py не должен содержать hardcoded stop/take logic.
entry components не должны отвечать за фиксацию прибыли/убытка.
```

---

## Why this stage is needed

После Stage 7 у нас появилась первая осмысленная entry-логика:

```text
direction:
  EMA20 > EMA200
  EMA200 > EMA500

setup:
  pullback to EMA200

trigger:
  reclaim EMA200
```

Но фиксация прибыли/убытка пока всё ещё слишком грубая:

```text
exit_component = ema_cross_down
```

Это означает, что сделка закрывается по обратному EMA-cross, а не по заранее определённой модели риска/прибыли.

Для нормального research нужно отдельно ответить:

```text
где стоп?
где тейк?
зависит ли стоп от ATR?
зависит ли тейк от feature target?
как это входит в config_id?
как массово тестировать разные SL/TP позже?
```

---

## Core boundary

Trade Management — это не FeaturesDev.

Trade Management — это не entry-логика.

Trade Management — это слой, который управляет уже открытой сделкой.

Правильная граница:

```text
FeaturesDev:
  готовит ATR, EMA anchors, HTF levels, volatility context, trend relations

Entry components:
  решают, когда можно войти

Trade Management:
  рассчитывает stop/take/time/trailing rules для открытой позиции

run.py:
  передаёт prepared entry/exit/trade-management rules в vectorbt
```

---

## Examples

### Example 1 — fixed percent SL/TP

Самый простой profile:

```text
trade_management_profile = fixed_pct_sl_tp
```

Пример правил:

```text
stop_loss_pct = 0.03
take_profit_pct = 0.06
```

Смысл:

```text
stop_loss = entry_price * (1 - 0.03)
take_profit = entry_price * (1 + 0.06)
```

Это самый простой baseline для проверки механизма.

---

### Example 2 — ATR-based stop

Feature-based profile:

```text
trade_management_profile = atr_multiple_stop
```

FeaturesDev готовит binding:

```text
trade_atr = atr_close_base_14
```

Trade Management использует:

```text
stop_loss = entry_price - 3 * trade_atr
```

Тейк может быть фиксированным R-multiple:

```text
take_profit = entry_price + 2 * stop_distance
```

---

### Example 3 — feature target take profit

FeaturesDev готовит target binding или relation:

```text
countertrend_ema = ema_close_base_500
```

Trade Management использует:

```text
take_profit = countertrend_ema
```

Идея:

```text
вышли не по фиксированному проценту,
а при встрече с подготовленным feature target
```

---

## What Stage 8 should implement first

Stage 8 должен быть минимальным.

На первом внедрении реализуем один простой profile:

```text
trade_management_profile = fixed_pct_sl_tp
```

Минимальная конфигурация:

```text
stop_loss_pct = 0.03
take_profit_pct = 0.06
```

Это не финальная торговая логика.  
Это baseline, который доказывает, что слой Trade Management подключается правильно.

Важно: даже если первый profile fixed-percent, архитектура должна позволять позже добавить feature-based варианты:

```text
atr_multiple_stop
atr_stop_to_feature_target
feature_target_take_profit
```

---

## Naming

Вводим отдельное понятие:

```text
TradeManagementProfile
```

И отдельное поле в `StrategyConfig`:

```text
trade_management_profile
```

Пример:

```text
trade_management_profile = "none"
trade_management_profile = "fixed_pct_sl_tp"
trade_management_profile = "atr_multiple_stop"
```

На первом этапе можно оставить default:

```text
trade_management_profile = "none"
```

и добавить новый variant, который использует:

```text
trade_management_profile = "fixed_pct_sl_tp"
```

---

## StrategyConfig impact

`StrategyConfig` должен получить поле:

```text
trade_management_profile
```

Это поле должно входить в deterministic `config_id`.

Причина:

```text
одинаковая entry-логика + разные SL/TP = разные strategy instances
```

`db_path` по-прежнему не входит в `config_id`.

Если в будущем profile будет иметь параметры, они тоже должны попадать в identity либо через имя profile, либо через deterministic profile payload/id.

---

## Where it should live

Минимальная структура Stage 8:

```text
research/strategies/ema_pullback/
  trade_management.py
```

Ответственность файла:

```text
описать TradeManagementProfile
хранить family-local profiles
resolve_trade_management_profile(...)
подготовить параметры/kwargs для backtest layer
```

Trade Management остаётся внутри `research/strategies/ema_pullback/`.

Не создавать global framework в `research/common`.

---

## Relation to vectorbt

Stage 8 не должен превращать проект в собственный execution engine.

Если vectorbt позволяет передавать stop loss / take profit в `Portfolio.from_signals`, используем этот механизм.

Но обёртка должна быть наша:

```text
trade_management.py
  profile -> portfolio kwargs / stop arrays / take arrays
```

`run.py` не должен содержать hardcoded values вроде:

```text
sl_stop = 0.03
tp_stop = 0.06
```

`run.py` должен только спросить Trade Management layer:

```text
какие параметры управления сделкой применить для этого StrategyInstance?
```

---

## Interaction with existing exit component

Сейчас есть exit component:

```text
exits_component = ema_cross_down
```

Stage 8 не обязан удалять его.

На первом этапе допускается такая схема:

```text
final_exit_signal = exit_component_output
trade_management_profile = fixed_pct_sl_tp
```

То есть сделка может закрыться:

```text
по exit signal
или по stop loss
или по take profit
```

Если vectorbt обрабатывает stop/take отдельно от exit signal, используем это.

Важно: Stage 8 не должен ломать существующий `ema_cross_down`.

---

## Interaction with FeaturesDev

На первом внедрении `fixed_pct_sl_tp` может не использовать features.

Но архитектурно Trade Management должен быть готов использовать FeaturesDev позже.

Правильная будущая схема:

```text
FeatureProfile:
  trade_atr = atr_close_base_14
  countertrend_ema = ema_close_base_500

TradeManagementProfile:
  stop = 3 * trade_atr
  take = countertrend_ema
```

Это значит:

```text
FeaturesDev готовит данные.
Trade Management использует prepared bindings/relations.
```

Trade Management не должен сам считать ATR/EMA.

---

## Proposed first variant

Старый Stage 7 variant оставить:

```text
ema_pullback_20_200_500_reclaim
```

Добавить новый variant для проверки Trade Management:

```text
ema_pullback_20_200_500_reclaim_fixed_sl_tp
```

Пример сборки:

```text
feature_profile = ema_pullback_20_200_500

direction_component = intraday_and_swing_trend_long
blockers_component = no_blockers
setup_component = pullback_to_entry_anchor
trigger_component = reclaim_entry_anchor
exits_component = ema_cross_down
risk_component = no_risk_filter

trade_management_profile = fixed_pct_sl_tp
```

Старый variant без SL/TP оставить как контроль.

---

## Files likely to change

Разрешённая зона:

```text
research/strategies/ema_pullback/config.py
research/strategies/ema_pullback/trade_management.py
research/strategies/ema_pullback/run.py
research/strategies/ema_pullback/variants.py
tests/...
docs/research/08_trade_management_sl_tp.md
```

Возможны точечные изменения:

```text
research/strategies/ema_pullback/signals.py
```

только если это нужно для clean handoff в backtest runner.

Не менять:

```text
data_engine/
backend indicators
execution/live trading
```

---

## Out of scope

Stage 8 не делает:

```text
ATR implementation
HTF target implementation
feature target TP implementation
trailing stop
breakeven stop
partial exits
multi-target exits
position sizing engine
portfolio manager
live risk engine
exchange execution
order routing
component grid
optimizer
YAML/JSON configs
frontend/visual constructor
data_engine changes
writes to operational SQLite
```

---

## Rollout steps

### Step 8.1 — Document the plan

Создать и принять этот документ.

Код не менять.

---

### Step 8.2 — Add trade management model

Создать:

```text
research/strategies/ema_pullback/trade_management.py
```

Добавить минимальные сущности:

```text
TradeManagementProfile
TRADE_MANAGEMENT_PROFILES
resolve_trade_management_profile(...)
```

---

### Step 8.3 — Add default and fixed profiles

Добавить profiles:

```text
none
fixed_pct_sl_tp
```

Пример параметров для первого fixed profile:

```text
stop_loss_pct = 0.03
take_profit_pct = 0.06
```

---

### Step 8.4 — Extend StrategyConfig

Добавить:

```text
trade_management_profile = "none"
```

Добавить `trade_management_profile` в `config_id`.

Проверить:

```text
changing trade_management_profile changes config_id
changing db_path still does not change config_id
```

---

### Step 8.5 — Wire run.py through Trade Management

`run.py` должен получать trade management profile из StrategyInstance/StrategyConfig и применять его при создании vectorbt portfolio.

Hardcoded SL/TP в `run.py` запрещён.

---

### Step 8.6 — Add manual variant

Добавить:

```text
ema_pullback_20_200_500_reclaim_fixed_sl_tp
```

Старые variants сохранить.

---

### Step 8.7 — Add tests

Проверить:

```text
default trade_management_profile exists
fixed_pct_sl_tp profile exists
resolve_trade_management_profile works
unknown profile fails clearly
trade_management_profile is included in config_id
db_path remains excluded from config_id
new fixed_sl_tp variant exists
old variants remain present
run metrics still include trades/PF/Sharpe/MaxDD
```

Если возможно без хрупких тестов, проверить, что fixed SL/TP profile влияет на portfolio/backtest result.

---

### Step 8.8 — Run acceptance commands

```bash
python -m pytest -q
python research/strategies/ema_pullback/run.py
python research/ema_smoke.py
git diff --stat data_engine/
git status -sb
```

---

### Step 8.9 — Add implementation summary

После реализации добавить summary:

```text
what changed
which files changed
what behavior was preserved
which tests were run
backtest output summary
confirmation that data_engine/ was not changed
```

---

## Acceptance result

Stage 8 считается успешным, если:

```text
1. Есть trade_management.py.
2. Есть profile none.
3. Есть profile fixed_pct_sl_tp.
4. StrategyConfig хранит trade_management_profile.
5. trade_management_profile входит в config_id.
6. run.py применяет trade management через отдельный слой, без hardcoded SL/TP.
7. Добавлен manual variant fixed_sl_tp.
8. Старые variants продолжают работать.
9. run.py печатает comparison table и status=ok.
10. research/ema_smoke.py остаётся рабочим.
11. Все тесты проходят.
12. data_engine/ не изменён.
```

---

## What to look at after backtest

После запуска смотрим:

```text
изменилось ли количество сделок
изменился ли PF
изменился ли MaxDD
изменился ли Sharpe
стали ли сделки закрываться раньше
ухудшился ли результат из-за слишком близкого стопа
слишком ли далеко тейк
```

Если MaxDD улучшился, но PF/Sharpe ухудшились:

```text
стоп, возможно, слишком близкий
```

Если PF вырос, но сделок стало мало или equity рваная:

```text
тейк/стоп делают стратегию слишком избирательной или слишком дискретной
```

Если ничего не изменилось:

```text
profile не применился
или stop/take параметры не работают так, как ожидается
```

---

## Architecture notes

Stage 8 — это не торговая стратегия.

Stage 8 — это слой управления открытой сделкой.

Главная граница:

```text
FeaturesDev:
  готовит признаки и уровни

Entry components:
  дают вход

Exit components:
  дают signal-based выход

Trade Management:
  задаёт SL/TP/time/trailing rules

run.py:
  запускает backtest и передаёт всё в vectorbt
```

Trade Management должен быть достаточно простым сейчас, но не должен быть тупиком.

Первый profile может быть fixed-percent, но архитектура должна позволить feature-based stop/take:

```text
stop = 3 * trade_atr
take = countertrend_ema
```

без переписывания entry components и без хардкода в runner.
