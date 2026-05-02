# Research Stage 10 — EMA Pullback StrategySpec / Anchor Stack Refactor

## Цель

Добавить внутри существующей family `ema_pullback` новый путь задания strategy instance через `EmaPullbackStrategySpec`.

`ema_pullback` не переименовывать.

Старый путь через `FeatureProfile` / `FeatureRelation` не удалять в этом этапе.

Stage 10 должен добавить новый StrategySpec-based variant рядом со старыми variants.

Главное изменение Stage 10:

```text
параметры EMA, ATR и правил выхода задаются в StrategySpec,
а не жёстко зашиваются в features.py или trade_management.py
```

---

## Новый instance

Создать новый strategy instance:

```text
ema_pullback_fast20_anchor200_slow1000
```

Параметры EMA:

```text
fast EMA = EMA20
anchor EMA = EMA200
slow EMA = EMA1000
timeframe = base
source = close
```

Логика входа:

```text
direction:
  fast > anchor > slow

setup:
  pullback_to_anchor
  lookback = 3

trigger:
  reclaim_anchor
```

Trade Management:

```text
profile = rule_based

exit_rules:
  - stop_loss_by_distance:
      distance = ATR14 * 1.5

  - take_profit_by_distance:
      distance = ATR14 * 4.0
```

Важно:

```text
1.5 и 4.0 должны жить в StrategySpec,
а не в trade_management.py
и не как безусловный хардкод в features.py
```

---

## Новые файлы

Создать:

```text
research/strategies/ema_pullback/spec.py
research/strategies/ema_pullback/features/plan.py
```

---

## spec.py

Создать frozen dataclass:

```text
EmaSpec
AnchorStackSpec
PullbackSetupSpec
ReclaimTriggerSpec
AtrDistanceSpec
DistanceExitRuleSpec
TradeManagementSpec
EmaPullbackStrategySpec
```

`EmaSpec` должен содержать:

```text
source
timeframe
period
```

На Stage 10 разрешён только:

```text
timeframe = "base"
```

MTF alignment не делать.

`AnchorStackSpec` должен содержать:

```text
fast
anchor
slow
```

`PullbackSetupSpec` должен содержать:

```text
component_id = "pullback_to_anchor"
lookback = 3
```

`ReclaimTriggerSpec` должен содержать:

```text
component_id = "reclaim_anchor"
```

`AtrDistanceSpec` должен содержать:

```text
timeframe = "base"
period
multiplier
```

Для первого instance:

```text
stop distance:
  timeframe = "base"
  period = 14
  multiplier = 1.5

take distance:
  timeframe = "base"
  period = 14
  multiplier = 4.0
```

`DistanceExitRuleSpec` должен содержать:

```text
rule_type
distance
```

На Stage 10 разрешены только два `rule_type`:

```text
stop_loss_by_distance
take_profit_by_distance
```

`TradeManagementSpec` должен содержать:

```text
profile = "rule_based"
exit_rules: list[DistanceExitRuleSpec]
```

Для первого instance `exit_rules` должен содержать два правила:

```text
1. stop_loss_by_distance с distance = ATR14 * 1.5
2. take_profit_by_distance с distance = ATR14 * 4.0
```

`EmaPullbackStrategySpec` должен содержать:

```text
variant
symbol
base_timeframe
anchor_stack
setup
trigger
trade_management
```

---

## Почему exit_rules, а не stop_distance / take_distance

Сделка в будущем может закрываться по нескольким условиям:

```text
stop loss
take profit
достижение старшей EMA
RSI threshold
обратный сигнал
time stop
trailing stop
```

Поэтому в StrategySpec не надо зашивать модель “у сделки всегда есть только stop и take”.

Правильная модель:

```text
TradeManagementSpec:
  exit_rules = список правил выхода
```

В Stage 10 реализуем только два простых правила:

```text
stop_loss_by_distance
take_profit_by_distance
```

Но форма должна позволить позже добавить другие rule types без переделки StrategySpec.

---

## features/plan.py

Создать:

```text
PlannedFeature
FeaturePlan
build_feature_plan_from_strategy_spec(spec)
```

`FeaturePlan` ничего не считает.  
Он только описывает, какие features должны быть подготовлены.

Для instance `ema_pullback_fast20_anchor200_slow1000` `FeaturePlan` должен включать:

```text
ema_close_base_20
ema_close_base_200
ema_close_base_1000
atr_close_base_14
atr_close_base_14_x1_5
atr_close_base_14_x4_0
```

Где:

```text
atr_close_base_14_x1_5 появляется из exit_rule stop_loss_by_distance multiplier = 1.5
atr_close_base_14_x4_0 появляется из exit_rule take_profit_by_distance multiplier = 4.0
```

Дубликаты feature specs должны удаляться.

Если несколько exit rules используют одинаковый ATR period/timeframe, базовый `atr_close_base_14` не должен планироваться дважды.

---

## features/calculations.py

Добавить поддержку расчёта features из `FeaturePlan`.

Компоненты не должны сами считать EMA/ATR.

`features/calculations.py` должен уметь считать:

```text
EMA для запрошенных periods из FeaturePlan
ATR для запрошенных period/timeframe из FeaturePlan
prepared ATR-distance features из FeaturePlan
```

Пример:

```text
PlannedFeature:
  id = atr_close_base_14_x1_5
  kind = atr_distance
  base_atr = atr_close_base_14
  multiplier = 1.5
```

Тогда `features/calculations.py` считает:

```text
atr_close_base_14_x1_5 = atr_close_base_14 * 1.5
```

Не писать features в SQLite.  
Не добавлять backend indicators.  
Не хардкодить, что всегда нужны именно `1.5` и `4.0`.

---

## Components

Добавить или адаптировать компоненты так, чтобы новый StrategySpec path использовал роли:

```text
fast
anchor
slow
```

Новая direction-логика:

```text
fast > anchor > slow
```

Setup:

```text
low <= anchor за последние lookback свечей
```

Trigger:

```text
previous close <= previous anchor
current close > current anchor
```

Компоненты получают resolved column names.  
Компоненты не знают конкретные periods 20/200/1000.

---

## Trade Management

`trade_management.py` не должен знать ATR, период ATR или множители.

Он должен получить готовые distance columns из StrategySpec/FeaturePlan context:

```text
stop distance column для rule_type = stop_loss_by_distance
take distance column для rule_type = take_profit_by_distance
```

И применить их как относительные stop/take для vectorbt:

```text
sl_stop = stop_distance / close
tp_stop = take_distance / close
```

То есть:

```text
StrategySpec задаёт exit_rules.
FeaturePlan планирует distance features.
FeaturesDev считает distance columns.
TradeManagement применяет готовые distance columns.
```

На Stage 10 TradeManagement должен поддержать только:

```text
stop_loss_by_distance
take_profit_by_distance
```

Не реализовывать RSI/EMA-target/time-stop/trailing-stop в этом этапе.

---

## variants.py

Добавить новый variant:

```text
ema_pullback_fast20_anchor200_slow1000
```

Он должен быть построен через `EmaPullbackStrategySpec`.

Старые variants не удалять.

---

## Runner / execution

Новый variant должен запускаться тем же:

```bash
python research/strategies/ema_pullback/run.py
```

JSON report должен содержать новый variant.

Если нужно, JSON payload может добавить поле:

```text
strategy_spec
```

Но не ломать старые поля.

---

## Legacy path

Старый путь через `FeatureProfile` / `FeatureRelation` оставить рабочим.

В этом этапе запрещено удалять:

```text
FeatureProfile
FeatureRelation
старые variants
старые tests
```

Новый StrategySpec path добавляется рядом.

---

## Что не делать

```text
не переименовывать ema_pullback
не создавать ema_anchor_reaction
не удалять старые variants
не удалять FeatureProfile в этом этапе
не делать frontend
не делать component grid
не делать optimizer
не делать MTF alignment
не реализовывать RSI exits
не реализовывать HTF EMA target exits
не реализовывать time stop
не реализовывать trailing stop
не менять data_engine
не менять live/execution/order routing
```

---

## Tests

Добавить/обновить тесты:

```text
EmaSpec создаётся и валидирует timeframe = base
AnchorStackSpec содержит fast/anchor/slow
AtrDistanceSpec содержит timeframe/period/multiplier
DistanceExitRuleSpec принимает rule_type stop_loss_by_distance
DistanceExitRuleSpec принимает rule_type take_profit_by_distance
TradeManagementSpec содержит exit_rules
EmaPullbackStrategySpec создаётся для ema_pullback_fast20_anchor200_slow1000
build_feature_plan_from_strategy_spec возвращает EMA20/EMA200/EMA1000
FeaturePlan возвращает atr_close_base_14
FeaturePlan возвращает atr_close_base_14_x1_5 из exit_rule stop multiplier
FeaturePlan возвращает atr_close_base_14_x4_0 из exit_rule take multiplier
FeaturePlan удаляет дубликаты
features/calculations.py готовит нужные EMA columns из FeaturePlan
features/calculations.py готовит ATR-distance columns из FeaturePlan
direction fast > anchor > slow работает
setup pullback_to_anchor работает
trigger reclaim_anchor работает
trade_management использует готовые distance columns, а не ATR/multiplier напрямую
новый variant существует
новый variant построен через EmaPullbackStrategySpec
старые variants сохранены
JSON report содержит новый variant
```

Не завязывать тесты на точные live backtest metrics.

---

## Acceptance

Команды:

```bash
python -m pytest -q
python research/strategies/ema_pullback/run.py
python research/ema_smoke.py
git diff --stat data_engine/
git status -sb
```

Stage 10 готов, если:

```text
1. Внутри ema_pullback есть StrategySpec / AnchorStackSpec.
2. Новый instance задаётся через fast / anchor / slow.
3. ATR period, ATR timeframe и stop/take multipliers задаются в StrategySpec через exit_rules.
4. FeaturePlan строится из StrategySpec.
5. Features считаются из FeaturePlan.
6. TradeManagement применяет готовые distance columns.
7. Новый instance запускается через runner.
8. JSON report создаётся и содержит новый variant.
9. Старые variants продолжают работать.
10. Все тесты проходят.
11. research/ema_smoke.py работает.
12. data_engine/ не изменён.
```

---

## Главное правило

`ema_pullback` — это family.

`EmaPullbackStrategySpec` — это конкретный экземпляр этой family.

Frontend и будущий grid должны работать с `StrategySpec`, а не с ручными `intraday_trend` / `swing_trend` relations.

Параметры indicators и exit rules должны задаваться в `StrategySpec`, чтобы будущий grid/frontend могли менять их без изменения кода.
